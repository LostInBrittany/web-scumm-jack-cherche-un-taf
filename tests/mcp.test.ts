// MCP server (tools/mcp/server.ts) driven by the SDK's stdio client, on games/demo (read-only calls) and on a
// temporary copy of it (writes), selected with GAME_DIR on the spawned process.
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const clients: Client[] = [];
const temps: string[] = [];

async function connect(env: Record<string, string>): Promise<Client> {
  const transport = new StdioClientTransport({
    command: TSX,
    args: [join(ROOT, 'tools', 'mcp', 'server.ts')],
    cwd: ROOT,
    env: { ...getDefaultEnvironment(), ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'mcp-test', version: '0' });
  await client.connect(transport);
  clients.push(client);
  return client;
}

type TextResult = { content: { type: string; text: string }[]; isError?: boolean };
async function call(c: Client, name: string, args: Record<string, unknown> = {}): Promise<TextResult> {
  return (await c.callTool({ name, arguments: args })) as TextResult;
}
const parse = (r: TextResult) => JSON.parse(r.content[0].text);

afterAll(async () => {
  for (const c of clients) await c.close();
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

describe('MCP server on games/demo', () => {
  let demo: Client;

  it('lists the tools and resources', async () => {
    demo = await connect({ GAME: 'demo' });
    const { tools } = await demo.listTools();
    const names = tools.map((t) => t.name);
    for (const n of [
      'list_rooms',
      'get_room',
      'set_layout',
      'set_text',
      'add_entity',
      'get_storyboard',
      'set_storyboard',
      'get_notes',
      'add_note',
      'validate',
      'solve',
      'screenshot',
      'read_doc',
      'run_tests',
      'asset_prompts',
      'content_report',
      'world_graph',
      'puzzle_graph',
      'dialogue_tree',
      'storyboard_coverage',
      'lint',
      'playtests',
    ])
      expect(names).toContain(n);
    const { resources } = await demo.listResources();
    expect(resources.map((r) => r.uri)).toEqual(expect.arrayContaining(['webscumm://game', 'webscumm://room/house']));
  }, 30000);

  it('list_rooms, get_room, validate, read_doc, resources', async () => {
    const info = parse(await call(demo, 'list_rooms'));
    expect(info.id).toBe('demo');
    expect(info.rooms.map((r: { id: string }) => r.id)).toContain('house');

    const room = parse(await call(demo, 'get_room', { id: 'house' }));
    expect(room.def.id).toBe('house');
    expect(room.texts.find((t: { path: string }) => t.path === 'look.pantry[0]')?.value).toBe(
      'The pantry cupboard. The sardines live in there.',
    );

    const v = parse(await call(demo, 'validate'));
    expect(v.ok).toBe(true);

    const classics = await call(demo, 'read_doc', { name: 'CLASSICS' });
    expect(JSON.stringify(classics)).toContain('insult');
    const doc = await call(demo, 'read_doc', { name: 'STUDIO' });
    expect(doc.content[0].text).toContain('# Studio');

    const res = await demo.readResource({ uri: 'webscumm://room/house' });
    expect(JSON.parse((res.contents[0] as { text: string }).text).def.id).toBe('house');
  }, 60000);

  it('asset_prompts returns the markdown and the missing ids', async () => {
    const r = (await demo.callTool({ name: 'asset_prompts', arguments: { missing: true } })) as TextResult & {
      structuredContent?: { missing: string[]; sheets: unknown[] };
    };
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain('## Style block');
    expect(r.structuredContent?.missing).toEqual([]);
    const full = await call(demo, 'asset_prompts');
    expect(full.content[0].text).toContain('#### Base sheet `neighbor`');
  }, 60000);

  it('turns core errors into tool errors', async () => {
    const r = await call(demo, 'get_room', { id: 'nowhere' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('unknown room');
    const ok = parse(await call(demo, 'solve', {}));
    expect({ status: ok.status, exit: ok.exit }).toEqual({ status: 'solved', exit: 0 });
    expect(ok.headline).toMatch(/^solved: the ending is reached/);
    const s = await call(demo, 'solve', { from: 'no-such-checkpoint' });
    expect(s.isError).toBe(true);
    // the server is still alive
    expect(parse(await call(demo, 'list_rooms')).id).toBe('demo');
  }, 60000);
});

describe('MCP server writes on a copy of the demo', () => {
  it('add_note then get_notes, set_text', async () => {
    mkdirSync(join(ROOT, '.cache'), { recursive: true });
    const dir = mkdtempSync(join(ROOT, '.cache', 'mcp-test-demo-'));
    temps.push(dir);
    const src = join(ROOT, 'games', 'demo');
    cpSync(src, dir, {
      recursive: true,
      filter: (f) => !/[\\/](art|audio|private)([\\/]|$)/.test(f.slice(src.length)),
    });
    const c = await connect({ GAME_DIR: dir });

    expect(parse(await call(c, 'get_notes')).entries ?? []).toEqual(expect.any(Array));
    const note = parse(await call(c, 'add_note', { about: 'house', text: 'Hello from MCP' }));
    expect(note).toMatchObject({ about: 'house', author: 'mcp-test', text: 'Hello from MCP' });
    const notes = parse(await call(c, 'get_notes'));
    expect(notes.entries.at(-1)).toMatchObject({ id: note.id, text: 'Hello from MCP' });

    const edit = parse(
      await call(c, 'set_text', { id: 'house', path: 'look.pantry[0]', value: 'A cupboard. Smells of fish.' }),
    );
    expect(edit).toMatchObject({ ok: true, changed: true });
    const room = parse(await call(c, 'get_room', { id: 'house' }));
    expect(room.texts.find((t: { path: string }) => t.path === 'look.pantry[0]')?.value).toBe(
      'A cupboard. Smells of fish.',
    );
  }, 60000);
});
