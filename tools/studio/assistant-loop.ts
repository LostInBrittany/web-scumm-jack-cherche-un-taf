// The Assistant's agentic loop, vendor-neutral and without SDK: it calls a chat model (OpenAI-compatible
// /v1/chat/completions: OpenAI, Mistral, Ollama, most others; or Anthropic's /v1/messages), runs the tool calls through
// the Studio's tool registry (tools/studio/tools.ts) and reports what happens as events. Plain `fetch` and web streams:
// the dev server runs it (tools/studio/assistant.ts) and so does the Studio page in demo mode (src/studio/assistant.ts).
// The API key is only ever put in a request header: never in an event, an error message or a log.
import { callTool, jsonSchema, toolsFor, type ToolBackend, type ToolResult } from './tools';
import type { GameInfo, RoomData } from './types';

export type ProviderKind = 'openai' | 'anthropic' | 'ollama';
export interface Provider {
  kind: ProviderKind;
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/** The conversation as the page keeps it: plain text turns (tool calls of earlier turns are not replayed). */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** What the author has selected in the Studio when they ask. */
export interface AssistantContext {
  /** "house › pantry (prop)", "Storyboard › The pantry", "the whole game". */
  label?: string;
  tab?: string;
  room?: string;
  entity?: { kind: 'prop' | 'hotspot' | 'actor'; id: string };
  /** The selected storyboard panel (as edited in the page, maybe unsaved). */
  panel?: { id: string; title?: string; board?: string; data?: unknown };
}

export interface Usage {
  input: number;
  output: number;
}

export type AssistantEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: string; isError?: boolean }
  | { type: 'done'; usage?: Usage; wrote?: string[]; stopped?: boolean }
  | { type: 'error'; message: string };

export interface LoopOptions {
  provider: Provider;
  system: string;
  messages: ChatTurn[];
  backend: ToolBackend;
  emit: (ev: AssistantEvent) => void;
  signal?: AbortSignal;
  /** Tool rounds before stopping (default 12). */
  maxRounds?: number;
  /** In a page: Anthropic needs its direct-browser-access header, and network errors get a CORS explanation. */
  browser?: boolean;
  fetch?: typeof fetch;
  /** Deadline of one provider call (default 60 s). */
  timeoutMs?: number;
}

export const MAX_ROUNDS = 12;
/** A tool result in an event is cut at 4 KB; what the model reads at 32 KB. */
const EVENT_RESULT_MAX = 4096;
const MODEL_RESULT_MAX = 32 * 1024;
const cut = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n)}\n… [truncated, ${s.length - n} more characters]` : s;

/** Tools that change files (the Studio refreshes after them). */
export { WRITING_TOOLS } from './tools';

export class ProviderError extends Error {}

/** A provider must answer within this time, and its answer is read up to this size: a relay never hangs or swells. */
export const PROVIDER_TIMEOUT_MS = 60000;
export const PROVIDER_MAX_BYTES = 8 * 1024 * 1024;

/**
 * `fetch` for a provider: redirects are not followed (a redirect could send the vetted request to another host), a
 * deadline applies on top of the caller's signal. The caller reads the body through `readCapped` / `sse`.
 */
export async function providerFetch(
  f: typeof fetch,
  url: string,
  init: RequestInit,
  o: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Response> {
  const timeoutMs = o.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = o.signal ? AbortSignal.any([timeout, o.signal]) : timeout;
  let res: Response;
  try {
    res = await f(url, { ...init, redirect: 'manual', signal });
  } catch (e) {
    if (timeout.aborted && !o.signal?.aborted)
      throw new ProviderError(`${url} did not answer within ${Math.round(timeoutMs / 1000)} s`);
    throw e;
  }
  if ((res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect')
    throw new ProviderError(
      `${url} answered with a redirect (${res.status || 'opaque'}): refused, a provider must answer at its own address`,
    );
  return res;
}

/** The body as text, at most `max` bytes: beyond, the answer is refused. */
export async function readCapped(res: Response, max = PROVIDER_MAX_BYTES): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let out = '',
    size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new ProviderError(`the provider's answer exceeds ${Math.round(max / 1024 / 1024)} MB`);
    }
    out += dec.decode(value, { stream: true });
  }
  return out + dec.decode();
}

// ---------------------------------------------------------------------------------------------------- the prompt

