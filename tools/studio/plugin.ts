// Dev server only: the Studio API (/__studio/api/*, wiki/en/studio.api.md), its change feed (server-sent events) and the
// Studio page itself (/__studio/ → studio.html, entry src/studio/main.ts). Every operation is a call into core.ts.
import { createReadStream, watch, type FSWatcher } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

import { isStudioError, StudioError } from '../../studio-server/src/ops/errors.ts';
import type { StudioEvent } from './types.ts';
import { isBody, routes } from '../../studio-server/src/ops/routes.ts';
import { authorizeStudioRequest } from './security.ts';

const MAX_BODY = 8 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<unknown> {
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
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s.trim()) {
        ok({});
        return;
      }
      try {
        ok(JSON.parse(s));
      } catch {
        fail(new StudioError('the body is not valid JSON'));
      }
    });
    req.on('error', fail);
  });
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

export function studioPlugin(): Plugin {
  return {
    name: 'quest-n-click-studio',
    apply: 'serve',
    async configureServer(server) {
      if (process.env.VITEST) return;
      // The Studio and the engine it runs, loaded by the dev server itself (4.1.19): the configuration's own import
      // graph holds this file, never the Studio, the solver and the engine behind it.
      const load = <T>(file: string) =>
        server.ssrLoadModule(fileURLToPath(new URL(file, import.meta.url))) as Promise<T>;
      const { createStudio } = await load<typeof import('../../studio-server/src/ops/core.ts')>(
        '../../studio-server/src/ops/core.ts',
      );
      const { registerAssistant } = await load<typeof import('./assistant')>('./assistant.ts');
      const { assetsMiddleware } = await load<typeof import('./assets')>('./assets.ts');
      const studio = createStudio();
      const table = routes(studio);
      const clients = new Set<ServerResponse>();

      const broadcast = (ev: StudioEvent) => {
        const line = `data: ${JSON.stringify(ev)}\n\n`;
        for (const c of clients) c.write(line);
      };

      // A change on disk (an AI, a text editor, git, the Studio itself): one event per file, debounced.
      let watcher: FSWatcher | undefined;
      const timers = new Map<string, NodeJS.Timeout>();
      try {
        watcher = watch(studio.gameDir, { recursive: true }, (_ev, name) => {
          if (!name) return;
          const file = String(name).split('\\').join('/');
          if (/(^|\/)\.|~$|\.swp$|^private\//.test(file)) return;
          clearTimeout(timers.get(file));
          timers.set(
            file,
            setTimeout(() => {
              timers.delete(file);
              broadcast({ type: 'changed', file });
            }, 150),
          );
        });
      } catch (e) {
        server.config.logger.warn(`[studio] no file watcher: ${(e as Error).message}`);
      }
      server.httpServer?.on('close', () => {
        watcher?.close();
        for (const c of clients) c.end();
      });

      // /__studio/ → studio.html (the Vite html pipeline serves and transforms it).
      server.middlewares.use((req, res, next) => {
        const [path, query] = (req.url ?? '').split('?');
        if ((path === '/__studio' || path.startsWith('/__studio/')) && !authorizeStudioRequest(req, res)) return;
        if (path === '/__studio') {
          res.statusCode = 302;
          res.setHeader('location', `/__studio/${query ? `?${query}` : ''}`);
          res.end();
          return;
        }
        if (path === '/__studio/' || path === '/__studio/index.html')
          req.url = `/studio.html${query ? `?${query}` : ''}`;
        next();
      });

      registerAssistant(server, studio); // POST assistant/chat (SSE) and assistant/task, before the JSON routes

      server.middlewares.use('/__studio/api/assets', assetsMiddleware(studio, server.config.logger)); // the Assets tab (tools/studio/assets.ts)

      server.middlewares.use('/__studio/api', async (req, res) => {
        const path = (req.url ?? '/').split('?')[0];
        const method = req.method ?? 'GET';
        try {
          if (method === 'GET' && path === '/events') {
            res.writeHead(200, {
              'content-type': 'text/event-stream',
              'cache-control': 'no-cache',
              connection: 'keep-alive',
            });
            res.write(`data: ${JSON.stringify({ type: 'hello', game: studio.gameId } satisfies StudioEvent)}\n\n`);
            clients.add(res);
            const ping = setInterval(() => res.write(': ping\n\n'), 25000);
            req.on('close', () => {
              clearInterval(ping);
              clients.delete(res);
            });
            return;
          }
          const shot = method === 'GET' && /^\/screenshots\/([\w.-]+\.png)$/.exec(path);
          if (shot) {
            const f = studio.screenshotPath(shot[1]);
            if (!f) {
              send(res, 404, { error: 'no such screenshot' });
              return;
            }
            res.setHeader('content-type', 'image/png');
            res.setHeader('cache-control', 'no-store');
            createReadStream(f).pipe(res);
            return;
          }
          let matchedPath = false;
          for (const [m, re, fn] of table) {
            const hit = path.match(re);
            if (!hit) continue;
            matchedPath = true;
            if (m !== method) continue;
            const body = method === 'GET' ? {} : await readBody(req);
            if (!isBody(body)) throw new StudioError('the body must be a JSON object');
            const baseUrl =
              server.resolvedUrls?.local[0] ??
              `http://localhost:${server.config.server.port ?? 5173}${server.config.base}`;
            send(res, 200, await fn(hit, body, { baseUrl }));
            return;
          }
          send(res, matchedPath ? 405 : 404, {
            error: matchedPath ? `method ${method} not allowed on ${path}` : `no such endpoint: ${path}`,
          });
        } catch (e) {
          const status = isStudioError(e) ? e.status : 500;
          const extra = (e as { body?: object }).body ?? {};
          if (status >= 500 && status !== 501)
            server.config.logger.error(`[studio] ${method} ${path}: ${(e as Error).stack ?? e}`);
          send(res, status, { ...extra, error: (e as Error).message });
        }
      });
    },
  };
}
