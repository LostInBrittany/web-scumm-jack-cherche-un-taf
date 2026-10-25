// The publication record and the wiki's push (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.1 to §4.5.4 and §4.5.7,
// phase A5b): the ordering rule (SemVer, then the revision, across versions as well as within one), a pre-release
// refused, the preview once, a revision immutable, `--rollback-to` the one way back, an older version's fix recorded
// for Pages without moving the wiki or latest; then the push itself, on throwaway bare repositories standing for the
// wiki: the content replaced (redirect pages kept), the record written, one commit, and no commit when nothing changed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main } from '../tools/wiki';
import { type ArchiveOptions, buildArchive, readArchive } from '../tools/wiki/archive';
import { readManifest } from '../tools/wiki/manifest';
import {
  compareStates,
  nextRevision,
  refProblem,
  decide,
  emptyPublication,
  gitEnv,
  keyAuth,
  parsePublication,
  type Promotion,
  type Publication,
  pushWiki,
  REDIRECT_MARKER,
} from '../tools/wiki/publication';

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
const sha = (c: string) => c.repeat(64);
const promo = (version: string, revision: string, s = sha('a'), o: Partial<Promotion> = {}): Promotion => ({
  version,
  revision,
  sha256: s,
  tag: revision === 'r1' ? `v${version}` : `docs-v${version}-${revision}`,
  date: '2026-11-01',
  docRevision: 'd'.repeat(40),
  buildId: '1',
  ...o,
});
/** A record after the given promotions, each required to pass. */
function after(...steps: [Promotion, { rollbackTo?: string }?][]): Publication {
  let r = emptyPublication();
  for (const [p, o] of steps) {
    const d = decide(r, p, o);
    if (!d.ok) throw new Error(d.problem);
    r = d.record;
  }
  return r;
}
const refused = (r: Publication, p: Promotion, o: { rollbackTo?: string } = {}) => {
  const d = decide(r, p, o);
  return d.ok ? 'accepted' : d.problem;
};

