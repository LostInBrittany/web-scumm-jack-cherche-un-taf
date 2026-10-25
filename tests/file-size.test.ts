// A file of src/ is read in one sitting (4.1.0 "Clarity", docs/dev/PLAN-4.1.1-CLARITY.md): at most 800 lines. The four
// files that held most of the engine (core/engine.ts, core/types.ts, dom/app.ts, tools/solve.ts) were split by
// responsibility; the files below are over the limit for a reason given here, capped at their size: they may shrink,
// never grow, and a split removes them from the list.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LIMIT = 800;
const EXCEPTIONS: Record<string, { cap: number; why: string }> = {
  'src/engine/tools/validate.ts': {
    cap: 1081,
    why: 'the validator: one check after another over the same indexes, read top to bottom',
  },
  'src/engine/dev/editor.ts': { cap: 847, why: 'the dev layout editor: handles of every kind on one overlay' },
  'src/studio/assistant.ts': { cap: 845, why: 'the Studio assistant: the conversation, its tools and its rendering' },
};

const files = (d: string): string[] =>
  readdirSync(d).flatMap((e) => {
    const p = join(d, e);
    return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(e) ? [p] : [];
  });

describe('file size', () => {
  const sizes = Object.fromEntries(files('src').map((f) => [f, readFileSync(f, 'utf8').split('\n').length - 1]));

  it(`no file of src/ over ${LIMIT} lines but the documented exceptions`, () => {
    const over = Object.entries(sizes).filter(([f, n]) => n > LIMIT && !EXCEPTIONS[f]);
    expect(over).toEqual([]);
  });

  it('an exception never grows, and leaves the list once under the limit', () => {
    for (const [f, e] of Object.entries(EXCEPTIONS)) {
      expect(sizes[f], f).toBeLessThanOrEqual(e.cap);
      expect(sizes[f], `${f} is under ${LIMIT} lines: remove it from EXCEPTIONS`).toBeGreaterThan(LIMIT);
    }
  });

  it('the four files that held the engine are under the limit', () => {
    for (const f of [
      'src/engine/core/engine.ts',
      'src/engine/core/types.ts',
      'src/engine/dom/app.ts',
      'src/engine/tools/solve.ts',
    ])
      expect(sizes[f], f).toBeLessThanOrEqual(LIMIT);
  });
});
