// Pages' `/docs/` (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.4 and §4.5.5, phase A5b), assembled from fixture
// releases the way ci.yml does from the real ones: each revision's `html/` copied byte for byte to `/docs/<v>/r<n>/`,
// the aliases `/docs/<v>/` and `/docs/latest/` to what `publication.json` approves (and say they are aliases), an rc
// at `/docs/<v-rc>/` without moving latest, `/docs/preview/` only in the bootstrap, a placeholder pointing to 4.4.0
// when nothing is released; an archive that is not its release's (sums, candidate manifest, identity) or a record that
// names another archive is refused. The §4.5.5 test: the tree is the same bytes whatever the branch's `wiki/` holds,
// an unreleased change included, because it is assembled from the archives alone.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main } from '../tools/wiki';
import { type ArchiveOptions, buildArchive, readArchive } from '../tools/wiki/archive';
import { readManifest } from '../tools/wiki/manifest';
import {
  type AssembleOptions,
  assemblePages,
  attestationTries,
  docsTag,
  ghAttestation,
  identitiesOf,
} from '../tools/wiki/pages';
import { decide, emptyPublication, type Promotion, type Publication } from '../tools/wiki/publication';

const BASE = resolve('tests/fixtures/wiki/base');
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
const sum = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const archive = (o: Partial<ArchiveOptions> = {}) =>
  buildArchive({
    root: resolve('.'),
    wikiDir: BASE,
    manifest: readManifest(o.wikiDir ?? BASE).manifest!,
    productVersion: '4.5.0',
    productCommit: 'c'.repeat(40),
    docRevision: 'd'.repeat(40),
    revision: 'r1',
    buildId: '1',
    identifiers: [],
    ...o,
  });

/** A release's folder as `downloadReleases` fills it: the archive, the sums, and a product release's candidate manifest. */
function release(dir: string, tag: string, bytes: Buffer, name: string, o: { sums?: string; candidate?: string } = {}) {
  const at = join(dir, tag);
  mkdirSync(at, { recursive: true });
  writeFileSync(join(at, name), bytes);
  const sumsName = tag.startsWith('v')
    ? `quest-n-click-${tag}-SHA256SUMS`
    : `${name.replace(/\.tar\.gz$/, '')}-SHA256SUMS`;
  writeFileSync(join(at, sumsName), `${o.sums ?? sum(bytes)}  ${name}\n`);
  if (tag.startsWith('v')) {
    const pkg = tag.slice(1).replace(/-.*$/, '');
    writeFileSync(
      join(at, `quest-n-click-${tag}-candidate.json`),
      JSON.stringify({
        artifacts: [{ name: `docs/quest-n-click-docs-${pkg}.tar.gz`, sha256: o.candidate ?? sum(bytes) }],
      }),
    );
  }
}
const record = (...steps: Promotion[]): Publication =>
  steps.reduce((r, p) => {
    const d = decide(r, p);
    if (!d.ok) throw new Error(d.problem);
    return d.record;
  }, emptyPublication());
const promo = (version: string, revision: string, bytes: Buffer, o: Partial<Promotion> = {}): Promotion => {
  const m = readArchive(bytes).manifest;
  return {
    version,
    revision,
    sha256: sum(bytes),
    tag: revision === 'r1' ? `v${version}` : `docs-v${version}-${revision}`,
    date: '2026-11-01',
    docRevision: m.docRevision,
    ...(m.buildId ? { buildId: m.buildId } : {}),
    ...o,
  };
};
/** Pages' assembly with every attestation accepted, unless a test gives its verifier. */
const assemble = (o: Omit<AssembleOptions, 'verify'> & { verify?: AssembleOptions['verify'] }) =>
  assemblePages({ verify: () => {}, ...o });

/** Three releases: 4.5.0 (r1 and its fix r2), and 4.6.0-rc.1; 4.5.0 r2 approved and latest. */
function fixture(wikiDir = BASE) {
  const dir = tmp('pages-releases-');
  const r1 = archive({ wikiDir });
  const r2 = archive({ wikiDir, revision: 'r2', docRevision: 'e'.repeat(40) });
  const rc = archive({ wikiDir, productVersion: '4.6.0', productCommit: 'f'.repeat(40), docRevision: 'f'.repeat(40) });
  release(dir, 'v4.5.0', r1.bytes, 'quest-n-click-docs-4.5.0.tar.gz');
  release(dir, 'docs-v4.5.0-r2', r2.bytes, 'quest-n-click-docs-4.5.0-r2.tar.gz');
  release(dir, 'v4.6.0-rc.1', rc.bytes, 'quest-n-click-docs-4.6.0-rc.1.tar.gz');
  const pub = record(promo('4.5.0', 'r1', r1.bytes), promo('4.5.0', 'r2', r2.bytes));
  return { dir, r1, r2, rc, pub };
}
const html = (files: Map<string, Buffer>, path: string) => files.get(path)?.toString('utf8') ?? '';