/** The texts the selection is about, for the system prompt. */
export async function contextDetails(ctx: AssistantContext | undefined, b: ToolBackend): Promise<string> {
  if (!ctx) return '';
  const out: string[] = [];
  if (ctx.room) {
    let room: RoomData | undefined;
    try {
      room = await b.room(ctx.room);
    } catch {
      /* unknown room: the label is enough */
    }
    if (room) {
      let texts = room.texts;
      if (ctx.entity) {
        const id = ctx.entity.id;
        const sec = { prop: 'props', hotspot: 'hotspots', actor: 'actors' }[ctx.entity.kind];
        const rules = new Set<number>();
        (room.def.on ?? []).forEach((r, i) => {
          if (JSON.stringify(r).includes(`"${id}"`)) rules.add(i);
        });
        texts = texts.filter(
          (t) =>
            t.path.startsWith(`look.${id}`) ||
            t.path.startsWith(`${sec}.${id}.`) ||
            t.path.startsWith(`talk.${id}`) ||
            [...rules].some((i) => t.path.startsWith(`on[${i}]`)),
        );
        const def = (room.def as unknown as Record<string, Record<string, unknown> | undefined>)[sec]?.[id];
        if (def) out.push(`Its definition (${sec}.${id}): ${cut(JSON.stringify(def), 3000)}`);
      }
      out.push(
        `Texts (path = value; edit with set_text on room "${ctx.room}"):`,
        ...cut(
          texts.map((t) => `- ${t.path}${t.who ? ` [${t.who}]` : ''} = ${JSON.stringify(t.value)}`).join('\n') ||
            '(none)',
          8000,
        ).split('\n'),
      );
    }
  }
  if (ctx.panel)
    out.push(
      `The storyboard panel "${ctx.panel.id}"${ctx.panel.board ? ` of board "${ctx.panel.board}"` : ''} as shown in the Studio: ${cut(JSON.stringify(ctx.panel.data ?? ctx.panel), 6000)}`,
    );
  return out.join('\n');
}

/** The system prompt: the repository rules (AGENTS.md), the game, the selection, and how to behave. */
export function systemPrompt(o: {
  agents: string;
  info?: GameInfo;
  context?: AssistantContext;
  details?: string;
}): string {
  const i = o.info;
  const game = i
    ? [
        `Game "${i.title}" (id ${i.id}), hero "${i.hero}".`,
        `Rooms: ${i.rooms.map((r) => `${r.id} (${r.name})`).join(', ')}.`,
        `Characters: ${Object.entries(i.characters)
          .map(([k, c]) => `${k} (${c.name})`)
          .join(', ')}.`,
        `Items: ${
          Object.entries(i.items)
            .map(([k, it]) => `${k} (${it.name})`)
            .join(', ') || 'none'
        }.`,
        `Checkpoints: ${Object.keys(i.checkpoints ?? {}).join(', ') || 'none'}.`,
      ].join('\n')
    : '';
  return [
    "You are the Assistant inside the quest'n'click Studio, helping a human author complete their point-and-click game.",
    'You act through the tools (the same ones the MCP server exposes): read before you write, then validate (and solve when the logic changed).',
    'Ask before destructive changes (deleting lines, replacing a layout or the whole storyboard, renaming); small additions the author asked for are fine.',
    "Keep the game's voice: short, kind, funny lines, in the language the game is written in. Never invent coordinates.",
    'Answer briefly; when you changed something, say what (room, path) in one line each.',
    '',
    '# Repository rules (AGENTS.md)',
    o.agents.trim(),
    '',
    '# The game',
    game,
    '',
    '# What the author has selected',
    o.context?.label ? `About: ${o.context.label}` : 'About: the whole game.',
    o.details ?? '',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------------- the loop

const trim = (u: string) => u.trim().replace(/\/+$/, '');
/** `<base>/v1/<path>`, whether or not the base already ends in /v1. */
export const endpoint = (base: string, path: string) => {
  const b = trim(base);
  return /\/v1$/.test(b) ? `${b}/${path}` : `${b}/v1/${path}`;
};

/** Server-sent events of a response body: { event, data } per block. */
async function* sse(
  body: ReadableStream<Uint8Array>,
  max = PROVIDER_MAX_BYTES,
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '',
    size = 0;
  const parse = (block: string) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    return data.length ? { event, data: data.join('\n') } : null;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new ProviderError(`the provider's stream exceeds ${Math.round(max / 1024 / 1024)} MB`);
    }
    buf += dec.decode(value, { stream: true });
    let m: RegExpExecArray | null;
    while ((m = /\r?\n\r?\n/.exec(buf))) {
      const ev = parse(buf.slice(0, m.index));
      buf = buf.slice(m.index + m[0].length);
      if (ev) yield ev;
    }
  }
  const last = parse(buf);
  if (last) yield last;
}

