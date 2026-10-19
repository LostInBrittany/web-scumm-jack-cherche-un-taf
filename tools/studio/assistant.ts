// The Studio's Assistant, server side (dev server only): POST /__studio/api/assistant/chat relays a conversation to a
// chat model chosen in the page (OpenAI-compatible, Anthropic or Ollama), runs its tool calls on the game through the
// shared registry (tools/studio/tools.ts, the MCP server's tools) and streams the events back as server-sent events.
// POST /__studio/api/assistant/task writes a note tagged `task: true` for an MCP-connected agent (no key needed).
// The API key comes with each request and lives in memory for that request only: never on disk, never in a log.
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import {
  contextDetails,
  runAssistant,
  systemPrompt,
  type AssistantContext,
  type AssistantEvent,
  type ChatTurn,
  type Provider,
} from './assistant-loop';
import { coreBackend } from './backend';
import { createStudio, StudioError, type Studio } from '../../studio-server/src/ops/core';

const MAX_BODY = 4 * 1024 * 1024;
const KINDS = new Set(['openai', 'anthropic', 'ollama']);

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new StudioError('body too large', 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        ok(v);
      } catch {
        fail(new StudioError('the body must be a JSON object'));
      }
    });
    req.on('error', fail);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

const PROVIDER_ORIGINS = new Set(['https://api.openai.com', 'https://api.anthropic.com', 'https://api.mistral.ai']);
/** `URL.hostname` as a host: IPv6 without its brackets, lower case; an IPv4-mapped IPv6 address becomes its IPv4. */
export const hostOf = (hostname: string) => {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  return mapped ? mapped[1] : h;
};
/** Loopback, unspecified, private, link-local or local-name hosts: never a custom provider's address. */
export const privateHost = (hostname: string) => {
  const host = hostOf(hostname);
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host))
    return (
      /^(0|10|127)\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
    );
  if (host.includes(':'))
    return (
      host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')
    );
  return false;
};
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

/** The request's provider, checked (the key is kept as given, only in memory). */
export function parseProvider(
  p: unknown,
  allowCustom = process.env.WEB_SCUMM_ALLOW_CUSTOM_PROVIDER === '1',
  allowPrivateForTests = false,
): Provider {
  const o = (p ?? {}) as Record<string, unknown>;
  if (typeof o.kind !== 'string' || !KINDS.has(o.kind))
    throw new StudioError('`provider.kind` must be openai, anthropic or ollama');
  if (typeof o.baseUrl !== 'string' || !/^https?:\/\/[^\s]+$/.test(o.baseUrl.trim()))
    throw new StudioError('`provider.baseUrl` must be an http(s) URL');
  let url: URL;
  try {
    url = new URL(o.baseUrl.trim());
  } catch {
    throw new StudioError('`provider.baseUrl` is not a valid URL');
  }
  if (url.username || url.password) throw new StudioError('provider URLs cannot contain credentials');
  const ollama = o.kind === 'ollama' && LOOPBACK.has(hostOf(url.hostname));
  if (!PROVIDER_ORIGINS.has(url.origin) && !ollama) {
    if (!allowCustom)
      throw new StudioError('custom provider URLs are disabled (set WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 to opt in)');
    if (!allowPrivateForTests && (url.protocol !== 'https:' || privateHost(url.hostname)))
      throw new StudioError('custom providers must use HTTPS and cannot target local or private network hosts');
  }
  if (typeof o.model !== 'string' || !o.model.trim()) throw new StudioError('`provider.model` is required');
  if (o.apiKey !== undefined && typeof o.apiKey !== 'string')
    throw new StudioError('`provider.apiKey` must be a string');
  return {
    kind: o.kind as Provider['kind'],
    baseUrl: o.baseUrl.trim(),
    model: o.model.trim(),
    apiKey: (o.apiKey as string | undefined)?.trim() || undefined,
  };
}

export function parseMessages(m: unknown): ChatTurn[] {
  if (!Array.isArray(m) || !m.length) throw new StudioError('`messages` must be a non-empty array');
  const out = m.map((x) => {
    const t = x as Record<string, unknown>;
    if ((t?.role !== 'user' && t?.role !== 'assistant') || typeof t.content !== 'string')
      throw new StudioError('each message is { role: "user" | "assistant", content: string }');
    return { role: t.role, content: t.content } as ChatTurn;
  });
  if (out.at(-1)!.role !== 'user') throw new StudioError("the last message must be the user's");
  return out;
}

export interface AssistantOptions {
  /** Repository root: AGENTS.md, the docs. */
  root: string;
  /** The dev server's URL (screenshots). */
  devUrl: () => string;
  fetch?: typeof fetch;
  /** Explicit opt-in for a non-preset public HTTPS endpoint. */
  allowCustomProvider?: boolean;
  /** Unit tests only: production callers must never set this. */
  allowPrivateProviderForTests?: boolean;
}

/** Connect-style handler for /__studio/api/assistant/* (req.url relative to that prefix). */
export function assistantHandler(studio: Studio, o: AssistantOptions) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method !== 'POST' || (path !== '/chat' && path !== '/task')) {
      next();
      return;
    }
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (e) {
      sendJson(res, (e as StudioError).status ?? 400, { error: (e as Error).message });
      return;
    }

    if (path === '/task') {
      try {
        if (typeof body.text !== 'string' || !body.text.trim()) throw new StudioError('`text` is required');
        const note = await studio.addNote({
          about: typeof body.about === 'string' ? body.about : '',
          author: 'you',
          text: body.text,
          task: true,
        });
        sendJson(res, 200, note);
      } catch (e) {
        sendJson(res, e instanceof StudioError ? e.status : 500, { error: (e as Error).message });
      }
      return;
    }

    let provider: Provider, messages: ChatTurn[];
    try {
      provider = parseProvider(body.provider, o.allowCustomProvider, o.allowPrivateProviderForTests);
      messages = parseMessages(body.messages);
    } catch (e) {
      sendJson(res, 400, { error: (e as Error).message });
      return;
    }
    const context = (body.context && typeof body.context === 'object' ? body.context : undefined) as
      | AssistantContext
      | undefined;

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) ac.abort();
    });
    const emit = (ev: AssistantEvent) => {
      if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    };

    const backend = coreBackend(studio, { root: o.root, devUrl: o.devUrl(), author: () => provider.model });
    let agents = '';
    try {
      agents = readFileSync(join(o.root, 'AGENTS.md'), 'utf8');
    } catch {
      /* another layout: the prompt says less */
    }
    const info = await backend.game().catch(() => undefined);
    const details = await contextDetails(context, backend).catch(() => '');
    await runAssistant({
      provider,
      messages,
      backend,
      emit,
      signal: ac.signal,
      fetch: o.fetch,
      system: systemPrompt({ agents, info, context, details }),
    });
    res.end();
  };
}

/** Called by the Studio plugin (tools/studio/plugin.ts) before its generic API middleware. */
export function registerAssistant(server: ViteDevServer, studio: Studio = createStudio()) {
  const handler = assistantHandler(studio, {
    root: studio.root,
    devUrl: () =>
      server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port ?? 5173}${server.config.base}`,
    allowCustomProvider: process.env.WEB_SCUMM_ALLOW_CUSTOM_PROVIDER === '1',
  });
  server.middlewares.use('/__studio/api/assistant', (req, res, next) => {
    void handler(req, res, next);
  });
}