describe('the tags Pages reads', () => {
  it('releases from 4.5.0 (rcs included), doc revisions from r2, previews; nothing older', () => {
    expect(docsTag('v4.5.0')).toEqual({ kind: 'release', version: '4.5.0', revision: 'r1', prerelease: false });
    expect(docsTag('v4.5.0-rc.2')).toMatchObject({ kind: 'release', prerelease: true });
    expect(docsTag('v4.4.0')).toBeUndefined();
    expect(docsTag('v4.4.9-rc.1')).toBeUndefined();
    expect(docsTag('docs-v4.5.0-r2')).toEqual({ kind: 'revision', version: '4.5.0', revision: 'r2' });
    expect(docsTag('docs-v4.5.0-r1')).toBeUndefined();
    expect(docsTag('docs-v4.5.0-rc.1-r2')).toBeUndefined();
    expect(docsTag('docs-v4.5.0-preview-0123456789ab')).toEqual({ kind: 'preview', version: '4.5.0' });
  });
});

describe('/docs/, from the released archives only', () => {
  const f = fixture();
  const files = assemble({ releasesDir: f.dir, publication: f.pub });

  it("copies each revision's html/ as it is, byte for byte, under its permalink", () => {
    for (const [at, a] of [
      ['4.5.0/r1', f.r1],
      ['4.5.0/r2', f.r2],
      ['4.6.0-rc.1/r1', f.rc],
    ] as const) {
      const site = [...readArchive(a.bytes).files].filter(([k]) => k.startsWith('html/'));
      expect(site.length).toBeGreaterThan(10);
      for (const [k, v] of site) expect(files.get(`${at}/${k.slice(5)}`)?.equals(v), `${at}/${k}`).toBe(true);
    }
  });

  it('makes /docs/<v>/ and /docs/latest/ aliases of the approved revision, said as aliases, the #section kept', () => {
    const alias = html(files, '4.5.0/en/create.rooms.html');
    expect(alias).toContain('This address is an alias of <a href="../r2/en/create.rooms.html">');
    expect(alias).toContain('location.replace("../r2/en/create.rooms.html" + location.hash)');
    expect(html(files, '4.5.0/index.html')).toContain('href="r2/index.html"');
    expect(html(files, 'latest/fr/create.exits.html')).toContain('href="../../4.5.0/r2/fr/create.exits.html"');
    expect(html(files, 'latest/index.html')).toContain('the latest');
    // An rc: its own alias to r1, never latest.
    expect(html(files, '4.6.0-rc.1/en/create.rooms.html')).toContain('href="../r1/en/create.rooms.html"');
    expect(html(files, 'latest/en/create.rooms.html')).not.toContain('4.6.0');
    expect(JSON.parse(html(files, 'publication.json'))).toEqual(f.pub);
    expect(html(files, 'index.html')).toContain('alias <a href="4.5.0/index.html">4.5.0/</a> → r2 (approved)');
    // No preview once a release is out.
    expect([...files.keys()].some((k) => k.startsWith('preview/'))).toBe(false);
  });

  it('is byte-identical whatever the branch holds in wiki/: an unreleased change never reaches /docs/ (§4.5.5)', () => {
    // A branch whose wiki gained a page change and an unreleased feature: what CI would build from it.
    const branch = tmp('pages-branch-wiki-');
    cpSync(BASE, branch, { recursive: true });
    const page = join(branch, 'en', 'create.rooms.md');
    writeFileSync(page, `${readFileSync(page, 'utf8')}\nThe UNRELEASED-TELEPORTER feature, on main only.\n`);
    const fromBranch = archive({ wikiDir: branch });
    expect(fromBranch.bytes.equals(f.r1.bytes)).toBe(false);
    // Pages assembles from the releases: the same tree, to the byte, with nothing of the branch in it.
    const again = assemble({ releasesDir: f.dir, publication: f.pub });
    expect([...again.keys()]).toEqual([...files.keys()]);
    for (const [k, v] of files) expect(again.get(k)!.equals(v), k).toBe(true);
    expect([...again.values()].some((v) => v.includes('UNRELEASED-TELEPORTER'))).toBe(false);
  });

  it('`wiki -- pages --releases` writes the same tree, and refuses a folder that is not empty', () => {
    const out = join(tmp('pages-out-'), 'site');
    const pub = join(tmp('pages-pub-'), 'publication.json');
    writeFileSync(pub, JSON.stringify(f.pub));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(main(['pages', '--releases', f.dir, '--skip-attestations', '--publication', pub, '--out', out])).toBe(0);
      for (const [k, v] of files) expect(readFileSync(join(out, k)).equals(v), k).toBe(true);
      expect(main(['pages', '--releases', f.dir, '--skip-attestations', '--publication', pub, '--out', out])).toBe(1);
      expect(err.mock.calls.flat().join('\n')).toMatch(/not empty/);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });
});