export interface Call {
  id: string;
  name: string;
  args: string;
}
interface Round {
  calls: Call[];
  usage: Usage;
}

// ---------------------------------------------------------------------------------------------------- what a provider says
// A provider's answer is untrusted JSON: each reader below takes it as `unknown` and keeps only the fields the loop
// uses, with the type it needs. A field of the wrong type is ignored, as a missing one is; a chunk that is not an
// object carries nothing. Only an `error` the provider sends stops the turn (with its message).

type Json = Record<string, unknown>;
/** The named fields of a JSON value (an array or an object; anything else has none). */
const rec = (v: unknown): Json | undefined => (v !== null && typeof v === 'object' ? (v as Json) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
/** A provider's `error` (an object with a message, or anything else) as a line. */
const errorText = (e: unknown): string => String(rec(e)?.message ?? JSON.stringify(e));

/** The message of a provider's error answer (a non-2xx body): `error.message`, `error`, `message`, else the text. */
export function errorBodyMessage(text: string): string {
  let msg: unknown = text;
  try {
    const j = rec(JSON.parse(text));
    if (j) msg = rec(j.error)?.message ?? j.error ?? j.message ?? text;
  } catch {
    /* not JSON */
  }
  return typeof msg === 'string' ? msg : String(JSON.stringify(msg));
}

/** One tool call fragment of an OpenAI-compatible stream chunk (fragments of one call share an index). */
export interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  args?: string;
}
/** What one OpenAI-compatible stream chunk carries for the loop. */
export interface OpenAIChunk {
  error?: string;
  usage?: Usage;
  text?: string;
  toolCalls: ToolCallDelta[];
}

const openaiUsage = (v: unknown): Usage | undefined => {
  if (!v) return undefined;
  const o = rec(v);
  return { input: num(o?.prompt_tokens) ?? 0, output: num(o?.completion_tokens) ?? 0 };
};

/** Reads one parsed `data:` chunk of an OpenAI-compatible stream (choices[0].delta, usage, error). */
export function readOpenAIChunk(data: unknown): OpenAIChunk {
  const j = rec(data) ?? {};
  if (j.error) return { error: errorText(j.error), toolCalls: [] };
  const out: OpenAIChunk = { toolCalls: [] };
  const usage = openaiUsage(j.usage);
  if (usage) out.usage = usage;
  const d = rec(rec(rec(j.choices)?.[0])?.delta);
  if (!d) return out;
  if (typeof d.content === 'string' && d.content) out.text = d.content;
  const list = Array.isArray(d.tool_calls) ? d.tool_calls : [];
  list.forEach((x: unknown, k: number) => {
    const tc = rec(x);
    if (!tc) return;
    const fn = rec(tc.function);
    const a = fn?.arguments;
    out.toolCalls.push({
      index: typeof tc.index === 'number' ? tc.index : k,
      ...(tc.id ? { id: String(tc.id) } : {}),
      ...(fn?.name ? { name: String(fn.name) } : {}),
      ...(a ? { args: typeof a === 'string' ? a : JSON.stringify(a) } : {}),
    });
  });
  return out;
}

/** Reads a whole (non-streamed) OpenAI-compatible answer: choices[0].message (content, tool_calls) and usage. */
export function readOpenAIMessage(data: unknown): { text?: string; calls: Call[]; usage?: Usage } {
  const j = rec(data) ?? {};
  const m = rec(rec(rec(j.choices)?.[0])?.message) ?? {};
  const calls: Call[] = [];
  for (const x of Array.isArray(m.tool_calls) ? m.tool_calls : []) {
    const tc = rec(x);
    if (!tc) continue;
    const fn = rec(tc.function);
    const a = fn?.arguments;
    calls.push({
      id: typeof tc.id === 'string' ? tc.id : '',
      name: typeof fn?.name === 'string' ? fn.name : '',
      args: typeof a === 'string' ? a : JSON.stringify(a ?? {}),
    });
  }
  const usage = openaiUsage(j.usage);
  return {
    ...(typeof m.content === 'string' && m.content ? { text: m.content } : {}),
    calls,
    ...(usage ? { usage } : {}),
  };
}

