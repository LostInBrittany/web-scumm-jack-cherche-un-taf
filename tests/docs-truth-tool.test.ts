// The documentation checked against the code (4.1.16, plan §12, `npm run docs:truth`): the shipped documents agree
// with it, and each contradiction the tool exists for is found in a page that makes it (a save schema of the past,
// a script that does not exist, a tool file that is gone, a capability called mounted that the code does not mount).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { check, documents, facts, releaseContradictions } from '../tools/docs-truth';

const DIR = 'tests/fixtures/docs-truth-tool-tmp';
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

describe('docs:truth', () => {
  it('the shipped documents agree with the code', () => {
    // The READMEs, CONTRIBUTING, SECURITY and the wiki's pages in both languages (4.5.0), never docs/en|fr.
    expect(documents().length).toBeGreaterThan(400);
    expect(documents()).toContain('wiki/fr/reference.npm-scripts.md');
    expect(documents().filter((d) => /^docs\//.test(d))).toEqual([]);
    expect(check()).toEqual([]);
    expect(facts()).toMatchObject({ saveSchema: 4, wsrunSchema: 2 });
  });
  it('finds a save schema of the past, a missing script, a missing tool file', () => {
    mkdirSync(DIR, { recursive: true });
    const page = `${DIR}/page.md`;
    writeFileSync(
      page,
      [
        'Saves are envelopes `{ format, schema: 3, gameId }`.',
        'Run `npm run no-such-script` first, then `npm run -s mcp`, `npm run -s <script>`, `npm run field:*`.',
        'See `tools/no-such-tool.ts`.',
      ].join('\n'),
    );
    const found = check([page]).map((c) => `${c.line}: ${c.what}`);
    expect(found).toEqual([
      '1: a save envelope is schema 4, the text says 3',
      "2: `npm run no-such-script`: no such script in package.json nor in a created game's",
      '3: `tools/no-such-tool.ts`: no such file',
    ]);
  });
  it('lets the install name a release candidate of the version, and only then an older current release', () => {
    const url = (tag: string, v: string) =>
      `T=https://github.com/wanoo/web-scumm/releases/download/${tag}/web-scumm-${v}.tgz`;
    const current = (v: string) =>
      `Current release: [v${v} "X"](https://github.com/wanoo/web-scumm/releases/tag/v${v}).`;
    const said = (t: string) => releaseContradictions('R.md', t, '4.2.0').map((c) => c.what);
    // The stable form, and the campaign's: the rc archive while the last published release is still current.
    expect(said([url('v4.2.0', '4.2.0'), current('4.2.0')].join('\n'))).toEqual([]);
    expect(said([url('v4.2.0-rc.1', '4.2.0'), current('4.1.20')].join('\n'))).toEqual([]);
    expect(said([url('v4.2.0-rc.1', '4.2.0'), current('4.2.0')].join('\n'))).toEqual([]);
    // An older current release without a candidate install, another version's archive, a newer link: refused.
    expect(said([url('v4.2.0', '4.2.0'), current('4.1.20')].join('\n'))).toEqual([
      'names v4.1.20 as the current release, the package is 4.2.0 (an older one only while the install names a release candidate of it)',
    ]);
    expect(said([url('v4.1.20', '4.1.20'), current('4.1.20')].join('\n'))).toHaveLength(2);
    expect(said([url('v4.1.20-rc.1', '4.1.20'), current('4.1.20')].join('\n'))).toHaveLength(2);
    expect(said([url('v4.2.0-rc.1', '4.2.0'), current('4.3.0')].join('\n'))).toHaveLength(2);
    // Another version's archive under a good tag, a tag that is no release candidate, a zero-led one (second reading).
    expect(said([url('v4.2.0-rc.1', '4.1.20'), current('4.1.20')].join('\n'))).toEqual([
      'downloads 4.1.20 from v4.2.0-rc.1, not web-scumm-4.2.0.tgz',
    ]);
    for (const tag of ['v4.2.0-rc.1x', 'v4.2.0-beta', 'v4.2.0-rc.01'])
      expect(said([url(tag, '4.2.0'), current('4.2.0')].join('\n')), tag).toEqual([
        `names ${tag}, neither v4.2.0 nor a v4.2.0-rc.N release`,
      ]);
    // A stray bad tag beside a good rc does not keep "current release" older.
    expect(said([url('v4.2.0-rc.1', '4.2.0'), url('v4.2.0-beta', '4.2.0'), current('4.1.20')].join('\n'))).toHaveLength(
      2,
    );
  });
});