describe('what /docs/ refuses', () => {
  it('an archive that is not the one its release sums, or not the candidate’s, or of another identity', () => {
    const a = archive();
    const sums = tmp('pages-bad-sums-');
    release(sums, 'v4.5.0', a.bytes, 'quest-n-click-docs-4.5.0.tar.gz', { sums: '0'.repeat(64) });
    expect(() => assemble({ releasesDir: sums, publication: null })).toThrow(/does not match its SHA256SUMS/);
    const cand = tmp('pages-bad-candidate-');
    release(cand, 'v4.5.0', a.bytes, 'quest-n-click-docs-4.5.0.tar.gz', { candidate: '1'.repeat(64) });
    expect(() => assemble({ releasesDir: cand, publication: null })).toThrow(/not the archive the candidate/);
    const other = tmp('pages-bad-identity-');
    release(other, 'v4.5.1', a.bytes, 'quest-n-click-docs-4.5.1.tar.gz');
    expect(() => assemble({ releasesDir: other, publication: null })).toThrow(/built for 4\.5\.0, not 4\.5\.1/);
    const rev = tmp('pages-bad-revision-');
    release(rev, 'docs-v4.5.0-r3', a.bytes, 'quest-n-click-docs-4.5.0-r3.tar.gz');
    expect(() =>
      assemble({ releasesDir: rev, publication: record(promo('4.5.0', 'r3', a.bytes, { tag: 'docs-v4.5.0-r3' })) }),
    ).toThrow(/revision r1, not r3/);
  });

  it('a record naming a revision no release carries, or another archive', () => {
    const f = fixture();
    const missing = record(
      promo('4.5.0', 'r1', f.r1.bytes),
      promo('4.5.0', 'r2', f.r2.bytes),
      promo('4.7.0', 'r1', f.r1.bytes),
    );
    expect(() => assemble({ releasesDir: f.dir, publication: missing })).toThrow(/4\.7\.0 r1, which no release/);
    const wrong = record(
      promo('4.5.0', 'r1', f.r2.bytes),
      promo('4.5.0', 'r2', f.r2.bytes, { sha256: sum(f.r2.bytes) }),
    );
    expect(() => assemble({ releasesDir: f.dir, publication: wrong })).toThrow(/records 4\.5\.0 r1 as/);
  });
});

