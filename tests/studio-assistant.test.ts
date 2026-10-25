// The Studio's Assistant: the tool registry shared with the MCP server (tools/studio/tools.ts), its JSON schemas, the
// agentic loop (tools/studio/assistant-loop.ts) against a fake provider in OpenAI and Anthropic formats, and the relay's
// HTTP routes (tools/studio/assistant.ts) on a temporary copy of games/demo.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endpoint, runAssistant, type AssistantEvent } from '../tools/studio/assistant-loop';
import { assistantHandler, parseProvider } from '../tools/studio/assistant';
import { coreBackend } from '../tools/studio/backend';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { callTool, jsonSchema, TOOLS, toolsFor, WRITING_TOOLS } from '../tools/studio/tools';

const ROOT = resolve(__dirname, '..');
const temps: string[] = [];
const servers: Server[] = [];
afterAll(async () => {
  for (const s of servers) s.close();
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

function copyDemo(): string {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.cache', 'assistant-test-demo-'));
  temps.push(dir);
  const src = join(ROOT, 'games', 'demo');
  cpSync(src, dir, { recursive: true, filter: (f) => !/[\\/](art|audio|private)([\\/]|$)/.test(f.slice(src.length)) });
  return dir;
}

const listen = (fn: (req: IncomingMessage, res: ServerResponse) => void) =>
  new Promise<string>((ok) => {
    const s = createServer(fn);
    servers.push(s);
    s.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(s.address() as AddressInfo).port}`));
  });
const body = (req: IncomingMessage) =>
  new Promise<any>((ok) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
    });
    req.on('end', () => ok(JSON.parse(s || '{}')));
  });

const KEY = 'sk-test-SECRET-123456';

/** A fake chat model: first a call to `validate`, then (once it sees a tool result) a final answer. */
interface Seen {
  path: string;
  headers: IncomingMessage['headers'];
  body: any;
}
async function fakeProvider(opts: { stream: boolean }) {
  const seen: Seen[] = [];
  const url = await listen(async (req, res) => {
    const b = await body(req);
    seen.push({ path: req.url ?? '', headers: req.headers, body: b });
    if (req.url === '/v1/chat/completions') {
      const done = b.messages.some((m: any) => m.role === 'tool');
      if (!opts.stream) {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify(
            done
              ? {
                  choices: [{ message: { role: 'assistant', content: 'The game validates: no errors.' } }],
                  usage: { prompt_tokens: 10, completion_tokens: 5 },
                }
              : {
                  choices: [
                    {
                      message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'validate', arguments: '{}' } }],
                      },
                    },
                  ],
                },
          ),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (delta: unknown, extra: object = {}) =>
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta }], ...extra })}\n\n`);
      if (done) {
        chunk({ content: 'The game ' });
        chunk({ content: 'validates: no errors.' });
      } else {
        chunk({ content: 'Let me check.' });
        chunk({
          tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'validate', arguments: '' } }],
        });
        chunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] });
      }
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    if (req.url === '/v1/messages') {
      const done = b.messages.some(
        (m: any) => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool_result'),
      );
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const ev = (type: string, data: object) =>
        res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev('message_start', { message: { usage: { input_tokens: 20, output_tokens: 1 } } });
      if (done) {
        ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'All good: ' } });
        ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'validate is ok.' } });
        ev('content_block_stop', { index: 0 });
        ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } });
      } else {
        ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } });
        ev('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'Check.' } });
        ev('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'sig' } });
        ev('content_block_stop', { index: 0 });
        ev('content_block_start', {
          index: 1,
          content_block: { type: 'tool_use', id: 'tu1', name: 'validate', input: {} },
        });
        ev('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{' } });
        ev('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '}' } });
        ev('content_block_stop', { index: 1 });
        ev('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } });
      }
      ev('message_stop', {});
      res.end();
      return;
    }
    res.statusCode = 404;
    res.end('{"error":{"message":"no"}}');
  });
  return { url, seen };
}

const demoDir = copyDemo();
const studio = createStudio({ gameDir: demoDir, root: ROOT, importFresh: (f) => importInChild(f, ROOT) });
const backend = coreBackend(studio, { root: ROOT, devUrl: 'http://127.0.0.1:9/' });

