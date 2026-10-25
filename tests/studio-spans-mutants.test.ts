// A game's own spans (4.5.1, studio-server/src/ops/spans.ts), pinned for the mutation set `studio-ops`: a literal key
// names that file only, a folder key that only the engine's rules would name, the limits at their exact edge. The
// mutants no input can tell from the original (a loop's bounds one step wider) are named in docs/dev/mutants.json.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OWN_SPANS_LIMITS, parseOwnSpans, readOwnSpans, spanOf } from '../studio-server/src/ops/spans';

describe('a game’s own spans', () => {
  it('a literal key names that file only, not a longer name nor a file under it', () => {
    const own = parseOwnSpans({ 'docs/plan.md': 'notes', 'scripts/': 'meta' });
    expect(spanOf('docs/plan.md', own)).toBe('notes');
    expect(() => spanOf('docs/plan.mdx', own)).toThrow(/belongs to no span/);
    expect(() => spanOf('docs/plan.md/x', own)).toThrow(/belongs to no span/);
    // A folder key: everything under it, and not a sibling whose name only starts the same.
    expect(spanOf('scripts/a/b.mjs', own)).toBe('meta');
    expect(() => spanOf('scripts2/a.mjs', own)).toThrow(/belongs to no span/);
  });

  it('a folder key the engine names is refused; one it only holds files in is the game’s', () => {
    expect(() => parseOwnSpans({ 'art/': 'meta' })).toThrow(/"art\/" is an engine file/);
    // rooms/ names no file itself (only rooms/<id>.ts is the engine's): a game may give the rest of it a span.
    expect(spanOf('rooms/notes.md', parseOwnSpans({ 'rooms/': 'notes' }))).toBe('notes');
    expect(spanOf('rooms/hall.ts', parseOwnSpans({ 'rooms/': 'notes' }))).toBe('room:hall');
  });

  it('takes exactly as many entries as the limit, and refuses one more', () => {
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`own/f${i}.md`, 'notes']));
    expect(parseOwnSpans(many(OWN_SPANS_LIMITS.entries))).toHaveLength(OWN_SPANS_LIMITS.entries);
    expect(() => parseOwnSpans(many(OWN_SPANS_LIMITS.entries + 1))).toThrow(/257 entries, at most 256/);
  });

  it('takes a key exactly as long as the limit, and refuses one character more', () => {
    const key = (n: number) => `own/${'k'.repeat(n - 4)}`;
    expect(key(OWN_SPANS_LIMITS.keyLength)).toHaveLength(OWN_SPANS_LIMITS.keyLength);
    const own = parseOwnSpans({ [key(OWN_SPANS_LIMITS.keyLength)]: 'notes' });
    expect(spanOf(key(OWN_SPANS_LIMITS.keyLength), own)).toBe('notes');
    expect(() => parseOwnSpans({ [key(OWN_SPANS_LIMITS.keyLength + 1)]: 'notes' })).toThrow(
      /a key of 257 characters, at most 256/,
    );
  });
});

describe('readOwnSpans at the size limit', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'qnc-spans-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** A spans.json of exactly `bytes` bytes: one entry, then spaces (still JSON). */
  const write = (bytes: number) => {
    const text = '{"own/":"notes"}';
    writeFileSync(join(dir, 'spans.json'), text + ' '.repeat(bytes - text.length));
  };

  it('reads a file exactly as large as the limit', () => {
    write(OWN_SPANS_LIMITS.bytes);
    expect(spanOf('own/a.md', readOwnSpans(dir))).toBe('notes');
  });

  it('refuses a file one byte over the limit', () => {
    write(OWN_SPANS_LIMITS.bytes + 1);
    expect(() => readOwnSpans(dir)).toThrow(/65537 bytes, at most 65536/);
  });
});