/** An Anthropic content block as received (text, tool_use, thinking…): sent back as it came. */
export type Block = Json;
/** The state of an Anthropic stream being read: the blocks by index, the partial JSON of tool inputs, the usage. */
export interface AnthropicStream {
  blocks: Block[];
  partial: Map<number, string>;
  usage: Usage;
}
/** A block index: a non-negative integer (anything else addresses no block). */
const slot = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Applies one parsed Anthropic stream event to `st`; returns the text to show, if any. An `error` event throws its
 * message. Unknown events, and fields of the wrong type, are ignored.
 */
export function anthropicEvent(st: AnthropicStream, data: unknown): string | undefined {
  const j = rec(data) ?? {};
  const i = slot(j.index);
  switch (j.type) {
    case 'message_start': {
      const mu = rec(rec(j.message)?.usage);
      st.usage.input += num(mu?.input_tokens) ?? 0;
      st.usage.output += num(mu?.output_tokens) ?? 0;
      return undefined;
    }
    case 'content_block_start': {
      if (i === undefined) return undefined;
      const cb = rec(j.content_block);
      st.blocks[i] = { ...cb };
      if (cb?.type === 'tool_use') st.partial.set(i, '');
      return undefined;
    }
    case 'content_block_delta': {
      // A delta for a block never started opens a text block (a stray index: the text is still shown).
      const b: Block = i === undefined ? { type: 'text', text: '' } : (st.blocks[i] ??= { type: 'text', text: '' });
      const d = rec(j.delta) ?? {};
      if (d.type === 'text_delta') {
        if (typeof d.text !== 'string') return undefined;
        b.text = str(b.text) + d.text;
        return d.text;
      }
      if (d.type === 'input_json_delta') {
        if (i !== undefined && typeof d.partial_json === 'string')
          st.partial.set(i, (st.partial.get(i) ?? '') + d.partial_json);
      } else if (d.type === 'thinking_delta') {
        if (typeof d.thinking === 'string') b.thinking = str(b.thinking) + d.thinking;
      } else if (d.type === 'signature_delta') {
        if (typeof d.signature === 'string') b.signature = str(b.signature) + d.signature;
      }
      return undefined;
    }
    case 'content_block_stop': {
      const b = i === undefined ? undefined : st.blocks[i];
      if (b?.type === 'tool_use' && i !== undefined) {
        const s = st.partial.get(i) ?? '';
        b.input = s.trim() ? s : {};
      }
      return undefined;
    }
    case 'message_delta':
      st.usage.output = Math.max(st.usage.output, num(rec(j.usage)?.output_tokens) ?? 0);
      return undefined;
    case 'error':
      throw new ProviderError(`anthropic: ${errorText(j.error)}`);
  }
  return undefined;
}

/** Reads a whole (non-streamed) Anthropic answer: its content blocks (objects only) and usage. */
export function readAnthropicMessage(data: unknown): { blocks: Block[]; usage: Usage } {
  const j = rec(data) ?? {};
  const blocks: Block[] = [];
  if (Array.isArray(j.content))
    for (const x of j.content) {
      const b = rec(x);
      if (b && !Array.isArray(x)) blocks.push(b);
    }
  const ju = rec(j.usage);
  return { blocks, usage: { input: num(ju?.input_tokens) ?? 0, output: num(ju?.output_tokens) ?? 0 } };
}

/** The tool calls of Anthropic content blocks (`tool_use`): id, name and input as JSON text. */
export function anthropicCalls(blocks: Block[]): Call[] {
  return blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({
      id: typeof b.id === 'string' ? b.id : '',
      name: typeof b.name === 'string' ? b.name : '',
      args: typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {}),
    }));
}

