// The reading guides name real files (4.1.0 "Clarity"): every path quoted in the architecture and the code tour (both
// languages; the wiki's `contribute.architecture` and `contribute.code-tour` since 4.5.0, ARCHITECTURE.md and
// CODE_TOUR.md before), in BOUNDARIES.md and in the ADRs exists, so the tour cannot drift from the code it walks.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitSections } from '../tools/wiki/docs';
import { readManifest } from '../tools/wiki/manifest';

const DOCS = [
  'wiki/en/contribute.architecture.md',
  'wiki/fr/contribute.architecture.md',
  'wiki/en/contribute.code-tour.md',
  'wiki/fr/contribute.code-tour.md',
  'src/engine/BOUNDARIES.md',
  'CONTRIBUTING.md',
  ...readdirSync('docs/dev/adr').map((f) => `docs/dev/adr/${f}`),
];

/** The paths a document quotes: `a/b.ts`, `a/b/`, with an optional `:line`; globs and placeholders are skipped. */
export function quotedPaths(md: string): string[] {
  const out = new Set<string>();
  for (const m of md.matchAll(/`([\w@.-]+(?:\/[\w@.*<>-]*)+(?:\.\w+)?)(?::\d+)?`/g)) {
    const p = m[1]!;
    // A glob, a placeholder, a package name, or `.cache/…` (made at run time, never tracked).
    if (/[*<>]/.test(p) || /^(quest-n-click|web-scumm)\//.test(p) || p.startsWith('@') || p.startsWith('.cache/'))
      continue;
    out.add(p);
  }
  return [...out];
}
/**
 * A path as written, or relative to src/engine or src/engine/tools (the docs say `core/engine.ts`,
 * `solve/abstractions.ts`), a module without its extension (`tools/replay`), or an installed package (`zod/mini`).
 */
const exists = (p: string) =>
  ['', 'src/engine/', 'src/engine/tools/'].some((b) => existsSync(`${b}${p}`) || existsSync(`${b}${p}.ts`)) ||
  existsSync(`node_modules/${p}`);

describe('the reading guides', () => {
  it.each(DOCS)('%s quotes only paths that exist', (doc) => {
    const missing = quotedPaths(readFileSync(doc, 'utf8')).filter((p) => !exists(p));
    expect(missing).toEqual([]);
  });

  it('reads the paths it checks', () => {
    expect(
      quotedPaths(
        'see `src/engine/core/engine.ts:12`, `dom/app.ts`, `scripts/e2e*.mjs`, `web-scumm/content`, `.cache/game`',
      ),
    ).toEqual(['src/engine/core/engine.ts', 'dom/app.ts']);
  });
});

// Both languages say the same (4.1.7; the wiki's pages since 4.5.0): every written page of wiki/en has its wiki/fr twin
// with the same sections (`wiki -- check` also requires the same section ids, links, blocks and steps of two ready
// twins), and no section of sixty words or more is a third shorter in one language than in the other (a summary is not
// a translation). Measured in words, not lines: the French pages wrap differently.
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe('the French documentation keeps up with the English', () => {
  const pages = readManifest('wiki').manifest!.pages.filter((p) => p.state !== 'planned' && !p.generated);
  it('reads every written page', () => {
    expect(pages.length).toBeGreaterThan(150);
  });
  for (const p of pages)
    it(p.id, () => {
      expect(existsSync(`wiki/fr/${p.id}.md`), `wiki/fr/${p.id}.md is missing`).toBe(true);
      const en = splitSections(readFileSync(`wiki/en/${p.id}.md`, 'utf8'));
      const fr = new Map(splitSections(readFileSync(`wiki/fr/${p.id}.md`, 'utf8')).map((s) => [s.id, s]));
      expect([...fr.keys()].sort(), p.id).toEqual(en.map((s) => s.id).sort());
      const short = en
        .map((s) => [s.id, words(s.text), words(fr.get(s.id)!.text)] as const)
        .filter(([, a, b]) => Math.max(a, b) >= 60 && Math.abs(a - b) > 0.3 * Math.max(a, b))
        .map(([t, a, b]) => `${t}: ${a} words in English, ${b} in French`);
      expect(short).toEqual([]);
    });
});