describe('tool registry', () => {
  it('exposes the same tools as the MCP server', async () => {
    const transport = new StdioClientTransport({
      command: join(ROOT, 'node_modules', '.bin', 'tsx'),
      args: [join(ROOT, 'tools', 'mcp', 'server.ts')],
      cwd: ROOT,
      env: { ...getDefaultEnvironment(), GAME: 'demo' },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'assistant-test', version: '0' });
    await client.connect(transport);
    const { tools } = await client.listTools();
    await client.close();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    expect(TOOLS).toHaveLength(27); // get_ir since 4.1.12, speedrun_verify since 4.1.14, search_docs and list_docs since 4.5.0
    expect(
      toolsFor(backend)
        .map((t) => t.name)
        .sort(),
    ).toEqual(TOOLS.map((t) => t.name).sort());
    expect([...WRITING_TOOLS].sort()).toEqual([
      'add_entity',
      'add_note',
      'set_layout',
      'set_storyboard',
      'set_text',
      'set_value',
    ]);
  }, 30000);

  it('produces plain JSON schemas', () => {
    for (const t of TOOLS) {
      const s = jsonSchema(t);
      expect(s.type).toBe('object');
      expect(JSON.stringify(s)).not.toMatch(/prefixItems|propertyNames|\$schema/);
    }
    const add = jsonSchema(TOOLS.find((t) => t.name === 'add_entity')!) as any;
    expect(add.required).toEqual(expect.arrayContaining(['id', 'kind', 'entityId']));
    expect(add.properties.kind.enum).toEqual(['prop', 'hotspot', 'actor']);
    expect(add.properties.at).toMatchObject({ type: 'array', minItems: 2, maxItems: 2 });
    const setText = jsonSchema(TOOLS.find((t) => t.name === 'set_text')!) as any;
    expect(setText.required).toEqual(expect.arrayContaining(['id', 'path', 'value']));
  });

  it('a backend without optional abilities loses their tools; bad arguments are tool errors', async () => {
    const { screenshot: _s, readDoc: _r, docs: _d, runTests: _t, assetPrompts: _a, ...plain } = backend;
    expect(toolsFor(plain).map((t) => t.name)).not.toEqual(expect.arrayContaining(['screenshot']));
    expect(toolsFor(plain)).toHaveLength(21);
    const r = await callTool('get_room', { nope: 1 }, backend);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('bad arguments for get_room');
    expect((await callTool('nothing', {}, backend)).content[0].text).toContain('no such tool');
  });
});