describe('what /docs/ serves is authenticated', () => {
  it('binds each archive to the workflow and ref that must have signed it', () => {
    const repo = 'Quest-n-Click/quest-n-click';
    expect(attestationTries(repo, 'v4.6.0', 'a.tgz')).toEqual([
      [
        'attestation',
        'verify',
        'a.tgz',
        '--repo',
        repo,
        '--signer-workflow',
        `${repo}/.github/workflows/release.yml`,
        '--format',
        'json',
      ],
    ]);
    const [revision] = attestationTries(repo, 'docs-v4.6.0-r2', 'a.tgz');
    expect(revision!.slice(-6, -2)).toEqual([
      '--signer-workflow',
      `${repo}/.github/workflows/docs-publish.yml`,
      '--source-ref',
      'refs/heads/docs/4.6.0',
    ]);
    expect(attestationTries(repo, 'docs-v4.6.0-preview-0123456789ab', 'a.tgz')[0]!.slice(-4, -2)).toEqual([
      '--source-ref',
      'refs/heads/main',
    ]);
    // A fork names its own repository, and only it.
    expect(attestationTries('someone/quest-n-click', 'v4.5.0', 'a.tgz')).toEqual([
      [
        'attestation',
        'verify',
        'a.tgz',
        '--repo',
        'someone/quest-n-click',
        '--signer-workflow',
        'someone/quest-n-click/.github/workflows/release.yml',
        '--format',
        'json',
      ],
    ]);
  });

  it('asks for an archive made before the transfer (4.5.2, D51) under wanoo, its workflow pinned', () => {
    const repo = 'Quest-n-Click/quest-n-click';
    const old = 'wanoo/quest-n-click';
    expect(identitiesOf(repo, 'v4.5.1')).toEqual([old]);
    expect(identitiesOf(repo, 'v4.5.2')).toEqual([repo]);
    expect(attestationTries(repo, 'v4.5.0', 'a.tgz')).toEqual([
      [
        'attestation',
        'verify',
        'a.tgz',
        '--owner',
        'wanoo',
        '--signer-workflow',
        `${old}/.github/workflows/release.yml`,
        '--format',
        'json',
      ],
    ]);
    // A doc revision or a preview of a version before 4.5.2 may come from either side of the transfer: both, in order.
    expect(identitiesOf(repo, 'docs-v4.5.1-r2')).toEqual([repo, old]);
    expect(attestationTries(repo, 'docs-v4.5.1-r2', 'a.tgz')).toEqual([
      [
        'attestation',
        'verify',
        'a.tgz',
        '--repo',
        repo,
        '--signer-workflow',
        `${repo}/.github/workflows/docs-publish.yml`,
        '--source-ref',
        'refs/heads/docs/4.5.1',
        '--format',
        'json',
      ],
      [
        'attestation',
        'verify',
        'a.tgz',
        '--owner',
        'wanoo',
        '--signer-workflow',
        `${old}/.github/workflows/docs-publish.yml`,
        '--source-ref',
        'refs/heads/docs/4.5.1',
        '--format',
        'json',
      ],
    ]);
    expect(identitiesOf(repo, 'docs-v4.5.2-preview-0123456789ab')).toEqual([repo]);
    // The repository's name in any case is the repository.
    expect(identitiesOf('quest-n-click/QUEST-N-CLICK', 'v4.5.0')).toEqual([old]);
  });

  it("accepts an archive only when every certificate names the repository's id (D51)", () => {
    const out = (id?: string) =>
      JSON.stringify([
        { verificationResult: { signature: { certificate: id ? { sourceRepositoryIdentifier: id } : {} } } },
      ]);
    const calls: string[][] = [];
    const answer = (o: string) => (args: string[]) => {
      calls.push(args);
      return o;
    };
    expect(() =>
      ghAttestation('Quest-n-Click/quest-n-click', answer(out('1402166796')))('a.tgz', 'v4.6.0'),
    ).not.toThrow();
    expect(calls[0]).toContain('--format');
    expect(() => ghAttestation('Quest-n-Click/quest-n-click', answer(out('999')))('a.tgz', 'v4.6.0')).toThrow(
      /v4\.6\.0: its archive's attestation does not verify \(an attestation names repository id 999, not 1402166796\)/,
    );
    expect(() => ghAttestation('Quest-n-Click/quest-n-click', answer(out()))('a.tgz', 'v4.6.0')).toThrow(
      /names no repository id/,
    );
    expect(() => ghAttestation('Quest-n-Click/quest-n-click', answer('[]'))('a.tgz', 'v4.6.0')).toThrow(
      /no attestation/,
    );
  });

  it('refuses an archive whose attestation does not verify, naming the release', () => {
    const f = fixture();
    const verify = (_file: string, tag: string) => {
      if (tag === 'docs-v4.5.0-r2')
        throw new Error(`${tag}: its archive's attestation does not verify (no attestation)`);
    };
    expect(() => assemble({ releasesDir: f.dir, publication: f.pub, verify })).toThrow(
      /docs-v4\.5\.0-r2: its archive's attestation/,
    );
    // Every served archive is verified, the release, the revision and the rc.
    const seen: string[] = [];
    assemble({ releasesDir: f.dir, publication: f.pub, verify: (_f, tag) => void seen.push(tag) });
    expect(seen.sort()).toEqual(['docs-v4.5.0-r2', 'v4.5.0', 'v4.6.0-rc.1']);
  });

  it('refuses a doc revision publication.json does not record, or records from another release', () => {
    const f = fixture();
    const unrecorded = record(promo('4.5.0', 'r1', f.r1.bytes));
    expect(() => assemble({ releasesDir: f.dir, publication: unrecorded })).toThrow(
      /docs-v4\.5\.0-r2: a doc revision publication\.json does not record/,
    );
    expect(() => assemble({ releasesDir: f.dir, publication: null })).toThrow(/docs-v4\.5\.0-r2: a doc revision/);
    const otherTag = structuredClone(f.pub);
    otherTag.versions['4.5.0']!.revisions.r2!.tag = 'docs-v4.5.0-r9';
    expect(() => assemble({ releasesDir: f.dir, publication: otherTag })).toThrow(
      /records 4\.5\.0 r2 from docs-v4\.5\.0-r9/,
    );
  });

  it('refuses a record whose latest its versions do not hold, with a message', () => {
    const f = fixture();
    const odd = structuredClone(f.pub);
    odd.latest = { ...odd.latest!, version: '4.9.0' };
    expect(() => assemble({ releasesDir: f.dir, publication: odd })).toThrow(
      /latest is 4\.9\.0 r2, which its versions do not record/,
    );
  });

  it('reads only the releases it is given (a cached folder of a deleted release is not served)', () => {
    const f = fixture();
    const files = assemble({ releasesDir: f.dir, tags: ['v4.5.0', 'docs-v4.5.0-r2'], publication: f.pub });
    expect([...files.keys()].some((k) => k.startsWith('4.6.0-rc.1/'))).toBe(false);
  });
});