describe('the ordering rule', () => {
  it('compares SemVer first, then the revision number (r10 after r9)', () => {
    expect(compareStates({ version: '4.5.0', revision: 'r10' }, { version: '4.5.0', revision: 'r9' })).toBeGreaterThan(
      0,
    );
    expect(compareStates({ version: '4.5.1', revision: 'r1' }, { version: '4.5.0', revision: 'r9' })).toBeGreaterThan(
      0,
    );
    expect(compareStates({ version: '4.10.0', revision: 'r1' }, { version: '4.9.0', revision: 'r1' })).toBeGreaterThan(
      0,
    );
  });

  it('a first release moves latest and the wiki; the same state again changes nothing', () => {
    const d = decide(emptyPublication(), promo('4.5.0', 'r1'));
    expect(d.ok && d.wiki).toBe(true);
    const r = after([promo('4.5.0', 'r1')]);
    expect(r.latest).toEqual({
      version: '4.5.0',
      revision: 'r1',
      sha256: sha('a'),
      date: '2026-11-01',
      docRevision: 'd'.repeat(40),
      buildId: '1',
    });
    expect(r.versions['4.5.0']).toEqual({
      approved: 'r1',
      revisions: {
        r1: { sha256: sha('a'), tag: 'v4.5.0', date: '2026-11-01', docRevision: 'd'.repeat(40), buildId: '1' },
      },
    });
    const again = decide(r, promo('4.5.0', 'r1', sha('a'), { date: '2026-12-01' }));
    expect(again.ok && again.record).toEqual(r);
    expect(again.ok && again.note).toMatch(/already the latest/);
  });

  it('a newer revision or version moves latest; an older one is refused, within and across versions', () => {
    const r = after([promo('4.5.0', 'r1')], [promo('4.5.0', 'r2', sha('b'))], [promo('4.6.0', 'r1', sha('c'))]);
    expect(r.latest?.version).toBe('4.6.0');
    expect(r.versions['4.5.0']!.approved).toBe('r2');
    // Within a version: r1 after r2 is going back.
    expect(refused(after([promo('4.5.0', 'r1')], [promo('4.5.0', 'r2', sha('b'))]), promo('4.5.0', 'r1'))).toMatch(
      /older than its approved revision r2/,
    );
    // Across versions: the latest's own version cannot go back either.
    expect(refused(r, promo('4.6.0', 'r1', sha('c')))).toBe('accepted');
    expect(refused(r, promo('4.5.0', 'r1'))).toMatch(/older than its approved revision r2/);
  });

  it("an older version's fix is recorded for /docs/<v>/, and leaves the wiki and latest where they are", () => {
    const r = after([promo('4.5.0', 'r1')], [promo('4.6.0', 'r1', sha('c'))]);
    const d = decide(r, promo('4.5.0', 'r2', sha('b')));
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.wiki).toBe(false);
    expect(d.record.latest).toEqual(r.latest);
    expect(d.record.versions['4.5.0']!.approved).toBe('r2');
    expect(d.note).toMatch(/the wiki and latest stay on 4\.6\.0 r1/);
    // A patch of an older line, never published before: recorded the same way.
    const patch = decide(r, promo('4.5.1', 'r1', sha('e')));
    expect(patch.ok && !patch.wiki && patch.record.versions['4.5.1']?.approved).toBe('r1');
  });

  it('a doc revision is immutable: the same revision with other bytes is refused', () => {
    expect(refused(after([promo('4.5.0', 'r1')]), promo('4.5.0', 'r1', sha('f')))).toMatch(/immutable/);
  });

  it('a pre-release never publishes the wiki nor latest', () => {
    expect(refused(emptyPublication(), promo('4.5.0-rc.1', 'r1'))).toMatch(/pre-release.*\/docs\/4\.5\.0-rc\.1\//);
  });

  it('--rollback-to is the one way back, and names the archive given', () => {
    const r = after([promo('4.5.0', 'r1')], [promo('4.5.0', 'r2', sha('b'))], [promo('4.6.0', 'r1', sha('c'))]);
    const back = decide(r, promo('4.5.0', 'r2', sha('b')), { rollbackTo: '4.5.0-r2' });
    expect(back.ok && back.wiki).toBe(true);
    expect(back.ok && back.record.latest).toMatchObject({ version: '4.5.0', revision: 'r2' });
    // Within a version too, and a bare version means r1.
    const r1 = decide(r, promo('4.5.0', 'r1'), { rollbackTo: '4.5.0' });
    expect(r1.ok && r1.record.versions['4.5.0']!.approved).toBe('r1');
    expect(refused(r, promo('4.5.0', 'r1'), { rollbackTo: '4.5.0-r2' })).toMatch(/does not name the archive/);
    expect(refused(r, promo('4.6.0', 'r1', sha('c')), { rollbackTo: '4.6.0' })).toMatch(/not older/);
    expect(refused(r, promo('4.5.0', 'r1'), { rollbackTo: 'latest' })).toMatch(/<version> or <version>-r<n>/);
    // After a rollback a newer state moves forward again.
    const forward = decide(back.ok ? back.record : r, promo('4.6.0', 'r1', sha('c')));
    expect(forward.ok && forward.record.latest?.version).toBe('4.6.0');
  });

  it('the preview happens before any release, and a release ends it', () => {
    const pre = after([promo('4.5.0', 'r1', sha('9'), { preview: true, tag: 'docs-v4.5.0-preview-abcdefabcdef' })]);
    expect(pre.latest).toBeNull();
    expect(pre.preview).toMatchObject({ version: '4.5.0', sha256: sha('9') });
    const released = after(
      [promo('4.5.0', 'r1', sha('9'), { preview: true, tag: 'docs-v4.5.0-preview-abcdefabcdef' })],
      [promo('4.5.0', 'r1')],
    );
    expect(released.preview).toBeUndefined();
    expect(refused(released, promo('4.5.1', 'r1', sha('8'), { preview: true }))).toMatch(/bootstrap's one exception/);
  });

  it('reads its own format and refuses another, or a record that approves what it does not hold', () => {
    const r = after([promo('4.5.0', 'r1')]);
    expect(parsePublication(JSON.stringify(r))).toEqual(r);
    expect(() => parsePublication(JSON.stringify({ ...r, version: 2 }))).toThrow(/format version 2/);
    expect(() => parsePublication(JSON.stringify({ ...r, format: 'x' }))).toThrow(
      /not a quest-n-click-docs-publication/,
    );
    const bad = structuredClone(r);
    bad.versions['4.5.0']!.approved = 'r3';
    expect(() => parsePublication(JSON.stringify(bad))).toThrow(/approves r3, not recorded/);
  });
});

describe('the doc revision a run from docs/<v> publishes', () => {
  it('the next after the last released; the last again when its record never went out', () => {
    expect(nextRevision('4.5.0', ['v4.5.0'], null)).toEqual({ revision: 'r2', existing: false });
    const r2 = after([promo('4.5.0', 'r1')], [promo('4.5.0', 'r2', sha('b'))]);
    expect(nextRevision('4.5.0', ['v4.5.0', 'docs-v4.5.0-r2', 'docs-v4.6.0-r7'], r2)).toEqual({
      revision: 'r3',
      existing: false,
    });
    // r3's release went out, its record did not: the run completes r3, never skips to r4.
    expect(nextRevision('4.5.0', ['v4.5.0', 'docs-v4.5.0-r2', 'docs-v4.5.0-r3'], r2)).toEqual({
      revision: 'r3',
      existing: true,
    });
    expect(nextRevision('4.5.0', ['docs-v4.5.0-r10', 'docs-v4.5.0-r9'], null)).toEqual({
      revision: 'r10',
      existing: true,
    });
  });
});

describe('how git reaches the wiki', () => {
  it('passes a token as a header, never in a URL or an argument', () => {
    const env = gitEnv({ kind: 'token', token: 'secret-token' });
    expect(env.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
    expect(env.GIT_CONFIG_VALUE_0).toBe(
      `AUTHORIZATION: basic ${Buffer.from('x-access-token:secret-token').toString('base64')}`,
    );
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('writes a deploy key readable by its owner only, with GitHub host keys pinned', () => {
    const dir = tmp('wiki-key-');
    const auth = keyAuth(join(dir, 'ssh'), '-----BEGIN OPENSSH PRIVATE KEY-----\nx\n-----END OPENSSH PRIVATE KEY-----');
    expect(auth.kind).toBe('key');
    if (auth.kind !== 'key') return;
    if (process.platform !== 'win32') expect(statSync(auth.keyFile).mode & 0o777).toBe(0o600);
    expect(readFileSync(auth.knownHosts, 'utf8')).toMatch(/^github\.com ssh-ed25519 /);
    expect(gitEnv(auth).GIT_SSH_COMMAND).toMatch(/StrictHostKeyChecking=yes/);
  });
});

// ——— The push, on bare repositories ———

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A bare repository standing for the wiki, with the Home page the maintainer created (A1) and an old redirect page. */
function wikiRemote(): string {
  const root = tmp('wiki-remote-');
  const bare = join(root, 'wiki.git');
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=master', bare]);
  const seed = join(root, 'seed');
  execFileSync('git', ['clone', '--quiet', bare, seed], { stdio: 'ignore' });
  writeFileSync(join(seed, 'Home.md'), 'Created by hand.\n');
  writeFileSync(join(seed, 'Old-Page.md'), 'An old page, gone from the manifest.\n');
  mkdirSync(join(seed, 'en'));
  writeFileSync(
    join(seed, 'en', 'EN-Old-Name.md'),
    `${REDIRECT_MARKER}\nMoved to [EN-Create-Rooms](EN-Create-Rooms).\n`,
  );
  git(seed, 'add', '-A');
  git(seed, 'commit', '--quiet', '-m', 'Home');
  git(seed, 'push', '--quiet', 'origin', 'HEAD:master');
  return bare;
}
const archiveOf = (o: Partial<ArchiveOptions> = {}) =>
  buildArchive({
    root: resolve('.'),
    wikiDir: BASE,
    manifest: readManifest(BASE).manifest!,
    productVersion: '4.5.0',
    productCommit: 'c'.repeat(40),
    docRevision: 'd'.repeat(40),
    revision: 'r1',
    buildId: '1',
    identifiers: [],
    ...o,
  });
const wikiOf = (bytes: Buffer) =>
  new Map(
    [...readArchive(bytes).files].filter(([k]) => k.startsWith('wiki/')).map(([k, v]) => [k.slice('wiki/'.length), v]),
  );
/** What the bare repository holds at its tip: files and the last commit's subject. */
function tip(bare: string) {
  const out = tmp('wiki-tip-');
  execFileSync('git', ['clone', '--quiet', bare, join(out, 'c')], { stdio: 'ignore' });
  const c = join(out, 'c');
  return {
    files: git(c, 'ls-files').split('\n').filter(Boolean).sort(),
    subject: git(c, 'log', '-1', '--format=%s'),
    commits: Number(git(c, 'rev-list', '--count', 'HEAD')),
    read: (f: string) => readFileSync(join(c, f), 'utf8'),
  };
}
const push = (bare: string, bytes: Buffer, p: Promotion, o: { rollbackTo?: string; beforePush?: () => void } = {}) =>
  pushWiki({
    remote: bare,
    auth: { kind: 'none' },
    workDir: join(tmp('wiki-work-'), 'clone'),
    promotion: p,
    wiki: wikiOf(bytes),
    push: true,
    ...o,
  });
const sumOf = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('the push to the wiki', () => {
  const r1 = archiveOf();
  const r1sum = sumOf(r1.bytes);

  it("replaces the content with the archive's wiki, keeps a generated redirect, writes the record, one commit", () => {
    const bare = wikiRemote();
    const r = push(bare, r1.bytes, promo('4.5.0', 'r1', r1sum));
    expect(r).toMatchObject({ ok: true, committed: true, pushed: true, wiki: true });
    const t = tip(bare);
    expect(t.subject).toBe(`wiki: 4.5.0 r1 (${'d'.repeat(40)})`);
    expect(t.files).toContain('en/EN-Create-Rooms.md');
    expect(t.files).toContain('publication.json');
    expect(t.files).toContain('en/EN-Old-Name.md');
    expect(t.files).not.toContain('Old-Page.md');
    expect(t.files).not.toContain('.quest-n-click-wiki-build');
    expect(t.read('Home.md')).toMatch(/^# quest'n'click/);
    expect(parsePublication(t.read('publication.json')).latest).toMatchObject({
      version: '4.5.0',
      revision: 'r1',
      sha256: r1sum,
    });
  });

  it('is idempotent: the same archive again makes no commit', () => {
    const bare = wikiRemote();
    push(bare, r1.bytes, promo('4.5.0', 'r1', r1sum));
    const before = tip(bare).commits;
    const again = push(bare, r1.bytes, promo('4.5.0', 'r1', r1sum, { date: '2027-01-01' }));
    expect(again).toMatchObject({ ok: true, committed: false, pushed: false });
    expect(tip(bare).commits).toBe(before);
  });

  it("an older version's fix commits the record only; an older state, an rc, a changed revision are refused", () => {
    const bare = wikiRemote();
    push(bare, r1.bytes, promo('4.5.0', 'r1', r1sum));
    const v46 = archiveOf({ productVersion: '4.6.0' });
    expect(push(bare, v46.bytes, promo('4.6.0', 'r1', sumOf(v46.bytes)))).toMatchObject({ ok: true, wiki: true });
    const rooms = tip(bare).read('en/EN-Create-Rooms.md');
    const r2 = archiveOf({ revision: 'r2' });
    const fix = push(bare, r2.bytes, promo('4.5.0', 'r2', sumOf(r2.bytes)));
    expect(fix).toMatchObject({ ok: true, committed: true, wiki: false });
    const t = tip(bare);
    expect(t.read('en/EN-Create-Rooms.md')).toBe(rooms);
    const record = parsePublication(t.read('publication.json'));
    expect(record.latest?.version).toBe('4.6.0');
    expect(record.versions['4.5.0']!.approved).toBe('r2');
    expect(push(bare, r1.bytes, promo('4.5.0', 'r1', r1sum))).toMatchObject({ ok: false });
    expect(push(bare, r1.bytes, promo('4.6.0-rc.1', 'r1', r1sum))).toMatchObject({ ok: false });
    expect(push(bare, r1.bytes, promo('4.6.0', 'r1', r1sum))).toMatchObject({ ok: false });
    // The rollback, on purpose.
    const back = push(bare, r2.bytes, promo('4.5.0', 'r2', sumOf(r2.bytes)), { rollbackTo: '4.5.0-r2' });
    expect(back).toMatchObject({ ok: true, wiki: true, committed: true });
    expect(parsePublication(tip(bare).read('publication.json')).latest).toMatchObject({
      version: '4.5.0',
      revision: 'r2',
    });
  });

  it('refuses a push the wiki moved under (non-fast-forward): nothing published, the other state kept', () => {
    const bare = wikiRemote();
    const other = () => {
      const c = join(tmp('wiki-other-'), 'c');
      execFileSync('git', ['clone', '--quiet', bare, c], { stdio: 'ignore' });
      writeFileSync(join(c, 'Home.md'), 'Edited on the web meanwhile.\n');
      git(c, 'commit', '--quiet', '-am', 'a web edit');
      git(c, 'push', '--quiet', 'origin', 'HEAD:master');
    };
    const r = push(bare, r1.bytes, promo('4.5.0', 'r1', r1sum), { beforePush: other });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.problem).toMatch(/push was refused, nothing published \(the wiki moved since the clone\)/);
    expect(tip(bare).subject).toBe('a web edit');
  });

  it('`wiki -- publish` writes from the one ref its mode allows: a rollback off main is refused', () => {
    expect(refProblem('rollback', 'refs/heads/docs/4.5.0', '4.5.0')).toMatch(
      /rollback publishes from refs\/heads\/main/,
    );
    expect(refProblem('promote', 'refs/heads/feature/x', '4.5.0')).toMatch(/from refs\/heads\/main/);
    expect(refProblem('preview', 'refs/heads/main', '4.5.0')).toBeUndefined();
    // A release from its own tag's push (4.5.3, #291): release.yml no longer runs on main's workflow_run.
    expect(refProblem('release', 'refs/tags/v4.5.0', '4.5.0')).toBeUndefined();
    expect(refProblem('release', 'refs/tags/v4.5.0-rc.1', '4.5.0-rc.1')).toBeUndefined();
    expect(refProblem('release', 'refs/heads/main', '4.5.0')).toMatch(/release publishes from refs\/tags\/v4\.5\.0/);
    expect(refProblem('release', 'refs/tags/v4.4.0', '4.5.0')).toMatch(/not from refs\/tags\/v4\.4\.0/);
    expect(refProblem('revision', 'refs/heads/docs/4.5.0', '4.5.0')).toBeUndefined();
    expect(refProblem('revision', 'refs/heads/main', '4.5.0')).toMatch(/refs\/heads\/docs\/4\.5\.0/);
    const dir = tmp('wiki-publish-ref-');
    const file = join(dir, 'quest-n-click-docs-4.5.0.tar.gz');
    writeFileSync(file, r1.bytes);
    const bare = wikiRemote();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const args = ['publish', '--target', 'wiki', '--tag', 'v4.5.0', '--archive', file, '--remote', bare];
      const v = ['--version', '4.5.0', '--revision', 'r1'];
      expect(
        main([...args, ...v, '--mode', 'rollback', '--ref', 'refs/heads/docs/4.5.0', '--rollback-to', '4.5.0']),
      ).toBe(1);
      expect(main([...args, ...v, '--mode', 'rollback', '--ref', 'refs/heads/main'])).toBe(1);
      expect(main([...args, ...v, '--mode', 'release', '--ref', 'refs/tags/v4.5.0', '--rollback-to', '4.5.0'])).toBe(1);
      expect(main([...args, ...v, '--ref', 'refs/heads/main'])).toBe(2);
      const said = err.mock.calls.flat().join('\n');
      expect(said).toMatch(/a rollback publishes from refs\/heads\/main, not from refs\/heads\/docs\/4\.5\.0/);
      expect(said).toMatch(/a rollback needs --rollback-to/);
      expect(said).toMatch(/--rollback-to is the rollback mode only/);
      expect(tip(bare).subject).toBe('Home');
    } finally {
      err.mockRestore();
    }
  });

  it('`wiki -- publish` checks the archive against --sha256 and its identity before anything', () => {
    const dir = tmp('wiki-publish-cli-');
    const file = join(dir, 'quest-n-click-docs-4.5.0.tar.gz');
    writeFileSync(file, r1.bytes);
    const bare = wikiRemote();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const at = ['publish', '--target', 'wiki', '--tag', 'v4.5.0', '--archive', file, '--remote', bare];
      const base = [...at, '--mode', 'release', '--ref', 'refs/tags/v4.5.0'];
      expect(main([...base, '--version', '4.5.0', '--revision', 'r1', '--sha256', sha('0')])).toBe(1);
      expect(main([...base, '--version', '4.6.0', '--revision', 'r1'])).toBe(1);
      expect(
        main([...at, '--mode', 'promote', '--ref', 'refs/heads/main', '--version', '4.5.0', '--revision', 'r2']),
      ).toBe(1);
      expect(err.mock.calls.flat().join('\n')).toMatch(/not the verified|is 4\.5\.0 r1, not 4\.6\.0 r1/);
      expect(main([...base, '--version', '4.5.0', '--revision', 'r1', '--sha256', r1sum, '--dry-run'])).toBe(0);
      expect(log.mock.calls.flat().join('\n')).toMatch(/committed, not pushed/);
      expect(tip(bare).subject).toBe('Home');
      expect(main([...base, '--version', '4.5.0', '--revision', 'r1', '--sha256', r1sum])).toBe(0);
      expect(tip(bare).subject).toMatch(/^wiki: 4\.5\.0 r1/);
      expect(existsSync(file)).toBe(true);
    } finally {
      err.mockRestore();
      log.mockRestore();
    }
  });
});
