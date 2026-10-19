// One diagnostic per invalid input, wherever it arrives (4.1.0 "Clarity", lot F): a storyboard.json read by the page
// generator (the CLI), written through the Studio's server, through its in-browser demo, or by the MCP's
// `set_storyboard`, is refused with the same sentences (`storyboardProblems`, tools/pages/storyboard-data.ts).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeStoryboard, storyboardProblems } from '../tools/pages/storyboard-data';
import { readStoryboard } from '../tools/pages/storyboard';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { buildSnapshot } from '../tools/studio/snapshot';
import { TOOLS, type ToolBackend } from '../tools/studio/tools';
import { BrowserApi } from '../src/studio/api-browser';
import type { StudioSnapshot } from '../tools/studio/types';

const ROOT = resolve(__dirname, '..');
const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
function copyDemo(): string {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.cache', 'parity-test-'));
  temps.push(dir);
  const src = join(ROOT, 'games', 'demo');
  cpSync(src, dir, { recursive: true, filter: (f) => !/[\\/](art|audio|private)([\\/]|$)/.test(f.slice(src.length)) });
  return dir;
}
const importFresh = (file: string) => importInChild(file, ROOT);
const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

/** Invalid storyboards, each with what every reader must say. */
const CASES: [string, unknown, string[]][] = [
  ['a board that is not an object', { boards: ['house'] }, ['boards[0]: a board is an object']],
  ['a board without an id', { boards: [{ title: 'House', panels: [] }] }, ['boards[0]: no `id`']],
  ['panels that are not a list', { boards: [{ id: 'b', panels: 'p1' }] }, ['boards[0].panels: a list of panels']],
  [
    'a line of the wrong kind and a panel that is not an object',
    { boards: [{ id: 'b', panels: [{ id: 'p', lines: [42] }, 7], arrival: 'hi' }] },
    [
      'boards[0].panels[0].lines[0]: a line is "text", [who, text] or { who, text }',
      'boards[0].panels[1]: a panel is an object',
      'boards[0].arrival: a list of lines',
    ],
  ],
];

let snapshot: StudioSnapshot;
let dir: string;
beforeAll(async () => {
  dir = copyDemo();
  snapshot = await buildSnapshot({ gameDir: dir, root: ROOT, importFresh });
}, 120_000);

describe('the same diagnostic everywhere', () => {
  it("the demo's and the template's storyboards have none, and normalise as before", () => {
    for (const g of ['demo', '_template']) {
      const raw = JSON.parse(readFileSync(join(ROOT, 'games', g, 'storyboard.json'), 'utf8'));
      expect(storyboardProblems(raw), g).toEqual([]);
      expect(normalizeStoryboard(raw).boards.length).toBeGreaterThan(0);
    }
    expect(storyboardProblems({})).toEqual(['a storyboard is an object with a `boards` list']);
  });

  it.each(CASES)('%s: the CLI, the Studio, its demo and the MCP say the same', async (_name, sb, want) => {
    expect(storyboardProblems(sb)).toEqual(want);
    const said = want.join('; ');
    // The CLI (npm run page:storyboard reads it through readStoryboard).
    const cli = mkdtempSync(join(ROOT, '.cache', 'parity-cli-'));
    temps.push(cli);
    writeFileSync(join(cli, 'storyboard.json'), JSON.stringify(sb));
    expect(() => readStoryboard(cli)).toThrow(said);
    // The Studio's server.
    const studio = createStudio({ gameDir: dir, root: ROOT, importFresh });
    await expect(studio.setStoryboard(sb)).rejects.toThrow(said);
    // The Studio's demo, in the browser.
    const api = new BrowserApi({ snapshot, storage: memory() });
    await expect(api.setStoryboard(sb)).rejects.toThrow(said);
    // The MCP tool, on the Studio's server.
    const tool = TOOLS.find((t) => t.name === 'set_storyboard');
    const r = await tool!.run({ storyboard: sb }, studio as unknown as ToolBackend);
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain(said.replaceAll('"', '\\"'));
  });
});