describe('beside the game', () => {
  it("the game's service worker never answers a /docs/ page with the game (its navigation fallback skips /docs/)", () => {
    const vite = readFileSync('vite.config.ts', 'utf8');
    expect(vite).toMatch(/navigateFallback: 'index\.html',[\s\S]{0,300}navigateFallbackDenylist: \[\/\\\/docs\\\/\/\]/);
    // Under Pages' base path the worker's scope is /quest-n-click/: the pattern still matches the documentation's
    // pages there, and no page of the game.
    const pattern = /\/docs\//;
    for (const url of [
      '/quest-n-click/docs/',
      '/quest-n-click/docs/4.5.0/r1/en/create.rooms.html',
      '/quest-n-click/docs/latest/index.html',
    ])
      expect(pattern.test(url), url).toBe(true);
    for (const url of [
      '/quest-n-click/',
      '/quest-n-click/index.html',
      '/quest-n-click/?room=hall',
      '/quest-n-click/studio.html',
    ])
      expect(pattern.test(url), url).toBe(false);
    expect(vite).toMatch(/navigateFallbackDenylist: \[\/\\\/docs\\\/\/\]/);
  });
});

describe('the bootstrap', () => {
  it('nothing released: a placeholder pointing to the 4.4.0 documentation, and nothing else', () => {
    const files = assemble({ releasesDir: join(tmp('pages-none-'), 'absent'), publication: null });
    expect([...files.keys()]).toEqual(['index.html', 'style.css']);
    expect(html(files, 'index.html')).toContain('https://github.com/Quest-n-Click/quest-n-click/blob/v4.4.0/docs/');
  });

  it('a preview is served under /docs/preview/ while no release ≥ 4.5.0 exists, and only then', () => {
    const dir = tmp('pages-preview-');
    const p = archive({ preview: true });
    const tag = 'docs-v4.5.0-preview-0123456789ab';
    release(dir, tag, p.bytes, 'quest-n-click-docs-4.5.0-preview.tar.gz');
    const rc = archive();
    release(dir, 'v4.5.0-rc.1', rc.bytes, 'quest-n-click-docs-4.5.0-rc.1.tar.gz');
    const pub = record(promo('4.5.0', 'r1', p.bytes, { preview: true, tag }));
    const during = assemble({ releasesDir: dir, publication: pub });
    expect(during.get('preview/en/studio.notes.html')).toBeDefined();
    expect(html(during, 'index.html')).toContain('preview/index.html');
    expect(during.get('4.5.0-rc.1/r1/index.html')).toBeDefined();
    expect(during.has('latest/index.html')).toBe(false);
    // 4.5.0 is released and recorded: the preview goes.
    release(dir, 'v4.5.0', rc.bytes, 'quest-n-click-docs-4.5.0.tar.gz');
    const released = decide(pub, promo('4.5.0', 'r1', rc.bytes));
    if (!released.ok) throw new Error(released.problem);
    const after = assemble({ releasesDir: dir, publication: released.record });
    expect([...after.keys()].some((k) => k.startsWith('preview/'))).toBe(false);
    expect(after.has('latest/index.html')).toBe(true);
  });
});