describe('agentic loop', () => {
  beforeAll(() => {
    expect(endpoint('https://api.mistral.ai/v1/', 'chat/completions')).toBe(
      'https://api.mistral.ai/v1/chat/completions',
    );
  });

  const run = async (kind: 'openai' | 'anthropic' | 'ollama', baseUrl: string, apiKey?: string) => {
    const events: AssistantEvent[] = [];
    await runAssistant({
      provider: { kind, baseUrl, model: 'fake-1', apiKey },
      system: 'You help.',
      backend,
      messages: [{ role: 'user', content: 'Is the game valid?' }],
      emit: (e) => events.push(e),
    });
    return events;
  };
  const text = (ev: AssistantEvent[]) =>
    ev
      .filter((e) => e.type === 'text')
      .map((e) => (e as { delta: string }).delta)
      .join('');

  it('OpenAI format, streamed: calls validate and returns the answer', async () => {
    const p = await fakeProvider({ stream: true });
    const ev = await run('openai', p.url, KEY);
    expect(ev.find((e) => e.type === 'error')).toBeUndefined();
    expect(ev.find((e) => e.type === 'tool_call')).toMatchObject({ name: 'validate', args: {} });
    const res = ev.find((e) => e.type === 'tool_result') as { result: string };
    expect(JSON.parse(res.result).ok).toBe(true);
    expect(text(ev)).toBe('Let me check.The game validates: no errors.');
    expect(ev.at(-1)).toMatchObject({ type: 'done', wrote: [] });
    expect(p.seen).toHaveLength(2);
    expect(p.seen[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(p.seen[0].body.tools.map((t: any) => t.function.name)).toContain('set_text');
    expect(p.seen[0].body.messages[0]).toMatchObject({ role: 'system', content: 'You help.' });
    // The second request carries the tool call and its result.
    const m = p.seen[1].body.messages;
    expect(m.at(-2)).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'c1', function: { name: 'validate' } }] });
    expect(m.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
    expect(JSON.stringify(ev)).not.toContain(KEY);
  }, 60000);

  it('OpenAI format, not streamed (Ollama without a key)', async () => {
    const p = await fakeProvider({ stream: false });
    const ev = await run('ollama', `${p.url}/v1`);
    expect(text(ev)).toBe('The game validates: no errors.');
    expect(ev.at(-1)).toMatchObject({ type: 'done', usage: { input: 10, output: 5 } });
    expect(p.seen[0].headers.authorization).toBeUndefined();
  }, 60000);

  it('Anthropic format, streamed: tool_use, tool_result, thinking blocks sent back', async () => {
    const p = await fakeProvider({ stream: true });
    const ev = await run('anthropic', p.url, KEY);
    expect(ev.find((e) => e.type === 'error')).toBeUndefined();
    expect(ev.find((e) => e.type === 'tool_call')).toMatchObject({ id: 'tu1', name: 'validate', args: {} });
    expect(text(ev)).toBe('All good: validate is ok.');
    expect(p.seen[0].headers['x-api-key']).toBe(KEY);
    expect(p.seen[0].headers['anthropic-version']).toBe('2023-06-01');
    expect(p.seen[0].headers['anthropic-dangerous-direct-browser-access']).toBeUndefined();
    expect(p.seen[0].body).toMatchObject({ model: 'fake-1', system: 'You help.', stream: true });
    expect(p.seen[0].body.tools[0]).toHaveProperty('input_schema');
    const m = p.seen[1].body.messages;
    expect(m[1]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Check.', signature: 'sig' },
        { type: 'tool_use', id: 'tu1', name: 'validate', input: {} },
      ],
    });
    expect(m[2]).toMatchObject({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1' }] });
    expect(ev.at(-1)).toMatchObject({ type: 'done', usage: { input: 40, output: 10 } });
  }, 60000);

  it('a provider error is an error event without the key', async () => {
    const url = await listen((_req, res) => {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}` } }));
    });
    const ev = await run('openai', url, KEY);
    const err = ev.find((e) => e.type === 'error') as { message: string };
    expect(err.message).toContain('401');
    expect(err.message).not.toContain(KEY);
    expect(ev.at(-1)?.type).toBe('done');
  });
});

describe('relay routes', () => {
  let base = '';
  beforeAll(async () => {
    const handler = assistantHandler(studio, {
      root: ROOT,
      devUrl: () => 'http://127.0.0.1:9/',
      allowCustomProvider: true,
      allowPrivateProviderForTests: true,
    });
    base = await listen((req, res) => {
      req.url = (req.url ?? '').replace(/^\/__studio\/api\/assistant/, '');
      void handler(req, res, () => {
        res.statusCode = 404;
        res.end('{"error":"no such endpoint"}');
      });
    });
  });

  it('POST assistant/chat streams the events of the loop', async () => {
    const p = await fakeProvider({ stream: true });
    const r = await fetch(`${base}/__studio/api/assistant/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: { kind: 'openai', baseUrl: p.url, model: 'fake-1', apiKey: KEY },
        messages: [{ role: 'user', content: 'Is the game valid?' }],
        context: { label: 'house › pantry (prop)', room: 'house', entity: { kind: 'prop', id: 'pantry' } },
      }),
    });
    expect(r.headers.get('content-type')).toContain('text/event-stream');
    const raw = await r.text();
    const ev = raw
      .split('\n\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)) as AssistantEvent);
    expect(ev.map((e) => e.type)).toEqual(expect.arrayContaining(['text', 'tool_call', 'tool_result', 'done']));
    expect(raw).not.toContain(KEY);
    // The system prompt: AGENTS.md, the game, the selection and its texts.
    const sys = p.seen[0].body.messages[0].content as string;
    expect(sys).toContain('A game is data, never code');
    expect(sys).toContain('About: house › pantry (prop)');
    expect(sys).toContain('look.pantry[0] = "The pantry cupboard. The sardines live in there."');
    expect(sys).toContain('ask before destructive changes'.replace('ask', 'Ask'));
  }, 60000);

  it('POST assistant/chat refuses a bad request', async () => {
    const r = await fetch(`${base}/__studio/api/assistant/chat`, {
      method: 'POST',
      body: JSON.stringify({ provider: { kind: 'x' }, messages: [] }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain('provider.kind');
  });

  it('POST assistant/task writes a task note', async () => {
    const r = await fetch(`${base}/__studio/api/assistant/task`, {
      method: 'POST',
      body: JSON.stringify({ about: 'house.pantry', text: 'Write 3 look lines' }),
    });
    const note = await r.json();
    expect(note).toMatchObject({ about: 'house.pantry', author: 'you', text: 'Write 3 look lines', task: true });
    const file = JSON.parse(readFileSync(join(demoDir, 'notes.json'), 'utf8'));
    expect(file.entries.at(-1)).toMatchObject({ id: note.id, task: true });
  });
});

describe('provider URL policy', () => {
  it('allows presets and explicit local Ollama, but blocks SSRF destinations', () => {
    expect(parseProvider({ kind: 'openai', baseUrl: 'https://api.openai.com', model: 'gpt' }).baseUrl).toBe(
      'https://api.openai.com',
    );
    expect(parseProvider({ kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'qwen' }).kind).toBe('ollama');
    expect(() => parseProvider({ kind: 'openai', baseUrl: 'http://169.254.169.254/latest', model: 'x' }, true)).toThrow(
      /HTTPS|private/,
    );
    expect(() => parseProvider({ kind: 'openai', baseUrl: 'https://example.test', model: 'x' })).toThrow(/disabled/);
    expect(parseProvider({ kind: 'openai', baseUrl: 'https://example.test/v1', model: 'x' }, true).baseUrl).toContain(
      'example.test',
    );
  });
});
