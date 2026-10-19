// The Studio core (studio-server/src/ops/core.ts) as a `ToolBackend` (tools/studio/tools.ts): what the MCP server and the
// Assistant relay of the dev server run the tools against. Node only.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { buildPrompts } from '../prompts';
import type { Studio } from '../../studio-server/src/ops/core';
import { errorResult, jsonResult, textResult, type ToolBackend, type ToolResult } from './tools';

export interface CoreBackendOptions {
  /** Repository root (docs, vitest). */
  root: string;
  /** The dev server the screenshots go through. */
  devUrl: string;
  /** Default author of add_note. */
  author?: () => string;
}

export function coreBackend(studio: Studio, o: CoreBackendOptions): ToolBackend {
  return {
    game: () => studio.gameInfo(),
    ir: () => studio.ir(),
    room: (id) => studio.getRoom(id),
    setLayout: (id, layout) => studio.setLayout(id, layout),
    setText: (id, path, value) => studio.setText(id, path, value),
    setValue: (id, path, value, dry) => studio.setValue(id, path, value, { dry }),
    add: (id, e) => studio.addEntity(id, e),
    storyboardRaw: async () => studio.getStoryboard(),
    setStoryboard: (sb) => studio.setStoryboard(sb),
    notes: async () => studio.getNotes(),
    addNote: (n) => studio.addNote(n),
    validate: () => studio.validate(),
    report: () => studio.report(),
    graph: () => studio.graph(),
    puzzle: (id) => studio.puzzle(id),
    coverage: () => studio.coverage(),
    playtests: () => studio.playtests(),
    speedrunVerify: async (wsrun) => {
      const { approvedContext } = await import('../speedrun/package');
      const { verifyRun } = await import('../../src/engine/tools/speedrun/verify');
      // A path stays inside the repository or project: never a file of the machine the client chose.
      let text = wsrun;
      if (wsrun.startsWith('@file:')) {
        const rel = wsrun.slice(6);
        const abs = resolve(o.root, rel);
        if (!abs.startsWith(resolve(o.root) + sep) || !abs.endsWith('.wsrun'))
          throw new Error('a .wsrun file under the repository or project');
        text = readFileSync(abs, 'utf8');
      }
      return verifyRun(text, await approvedContext(studio.gameDir));
    },
    lint: (prove) => studio.lint(prove),
    solve: (from, prove, reality) => studio.solve(from, undefined, prove ? 'prove' : 'witness', reality),
    author: o.author,
    readDoc: async (name) => readFileSync(join(o.root, 'docs', 'en', `${name}.md`), 'utf8'),
    assetPrompts: async (missing) => {
      const mod = await studio.loadGame();
      return buildPrompts(mod, { gameId: studio.gameId, gameDir: studio.gameDir, root: o.root, missing });
    },
    screenshot: async (room, checkpoint) => {
      try {
        await fetch(o.devUrl, { signal: AbortSignal.timeout(3000) });
      } catch {
        return textResult(
          `Screenshot unavailable: no dev server at ${o.devUrl}. Ask the human to run "npm run studio" (or set WEB_SCUMM_DEV_URL).`,
        );
      }
      try {
        const r = await studio.screenshot(room, checkpoint, o.devUrl);
        if ('unavailable' in r) return textResult(`Screenshot unavailable: ${r.reason}`);
        return jsonResult({ file: r.file, absolute: join(o.root, r.file) });
      } catch (e) {
        if (e instanceof Error && /Timeout/i.test(e.message)) {
          return errorResult(
            new Error(
              `${e.message} The page at ${o.devUrl} did not show the engine's editor: is it the dev server of this game ("${studio.gameId}")?`,
            ),
          );
        }
        return errorResult(e);
      }
    },
    runTests: () =>
      new Promise<ToolResult>((done) => {
        execFile(
          'npx',
          ['vitest', 'run'],
          {
            cwd: o.root,
            env: { ...process.env, CI: '1', NO_COLOR: '1' },
            maxBuffer: 32 * 1024 * 1024,
            timeout: 10 * 60_000,
          },
          (err, stdout, stderr) => {
            // eslint-disable-next-line no-control-regex
            const all = `${stdout}\n${stderr}`.replace(/\x1b\[[0-9;]*m/g, '').split('\n');
            const keep = all.filter((l) =>
              /^\s*(Test Files|Tests|Duration|Start at)\b|FAIL|✗|×|AssertionError|Error:/.test(l),
            );
            const summary = (keep.length ? keep : all.slice(-30)).join('\n').trim();
            done(
              err ? { content: [{ type: 'text', text: summary || err.message }], isError: true } : textResult(summary),
            );
          },
        );
      }),
  };
}
