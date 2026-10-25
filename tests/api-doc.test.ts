// The wiki's `engine.api` (wiki/en/engine.api.md and wiki/fr/engine.api.md; docs/en|fr/API.md until 4.5.0) carries the
// public API's signatures, generated from the sources (4.1.7, tools/api-doc.ts): a page behind the code fails here, and
// `npx tsx tools/api-doc.ts` brings it up to date. Since
// 4.1.8 every export also declares its stability (`@public` or `@extension`) and says what it is: a bare export fails.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apiIdentifiers, apiRows, signaturesWiki } from '../tools/api-doc';
import { withGenerated } from '../tools/wiki/generated';
import { readManifest } from '../tools/wiki/manifest';

describe('the API pages carry the signatures of the code', () => {
  const rows = apiRows();
  const block = signaturesWiki(rows, 'en');
  it('names every entry and more than a hundred exports', () => {
    for (const e of ['content', 'player', 'minigames', 'testing', 'reality'])
      expect(block).toContain(`### @quest-n-click/engine/${e}`);
    expect(rows.length).toBeGreaterThan(100);
    expect(block.split('\n').filter((l) => l.startsWith('| `')).length).toBe(rows.length);
  });
  it('every export says what it is (a first doc sentence on its declaration)', () => {
    const bare = rows.filter((r) => !r.doc).map((r) => `${r.entry}: ${r.name}`);
    expect(bare).toEqual([]);
  });
  it('every export declares its stability, @public or @extension (tools/api-doc.ts says which is which)', () => {
    const untagged = rows.filter((r) => r.stability !== 'public' && r.stability !== 'extension');
    expect(untagged.map((r) => `${r.entry}: ${r.name}`)).toEqual([]);
    // Both kinds exist: a contract a host implements is not the same promise as a name it calls.
    expect(rows.some((r) => r.stability === 'extension')).toBe(true);
    expect(rows.filter((r) => r.stability === 'public').length).toBeGreaterThan(rows.length / 2);
    // Exactly one tag: a declaration that carries both says nothing.
    expect(rows.filter((r) => r.bothTags).map((r) => r.name)).toEqual([]);
    // A deprecated name says so beside its stability (the old name of EndingDef).
    expect(rows.find((r) => r.name === 'RevealDef')).toMatchObject({ stability: 'public', deprecated: true });
    expect(block).toContain('| public (deprecated) |');
    expect(signaturesWiki(rows, 'fr')).toContain('| public (dépréciée) |');
  });
  it('a type alias is printed as what it stands for, not as the members of a string or an array', () => {
    const sig = (name: string) => rows.find((r) => r.name === name)?.signature;
    expect(sig('Id')).toBe('type Id = string');
    expect(sig('Point')).toBe('type Point = [number, number]');
    expect(sig('Keyring')).toBe('type Keyring = BridgeKey[]');
    expect(sig('TransitionKind')).toBe("type TransitionKind = 'cut' | 'fade' | 'wipe'");
    // A side too wide to read is summarised, and an interface shows its first members.
    expect(sig('Cmd')).toMatch(/^type Cmd = union of \d+$/);
    expect(sig('RoomDef')).toMatch(/^interface \{ id, name, decor, /);
    // A side derived from another declaration (`z.infer<typeof schema>`) shows its members, not that expression.
    expect(sig('WorldSignalV1')).toMatch(/^type WorldSignalV1 = \{ /);
    expect(sig('WorldSignalV1')).not.toContain('infer');
    // A constant's literal is its kind, not its value.
    expect(sig('MINIGAME_CSS')).toBe('string');
  });
  for (const lang of ['en', 'fr'] as const)
    it(`wiki/${lang}/engine.api.md is up to date (npx tsx tools/api-doc.ts)`, () => {
      const page = readFileSync(`wiki/${lang}/engine.api.md`, 'utf8');
      expect(withGenerated(page, signaturesWiki(rows, lang)).text).toBe(page);
    });
  it("the manifest names engine.api's identifiers: every entry and every export", () => {
    const page = readManifest('wiki').manifest!.pages.find((p) => p.id === 'engine.api')!;
    expect([...page.identifiers].sort()).toEqual(apiIdentifiers(rows));
  });
});