export async function runAssistant(o: LoopOptions): Promise<void> {
  const f = o.fetch ?? globalThis.fetch.bind(globalThis);
  const key = o.provider.apiKey?.trim();
  const redact = (s: string) => (key && key.length > 3 ? s.split(key).join('***') : s);
  const tools = toolsFor(o.backend);
  const usage: Usage = { input: 0, output: 0 };
  const wrote = new Set<string>();
  const max = o.maxRounds ?? MAX_ROUNDS;
  const url = endpoint(o.provider.baseUrl, o.provider.kind === 'anthropic' ? 'messages' : 'chat/completions');

  const post = async (body: unknown, headers: Record<string, string>): Promise<Response> => {
    let res: Response;
    try {
      res = await providerFetch(
        f,
        url,
        { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
        { signal: o.signal, timeoutMs: o.timeoutMs },
      );
    } catch (e) {
      if (o.signal?.aborted || e instanceof ProviderError) throw e;
      const why = e instanceof Error ? e.message : String(e);
      throw new ProviderError(
        o.browser
          ? `The browser could not reach ${url} (${why}). The provider may refuse calls from a web page (CORS): OpenAI does for some keys. ` +
              'Use Ollama on this machine (start it with OLLAMA_ORIGINS set to this site), or run the Studio locally (npm run studio): its server relays the call.'
          : `Could not reach ${url}: ${why}`,
      );
    }
    if (!res.ok) {
      const text = await readCapped(res, 64 * 1024).catch(() => '');
      throw new ProviderError(
        `${o.provider.kind} ${res.status}${res.statusText ? ` ${res.statusText}` : ''}: ${errorBodyMessage(text).slice(0, 500)}`,
      );
    }
    return res;
  };
  const streamed = (res: Response) =>
    !!res.body && (res.headers.get('content-type') ?? '').includes('text/event-stream');

  // ---- OpenAI-compatible
  const oaMessages: Record<string, unknown>[] = [
    { role: 'system', content: o.system },
    ...o.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const oaTools = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: jsonSchema(t) },
  }));
  async function openaiRound(): Promise<Round> {
    const headers: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
    const body: Record<string, unknown> = {
      model: o.provider.model,
      messages: oaMessages,
      tools: oaTools,
      stream: true,
    };
    if (/api\.openai\.com/.test(o.provider.baseUrl)) body.stream_options = { include_usage: true };
    const res = await post(body, headers);
    const u: Usage = { input: 0, output: 0 };
    let text = '';
    const calls: Call[] = [];
    if (streamed(res)) {
      const byIndex = new Map<number, Call>();
      for await (const ev of sse(res.body!)) {
        if (ev.data === '[DONE]') break;
        let data: unknown;
        try {
          data = JSON.parse(ev.data);
        } catch {
          continue;
        }
        const chunk = readOpenAIChunk(data);
        if (chunk.error !== undefined) throw new ProviderError(`${o.provider.kind}: ${chunk.error}`);
        if (chunk.usage) Object.assign(u, chunk.usage);
        if (chunk.text) {
          text += chunk.text;
          o.emit({ type: 'text', delta: chunk.text });
        }
        for (const tc of chunk.toolCalls) {
          let c = byIndex.get(tc.index);
          if (!c) {
            c = { id: '', name: '', args: '' };
            byIndex.set(tc.index, c);
          }
          if (tc.id) c.id = tc.id;
          if (tc.name) c.name += tc.name;
          if (tc.args) c.args += tc.args;
        }
      }
      calls.push(...[...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c));
    } else {
      const data: unknown = JSON.parse(await readCapped(res));
      const m = readOpenAIMessage(data);
      if (m.text) {
        text = m.text;
        o.emit({ type: 'text', delta: m.text });
      }
      calls.push(...m.calls);
      if (m.usage) Object.assign(u, m.usage);
    }
    calls.forEach((c, i) => {
      if (!c.id) c.id = `call_${Date.now().toString(36)}_${i}`;
    });
    oaMessages.push({
      role: 'assistant',
      content: text || null,
      ...(calls.length
        ? {
            tool_calls: calls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: c.args || '{}' },
            })),
          }
        : {}),
    });
    return { calls, usage: u };
  }

  // ---- Anthropic Messages API
  const anMessages: { role: 'user' | 'assistant'; content: unknown }[] = [];
  for (const m of o.messages) {
    if (!m.content.trim()) continue;
    const last = anMessages.at(-1);
    if (last && last.role === m.role) last.content = `${last.content as string}\n\n${m.content}`;
    else anMessages.push({ role: m.role, content: m.content });
  }
  while (anMessages[0] && anMessages[0].role !== 'user') anMessages.shift();
  const anTools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: jsonSchema(t) }));
  async function anthropicRound(): Promise<Round> {
    const headers: Record<string, string> = { 'anthropic-version': '2023-06-01' };
    if (key) headers['x-api-key'] = key;
    if (o.browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    const res = await post(
      {
        model: o.provider.model,
        max_tokens: 16000,
        system: o.system,
        messages: anMessages,
        tools: anTools,
        stream: true,
      },
      headers,
    );
    let u: Usage = { input: 0, output: 0 };
    let blocks: Block[];
    if (streamed(res)) {
      const st: AnthropicStream = { blocks: [], partial: new Map(), usage: u };
      for await (const ev of sse(res.body!)) {
        let data: unknown;
        try {
          data = JSON.parse(ev.data);
        } catch {
          continue;
        }
        const delta = anthropicEvent(st, data);
        if (delta !== undefined) o.emit({ type: 'text', delta });
      }
      blocks = st.blocks.filter(Boolean);
    } else {
      const m = readAnthropicMessage(JSON.parse(await readCapped(res)));
      blocks = m.blocks;
      u = m.usage;
      for (const b of blocks)
        if (b.type === 'text' && typeof b.text === 'string' && b.text) o.emit({ type: 'text', delta: b.text });
    }
    const calls = anthropicCalls(blocks);
    // The assistant turn goes back as it came (thinking blocks included); tool inputs as objects.
    const content = blocks
      .filter((b) => b.type !== 'text' || b.text)
      .map((b) => {
        if (b.type !== 'tool_use' || typeof b.input !== 'string') return b;
        let input: unknown = {};
        try {
          input = JSON.parse(b.input);
        } catch {
          /* reported as a tool error below */
        }
        return { ...b, input };
      });
    if (content.length) anMessages.push({ role: 'assistant', content });
    return { calls, usage: u };
  }

  try {
    if (o.provider.kind === 'anthropic' && !anMessages.length)
      throw new ProviderError('Nothing to send: write a message first.');
    for (let round = 0; ; round++) {
      const r = o.provider.kind === 'anthropic' ? await anthropicRound() : await openaiRound();
      usage.input += r.usage.input;
      usage.output += r.usage.output;
      if (!r.calls.length) break;
      const results: { id: string; text: string; isError: boolean }[] = [];
      for (const c of r.calls) {
        let args: unknown;
        let res: ToolResult;
        try {
          args = c.args.trim() ? JSON.parse(c.args) : {};
        } catch {
          args = undefined;
        }
        o.emit({ type: 'tool_call', id: c.id, name: c.name, args: args ?? c.args });
        if (args === undefined)
          res = {
            content: [{ type: 'text', text: `Error: the arguments of ${c.name} are not valid JSON` }],
            isError: true,
          };
        else res = await callTool(c.name, args, o.backend);
        const text = res.content.map((x) => x.text).join('\n');
        if (!res.isError && tools.some((t) => t.name === c.name && t.writes)) wrote.add(c.name);
        o.emit({
          type: 'tool_result',
          id: c.id,
          name: c.name,
          result: cut(text, EVENT_RESULT_MAX),
          ...(res.isError ? { isError: true } : {}),
        });
        results.push({ id: c.id, text: cut(text, MODEL_RESULT_MAX), isError: !!res.isError });
        if (o.signal?.aborted) break;
      }
      if (o.provider.kind === 'anthropic') {
        anMessages.push({
          role: 'user',
          content: results.map((x) => ({
            type: 'tool_result',
            tool_use_id: x.id,
            content: x.text,
            ...(x.isError ? { is_error: true } : {}),
          })),
        });
      } else {
        for (const x of results) oaMessages.push({ role: 'tool', tool_call_id: x.id, content: x.text });
      }
      if (o.signal?.aborted) break;
      if (round + 1 >= max) {
        o.emit({ type: 'error', message: `Stopped after ${max} tool rounds: ask again to continue.` });
        break;
      }
    }
    o.emit({ type: 'done', usage, wrote: [...wrote], ...(o.signal?.aborted ? { stopped: true } : {}) });
  } catch (e) {
    if (o.signal?.aborted) {
      o.emit({ type: 'done', usage, wrote: [...wrote], stopped: true });
      return;
    }
    o.emit({ type: 'error', message: redact(e instanceof Error ? e.message : String(e)) });
    o.emit({ type: 'done', usage, wrote: [...wrote] });
  }
}
