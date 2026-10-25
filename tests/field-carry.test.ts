// Carrying a people's pass (4.1.20 PR 4, plan §9, ADR 0024): bound to the files its surface reads, carried to a new
// candidate only when none of them changed (the version included), and counted only through an attestation the
// maintainer approved in a commit signed by a key the source candidate's .github/allowed_signers names.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  type CarryAttestation,
  CarryAttestationSchema,
  carriedPass,
  carryCheck,
  digestOfChanges,
  type Surfaces,
} from '../tools/field/carry';
import { FIELD_STATUSES, type FieldReport, FieldReportSchema, PASS_IDS, passesFor } from '../tools/field/schema';
import { rangeProblems, trustedApproval } from '../tools/field/trust';
// @ts-expect-error: a plain .mjs module without declarations
import { configDigest, globRe, surfacesOf } from '../tools/field/surfaces.mjs';

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'field-carry-'));
  temps.push(d);
  return d;
};
const declared = JSON.parse(readFileSync('docs/dev/surfaces.json', 'utf8'));
const h = (c: string) => c.repeat(64).slice(0, 64);

/** A candidate's files as its manifest names them, and its site's, for a version. */
function candidate(version: string, over: Record<string, string> = {}) {
  const v = version.replace(/-.*$/, '');
  const files: Record<string, string> = {
    [`pack/web-scumm-${v}.tgz`]: h('1'),
    [`pack/create-web-scumm-${v}.tgz`]: h('2'),
    [`pack/web-scumm-bridge-${v}.tgz`]: h('3'),
    [`pack/web-scumm-connectors-${v}.tgz`]: h('4'),
    'image/web-scumm-bridge-image.tar': h('5'),
    'image/web-scumm-bridge-image.json': h('6'),
    'image/web-scumm-bridge-image.cdx.json': h('7'),
    'sbom/web-scumm.cdx.json': h('8'),
    'baseline/baseline-x.json': h('9'),
    'wsrun/run-daily.wsrun': h('a'),
    'e2e-remix-speedrun.txt': h('b'),
    'site/dist.tar.gz': h('c'),
    'site/site-files.json': h('d'),
    'site/assets-manifest.json': h('e'),
  };
  const site: Record<string, string> = {
    'index.html': h('f'),
    'sw.js': h('0'),
    'site.json': h('1'),
    'manifest.webmanifest': h('2'),
    'og.png': h('3'),
    'assets/index-x.js': h('4'),
    'assets/index-x.css': h('7'),
    'data/dossier.bin': h('8'),
    'assets/audio/voice-1.ogg': h('5'),
    'assets/img/room.webp': h('6'),
  };
  for (const [k, d] of Object.entries(over))
    if (k.startsWith('site:')) site[k.slice(5)] = d;
    else files[k] = d;
  return { files, site };
}
const surfaces = (version: string, over: Record<string, string> = {}, config: Record<string, string> = {}): Surfaces =>
  surfacesOf({
    ...candidate(version, over),
    candidate: candidate(version, over).files,
    declared,
    version,
    config: (globs: string[]) => config[globs.join(',')] ?? h('9'),
  });
const all = (version: string, over: Record<string, string> = {}) => {
  const c = candidate(version, over);
  return { ...c.files, ...Object.fromEntries(Object.entries(c.site).map(([p, d]) => [`site:${p}`, d])) };
};

/** A 4.5.0 candidate, its files under the names of 4.2.5 on (D47), the Studio Server's archive among them. */
function candidate450() {
  const c = candidate('4.5.0', { 'pack/web-scumm-studio-server-4.5.0.tgz': h('7') });
  const files = Object.fromEntries(
    Object.entries(c.files).map(([f, d]) => [f.replace('web-scumm', 'quest-n-click'), d]),
  ) as Record<string, string>;
  return { files, site: c.site };
}
const surfaces450 = (config: Record<string, string> = {}): Surfaces =>
  surfacesOf({
    ...candidate450(),
    candidate: candidate450().files,
    declared,
    version: '4.5.0',
    config: (globs: string[]) => config[globs.join(',')] ?? h('9'),
  });
const all450 = () => {
  const c = candidate450();
  return { ...c.files, ...Object.fromEntries(Object.entries(c.site).map(([p, d]) => [`site:${p}`, d])) };
};

const FROM = { release: '4.1.20', commit: 'a'.repeat(40), candidateRun: '100' };
const TO = { release: '4.1.21', commit: 'b'.repeat(40), candidateRun: '200' };
const passed = (passId: (typeof PASS_IDS)[number]): FieldReport => ({
  schema: 1,
  passId,
  release: '4.1.20',
  commit: FROM.commit,
  candidateRun: FROM.candidateRun,
  packageDigests: {},
  status: 'passed',
  operator: 'tester',
  startedAt: '2026-10-13T10:00:00Z',
  finishedAt: '2026-10-13T11:00:00Z',
  environment: { os: 'iOS 19', versions: {} },
  scenario: 'played',
  evidence: [{ path: 'evidence/a.png', sha256: h('a'), kind: 'screenshot' }],
  failures: [],
});
/** Whether `passId` may be carried from a 4.1.20 candidate to another one whose files differ by `over`. */
const carries = (passId: (typeof PASS_IDS)[number], over: Record<string, string>, toVersion = '4.1.20', cfg = {}) => {
  const report = passed(passId);
  return carryCheck({
    report,
    reportBytes: JSON.stringify(report),
    from: FROM,
    to: TO,
    source: surfaces('4.1.20'),
    target: surfaces(toVersion, over, cfg),
    sourceFiles: all('4.1.20'),
    targetFiles: all(toVersion, over),
  });
};

describe('the surfaces of a candidate', () => {
  it('cover the passes of their release, each file in a surface or under status, every exclusion justified and tested', () => {
    const s = surfaces('4.1.20');
    expect(s.surfaces.map((x) => x.id).sort()).toEqual([...passesFor('4.1.20')].sort());
    // 4.2.1's two passes, from 4.2.1 on: bound to the engine's and the Studio Server's archives.
    const v421 = surfaces('4.2.1', { 'pack/web-scumm-studio-server-4.2.1.tgz': h('7') });
    expect(v421.surfaces.map((x) => x.id).sort()).toEqual([...passesFor('4.2.1')].sort());
    expect(v421.surfaces.map((x) => x.id)).not.toContain('studio-preview');
    // 4.2.2's two, from 4.2.2 on.
    const v422 = surfaces('4.2.2', { 'pack/web-scumm-studio-server-4.2.2.tgz': h('7') });
    expect(v422.surfaces.map((x) => x.id).sort()).toEqual([...passesFor('4.2.2')].sort());
    // 4.2.3's two, from 4.2.3 on.
    const v423 = surfaces('4.2.3', { 'pack/web-scumm-studio-server-4.2.3.tgz': h('7') });
    expect(v423.surfaces.map((x) => x.id).sort()).toEqual([...passesFor('4.2.3')].sort());
    // 4.4.0's two (the heroes example in two languages, the Studio's hero × language matrix). (This fake
    // candidate's files bear the names before 4.2.5; the candidate run checks 4.4.0's own surfaces.)
    expect(passesFor('4.4.0')).toEqual(PASS_IDS.filter((p) => p !== 'docs-beginner-reader'));
    // 4.5.0's one (a beginner reader on ten real questions, PLAN-4.5-WIKI §4.6 level 3): every pass.
    expect(passesFor('4.5.0')).toEqual([...PASS_IDS]);
    expect(passesFor('4.5.0-rc.1')).toContain('docs-beginner-reader');
    expect(passesFor('4.3.1')).not.toContain('heroes-two-languages');
    expect(passesFor('4.3.1')).not.toContain('studio-hero-matrix');
    expect(Object.keys(v421.surfaces.find((x) => x.id === 'studio-hosted')!.artifactDigests)).toContain(
      'pack/web-scumm-studio-server-4.2.1.tgz',
    );
    // 4.2.5 (D47): the packages read under their new names; the former names' aliases, the same files, under status.
    const c425 = candidate('4.2.5', { 'pack/web-scumm-studio-server-4.2.5.tgz': h('7') });
    const files425: Record<string, string> = {};
    for (const [f, d] of Object.entries(c425.files)) {
      if (!f.startsWith('image/')) files425[f] = d;
      if (/web-scumm/.test(f)) files425[f.replace('web-scumm', 'quest-n-click')] = d;
    }
    const v425: Surfaces = surfacesOf({
      candidate: files425,
      site: c425.site,
      declared,
      version: '4.2.5',
      config: () => h('9'),
    });
    expect(v425.surfaces.map((x) => x.id).sort()).toEqual([...passesFor('4.2.5')].sort());
    const read = v425.surfaces.flatMap((x) => Object.keys(x.artifactDigests));
    expect(read).toContain('pack/quest-n-click-4.2.5.tgz');
    expect(read).toContain('image/quest-n-click-bridge-image.tar');
    // The aliases are read by the archives' own pass only (it installs every archive), never in place of a package.
    for (const x of v425.surfaces)
      if (x.id !== 'archive-human-install')
        expect(
          Object.keys(x.artifactDigests).filter((f) => /web-scumm/.test(f)),
          x.id,
        ).toEqual([]);
    expect(Object.keys(v425.surfaces.find((x) => x.id === 'archive-human-install')!.artifactDigests)).toContain(
      'pack/web-scumm-4.2.5.tgz',
    );
    // A 4.2.5 candidate with the former names only is not one: its surfaces read the new names.
    expect(() => surfaces('4.2.5', { 'pack/web-scumm-studio-server-4.2.5.tgz': h('7') })).toThrow(
      /names no file of this candidate/,
    );
    for (const id of PASS_IDS) expect(Object.keys(declared.surfaces[id].artifacts).length).toBeGreaterThan(0);
    for (const x of Object.values(declared.surfaces) as { exclusions: { reason: string; test: string }[] }[])
      for (const e of x.exclusions) {
        expect(e.reason.length).toBeGreaterThan(20);
        expect(readFileSync(e.test, 'utf8')).toContain('og.png');
      }
    expect(() => surfaces('4.1.20', { 'site:unknown/thing.bin': h('1'), 'mystery.bin': h('2') })).toThrow(
      /in no surface and not under status.*mystery\.bin/,
    );
  });

  it('leave out what a surface proves it does not read: og.png, which only link previews fetch', () => {
    // The service worker precaches the built files by pattern (vite.config.ts): none of its patterns matches og.png.
    const list = /globPatterns: \[([^\]]*)\]/.exec(readFileSync('vite.config.ts', 'utf8'))?.[1] ?? '';
    const patterns = [...list.matchAll(/'([^']+)'/g)].flatMap(([, p]) => {
      const b = /\{([^}]*)\}/.exec(p!);
      return b ? b[1]!.split(',').map((x) => p!.replace(b[0], x)) : [p!];
    });
    expect(patterns.length).toBeGreaterThan(3);
    expect(patterns.some((p) => globRe(p).test('icons/icon-192.png'))).toBe(true);
    expect(patterns.some((p) => globRe(p).test('og.png'))).toBe(false);
    expect(readFileSync('index.html', 'utf8')).toMatch(/og:image" content="%BASE%og\.png"/);
    const safari = surfaces('4.1.20').surfaces.find((x) => x.id === 'safari-ios-offline-update')!;
    expect(Object.keys(safari.artifactDigests)).not.toContain('site:og.png');
    expect(carries('safari-ios-offline-update', { 'site:og.png': h('7') }).ok).toBe(true);
    expect(globRe('site:assets/*.js').test('site:assets/audio/x.js')).toBe(false);
  });
});

describe('a pass carried, or not', () => {
  it('carries the PWA pass when only the README changed: the README is no file of its surface', () => {
    const r = carries('safari-ios-offline-update', {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.attestation.decision).toBe('pending');
      expect(r.attestation.changedFiles).toEqual([]);
      expect(CarryAttestationSchema.parse(r.attestation)).toEqual(r.attestation);
    }
  });

  it('refuses Safari when the service worker changed, the Bridge when its archive did, the voices when the mixing did', () => {
    expect(carries('safari-ios-offline-update', { 'site:sw.js': h('e') })).toMatchObject({ ok: false });
    expect(carries('bridge-postgres-https', { 'pack/web-scumm-bridge-4.1.20.tgz': h('e') })).toMatchObject({
      ok: false,
    });
    expect(carries('voices-listening', { 'site:assets/audio/voice-1.ogg': h('e') })).toMatchObject({ ok: false });
    // Elsewhere, the same changes are only listed: a sheet of pictures carries the voices' pass.
    const r = carries('voices-listening', { 'site:assets/img/room.webp': h('e') });
    expect(r.ok && r.attestation.changedFiles).toEqual(['site:assets/img/room.webp']);
  });

  it('refuses the PWA, Mystery, a resumed run, the speedrun and the archive when only the version changed', () => {
    // The version is in site.json, the bundle and the archives' names and bytes: none is excluded.
    const bump = { 'site:site.json': h('e'), 'site:assets/index-x.js': h('e') };
    for (const id of [
      'safari-ios-offline-update',
      'mystery-deployed',
      'run-resume-power-cycle',
      'livesplit-obs',
      'archive-human-install',
    ] as const)
      expect(carries(id, bump, '4.1.21').ok, id).toBe(false);
  });

  it("binds the beginner reader from 4.5.0 on, to the engine's package and the pages a reader sees", () => {
    const v450 = surfaces450();
    expect(v450.surfaces.map((x) => x.id).sort()).toEqual([...passesFor('4.5.0')].sort());
    const reader = v450.surfaces.find((x) => x.id === 'docs-beginner-reader')!;
    expect(Object.keys(reader.artifactDigests)).toEqual(['pack/quest-n-click-4.5.0.tgz']);
    expect(declared.surfaces['docs-beginner-reader'].config).toEqual([
      'wiki/en/**',
      'wiki/fr/**',
      'wiki/manifest.json',
      'wiki/images/**',
      'docs/dev/acceptance/BEGINNER-READER.md',
    ]);
    // Not a surface of an earlier release.
    const c440 = candidate('4.4.0', { 'pack/web-scumm-studio-server-4.4.0.tgz': h('7') });
    const files440 = Object.fromEntries(
      Object.entries(c440.files).map(([f, d]) => [f.replace('web-scumm', 'quest-n-click'), d]),
    );
    const v440: Surfaces = surfacesOf({
      candidate: files440,
      site: c440.site,
      declared,
      version: '4.4.0',
      config: () => h('9'),
    });
    expect(v440.surfaces.map((x) => x.id)).not.toContain('docs-beginner-reader');
  });

  it('carries the beginner reader across a translation or review ack, never across a page that changed', () => {
    const globs = declared.surfaces['docs-beginner-reader'].config as string[];
    const root = tmp();
    const files = [
      'wiki/en/team.write-refused-423.md',
      'wiki/fr/team.write-refused-423.md',
      'wiki/manifest.json',
      'wiki/images/team/lease.png',
      'docs/dev/acceptance/BEGINNER-READER.md',
      'wiki/translations.json',
      'wiki/reviews.json',
      'wiki/acceptance/questions.json',
    ];
    const write = (f: string, text: string) => {
      mkdirSync(dirname(join(root, f)), { recursive: true });
      writeFileSync(join(root, f), text);
    };
    for (const f of files) write(f, 'one');
    const digest = () => configDigest(globs, root, files) as string;
    const before = digest();
    // What a reader never sees: the acks and the questions.
    write('wiki/translations.json', 'two');
    write('wiki/reviews.json', 'two');
    write('wiki/acceptance/questions.json', 'two');
    expect(digest()).toBe(before);
    write('wiki/en/team.write-refused-423.md', 'two');
    const after = digest();
    expect(after).not.toBe(before);
    const key = globs.join(',');
    const report = passed('docs-beginner-reader');
    const check = (target: string) =>
      carryCheck({
        report,
        reportBytes: JSON.stringify(report),
        from: FROM,
        to: TO,
        source: surfaces450({ [key]: before }),
        target: surfaces450({ [key]: target }),
        sourceFiles: all450(),
        targetFiles: all450(),
      });
    expect(check(before).ok).toBe(true);
    expect(check(after).ok).toBe(false);
  });

  it('refuses the archive pass when the README install section changed (its configuration)', () => {
    const cfg = { 'readme:install': h('e') };
    expect(carries('archive-human-install', {}, '4.1.20', cfg).ok).toBe(false);
    expect(carries('safari-ios-offline-update', {}, '4.1.20', cfg).ok).toBe(true);
  });

  it('refuses a report not passed, or of another candidate; RC → stable on one run needs no carry', () => {
    const report = { ...passed('firefox-real-offline'), status: 'failed' as const, failures: [] };
    const base = {
      reportBytes: '{}',
      from: FROM,
      to: TO,
      source: surfaces('4.1.20'),
      target: surfaces('4.1.20'),
      sourceFiles: all('4.1.20'),
      targetFiles: all('4.1.20'),
    };
    expect(carryCheck({ ...base, report })).toMatchObject({ ok: false });
    expect(carryCheck({ ...base, report: { ...passed('firefox-real-offline'), candidateRun: '9' } })).toMatchObject({
      ok: false,
    });
    // An RC and its stable stand on one SHA and one run: identical bytes, nothing changed.
    const same = carries('archive-human-install', {});
    expect(same.ok && same.attestation.changedFiles).toEqual([]);
  });

  it('keeps FieldReport to its four statuses: a carry is an attestation beside it, never a status', () => {
    expect([...FIELD_STATUSES]).toEqual(['not-run', 'blocked', 'failed', 'passed']);
    expect(FieldReportSchema.safeParse({ ...passed('blind-playtesters'), status: 'carried' }).success).toBe(false);
  });

  it('refuses an attestation whose changedFilesDigest does not fit its list', () => {
    const r = carries('voices-listening', { 'site:assets/img/room.webp': h('e') });
    if (!r.ok) throw new Error('carried');
    expect(CarryAttestationSchema.safeParse({ ...r.attestation, changedFiles: [] }).success).toBe(false);
    expect(digestOfChanges(['b', 'a'])).toBe(digestOfChanges(['a', 'b']));
  });
});

describe('a carry counted', () => {
  const report = passed('phone-both-renderers');
  const bytes = JSON.stringify(report);
  const target = surfaces('4.1.20');
  const pending = (() => {
    const r = carryCheck({
      report,
      reportBytes: bytes,
      from: FROM,
      to: TO,
      source: surfaces('4.1.20'),
      target,
      sourceFiles: all('4.1.20'),
      targetFiles: all('4.1.20'),
    });
    if (!r.ok) throw new Error(r.why.join('; '));
    return r.attestation;
  })();
  const approved: CarryAttestation = { ...pending, decision: 'approved', approvedBy: 'maintainer' };
  const count = (attestation: CarryAttestation, trusted: Parameters<typeof carriedPass>[0]['trusted']) =>
    carriedPass({ attestation, sourceReport: report, sourceReportBytes: bytes, target, targetRef: TO, trusted });

  it("counts no report but the source candidate's own for this pass", () => {
    const other = { ...report, candidateRun: '999' };
    const otherBytes = JSON.stringify(other);
    const a = { ...approved, sourceReportDigest: createHash('sha256').update(otherBytes).digest('hex') };
    expect(
      carriedPass({
        attestation: a,
        sourceReport: other,
        sourceReportBytes: otherBytes,
        target,
        targetRef: TO,
        trusted: { ok: true, principal: 'maintainer' },
      }),
    ).toMatchObject({ counts: false, why: /not this pass's on the source candidate/ });
  });

  it('only approved, signed by the principal it names, for this target', () => {
    expect(count(approved, { ok: true, principal: 'maintainer' })).toEqual({ counts: true });
    expect(count(pending, { ok: true, principal: 'maintainer' })).toMatchObject({ counts: false, why: /pending/ });
    expect(count({ ...approved, decision: 'refused' }, { ok: true, principal: 'maintainer' })).toMatchObject({
      counts: false,
    });
    expect(count(approved, { ok: false, why: 'not signed' })).toEqual({ counts: false, why: 'not signed' });
    expect(count(approved, { ok: true, principal: 'someone-else' })).toMatchObject({ counts: false, why: /signed by/ });
    expect(count({ ...approved, to: FROM }, { ok: true, principal: 'maintainer' })).toMatchObject({ counts: false });
    expect(
      carriedPass({
        attestation: approved,
        sourceReport: report,
        sourceReportBytes: `${bytes} `,
        target,
        targetRef: TO,
        trusted: { ok: true, principal: 'maintainer' },
      }),
    ).toMatchObject({ counts: false, why: /not the one carried/ });
  });
});

// ------------------------------------------------------------------------------------------- the trust root, for real
const run = (cwd: string, cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
function key(dir: string, name: string): { file: string; line: (who: string) => string } {
  const file = join(dir, name);
  run(dir, 'ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', name, '-f', file]);
  const pub = readFileSync(`${file}.pub`, 'utf8').trim().split(' ').slice(0, 2).join(' ');
  return { file, line: (who) => `${who} namespaces="git" ${pub}` };
}
function repo() {
  const dir = tmp();
  const g = (args: string[]) => run(dir, 'git', ['-c', 'user.name=t', '-c', 'user.email=t@example.org', ...args]);
  g(['init', '-q', '-b', 'main']);
  const commit = (msg: string, files: Record<string, string>, signWith?: string) => {
    for (const [f, c] of Object.entries(files)) {
      mkdirSync(join(dir, f, '..'), { recursive: true });
      writeFileSync(join(dir, f), c);
    }
    g(['add', '-A']);
    g([
      ...(signWith ? ['-c', 'gpg.format=ssh', '-c', `user.signingkey=${signWith}`] : []),
      'commit',
      '-q',
      ...(signWith ? ['-S'] : ['--no-gpg-sign']),
      '-m',
      msg,
    ]);
    return g(['rev-parse', 'HEAD']);
  };
  return { dir, g, commit };
}
const ATT = 'docs/dev/passes/carry/4.1.21/phone-both-renderers.json';

describe('the trust root', () => {
  const keys = tmp();
  const maintainer = key(keys, 'maintainer');
  const intruder = key(keys, 'intruder');

  it('trusts an attestation signed by a key the source candidate names, as that principal', () => {
    const r = repo();
    const source = r.commit('the source candidate', {
      '.github/allowed_signers': `${maintainer.line('maintainer')}\n`,
    });
    r.commit('approve', { [ATT]: '{"decision":"approved"}' }, maintainer.file);
    expect(trustedApproval({ repo: r.dir, path: ATT, sourceCommit: source })).toMatchObject({
      ok: true,
      principal: 'maintainer',
    });
  });

  it('refuses a key added after the source candidate, even signed by it; and a pull request that does both', () => {
    const r = repo();
    const source = r.commit('the source candidate', {
      '.github/allowed_signers': `${maintainer.line('maintainer')}\n`,
    });
    r.commit(
      'add a key',
      { '.github/allowed_signers': `${maintainer.line('maintainer')}\n${intruder.line('intruder')}\n` },
      intruder.file,
    );
    const before = r.g(['rev-parse', 'HEAD']);
    r.commit('approve', { [ATT]: '{}' }, intruder.file);
    expect(trustedApproval({ repo: r.dir, path: ATT, sourceCommit: source })).toMatchObject({ ok: false });
    expect(rangeProblems(r.dir, `${source}..HEAD`)[0]).toMatch(/allowed_signers and docs\/dev\/passes\/carry/);
    expect(rangeProblems(r.dir, `${before}..HEAD`)).toEqual([]);
    // The root with the folder's README only (PR 4 brings both): no attestation, no refusal.
    const k = repo();
    const k0 = k.commit('start', { 'x.txt': '1' });
    k.commit('root and readme', { '.github/allowed_signers': 'x\n', 'docs/dev/passes/carry/README.md': '#' });
    expect(rangeProblems(k.dir, `${k0}..HEAD`)).toEqual([]);
    // The key and the attestation in one commit: refused by name.
    const t = repo();
    const s2 = t.commit('source', { '.github/allowed_signers': `${maintainer.line('maintainer')}\n` });
    t.commit(
      'both',
      { '.github/allowed_signers': `${maintainer.line('maintainer')}\n#\n`, [ATT]: '{}' },
      maintainer.file,
    );
    expect(trustedApproval({ repo: t.dir, path: ATT, sourceCommit: s2 })).toMatchObject({ ok: false, why: /together/ });
  });

  it('refuses an unsigned commit a signed one follows, an edit after the signature, and a source without a root', () => {
    const r = repo();
    const source = r.commit('source', { '.github/allowed_signers': `${maintainer.line('maintainer')}\n` });
    r.commit('unsigned', { [ATT]: '{"a":1}' });
    r.commit('signed', { [ATT]: '{"a":2}' }, maintainer.file);
    expect(trustedApproval({ repo: r.dir, path: ATT, sourceCommit: source })).toMatchObject({
      ok: false,
      why: /not signed/,
    });
    const t = repo();
    const s2 = t.commit('source', { '.github/allowed_signers': `${maintainer.line('maintainer')}\n` });
    t.commit('signed', { [ATT]: '{"a":1}' }, maintainer.file);
    t.commit('edited after', { [ATT]: '{"a":2}' });
    expect(trustedApproval({ repo: t.dir, path: ATT, sourceCommit: s2 })).toMatchObject({
      ok: false,
      why: /not signed/,
    });
    const u = repo();
    const none = u.commit('no root', { 'README.md': 'x' });
    u.commit('signed', { [ATT]: '{}' }, maintainer.file);
    expect(trustedApproval({ repo: u.dir, path: ATT, sourceCommit: none })).toMatchObject({
      ok: false,
      why: /no trust root/,
    });
  });

  it('refuses an attestation a merge changed, and reads a signed commit brought by an unsigned merge', () => {
    const r = repo();
    const source = r.commit('source', { '.github/allowed_signers': `${maintainer.line('maintainer')}\n` });
    r.g(['checkout', '-q', '-b', 'pr']);
    r.commit('approve', { [ATT]: '{"a":1}' }, maintainer.file);
    r.g(['checkout', '-q', 'main']);
    r.commit('other work', { 'other.txt': 'x' });
    r.g(['merge', '-q', '--no-ff', '--no-gpg-sign', '-m', 'merge (as GitHub would, under its own key)', 'pr']);
    expect(trustedApproval({ repo: r.dir, path: ATT, sourceCommit: source })).toMatchObject({
      ok: true,
      principal: 'maintainer',
    });
    // A merge that writes the file itself: not the signed bytes.
    r.g(['checkout', '-q', '-b', 'pr2']);
    r.commit('noop', { 'x.txt': '1' }, maintainer.file);
    r.g(['checkout', '-q', 'main']);
    r.g(['merge', '-q', '--no-ff', '--no-commit', '--no-gpg-sign', 'pr2']);
    writeFileSync(join(r.dir, ATT), '{"a":"evil"}');
    r.g(['add', '-A']);
    r.g(['commit', '-q', '--no-gpg-sign', '-m', 'evil merge']);
    expect(trustedApproval({ repo: r.dir, path: ATT, sourceCommit: source })).toMatchObject({
      ok: false,
      why: /merge/,
    });
  });
});

describe('the trust root, against a key slipped in and out (second reading of PR 4)', () => {
  it('refuses a root named on the branch itself, even once its key is gone, and the range that did it', () => {
    const keys = tmp();
    const maintainer = key(keys, 'maintainer');
    const evil = key(keys, 'evil');
    const r = repo();
    const main0 = r.commit('main', { '.github/allowed_signers': `${maintainer.line('maintainer')}\n` });
    r.g(['checkout', '-q', '-b', 'pr']);
    const x = r.commit('add a key', {
      '.github/allowed_signers': `${maintainer.line('maintainer')}\n${evil.line('maintainer')}\n`,
    });
    r.commit('remove it', { '.github/allowed_signers': `${maintainer.line('maintainer')}\n` });
    r.commit('approve', { [ATT]: JSON.stringify({ from: { commit: x } }) }, evil.file);
    // The pull request's own commits: the root and an attestation, refused though the net diff holds no key change.
    expect(rangeProblems(r.dir, `main...pr`)[0]).toMatch(/allowed_signers and docs\/dev\/passes\/carry/);
    r.g(['checkout', '-q', 'main']);
    r.g(['merge', '-q', '--no-ff', '--no-gpg-sign', '-m', 'merged anyway', 'pr']);
    // On main, X is no candidate: not on the first-parent line, so no root.
    expect(trustedApproval({ repo: r.dir, path: ATT, sourceCommit: x })).toMatchObject({
      ok: false,
      why: /first-parent/,
    });
    // Named by main's own commit, the root is the maintainer's: the evil key is refused.
    expect(trustedApproval({ repo: r.dir, path: ATT, sourceCommit: main0 })).toMatchObject({
      ok: false,
      why: /not a key/,
    });
  });
});

describe('field:carry, end to end', () => {
  it('writes a pending carry; once the maintainer approves it in a signed commit, the target counts the pass', async () => {
    const { main, carriedPasses } = await import('../tools/field/field');
    const { createHash } = await import('node:crypto');
    const sum = (s: string) => createHash('sha256').update(s).digest('hex');
    const keys = tmp();
    const maintainer = key(keys, 'maintainer');
    const r = repo();
    const sourceSha = r.commit('the source candidate', {
      '.github/allowed_signers': `${maintainer.line('maintainer')}\n`,
    });
    /** A folder field:init made: the manifest, the surfaces and site files it names, the reports. */
    const folder = (sha: string, run: string, over: Record<string, string>) => {
      const d = tmp();
      const c = candidate('4.1.20', over);
      const surf = JSON.stringify(surfaces('4.1.20', over));
      const site = JSON.stringify({
        format: 'web-scumm-site-files',
        schema: 1,
        files: Object.entries(c.site).map(([path, sha256]) => ({ path, bytes: 1, sha256 })),
      });
      writeFileSync(join(d, 'qualification-surfaces.json'), surf);
      writeFileSync(join(d, 'site-files.json'), site);
      const artifacts = Object.entries({
        ...c.files,
        'surfaces/qualification-surfaces.json': sum(surf),
        'site/site-files.json': sum(site),
      }).map(([name, sha256]) => ({ name, sha256 }));
      writeFileSync(
        join(d, 'candidate-manifest.json'),
        JSON.stringify({
          format: 'web-scumm-candidate',
          schema: 1,
          sha,
          candidateRunId: run,
          createdAt: '2026-10-13T00:00:00Z',
          artifacts,
        }),
      );
      return d;
    };
    const from = folder(sourceSha, '100', {});
    const to = folder('b'.repeat(40), '200', { 'baseline/baseline-x.json': h('e') });
    const report = { ...passed('phone-both-renderers'), commit: sourceSha, candidateRun: '100' };
    writeFileSync(join(from, 'phone-both-renderers.json'), JSON.stringify(report));
    writeFileSync(
      join(to, 'phone-both-renderers.json'),
      JSON.stringify({ ...report, release: '4.1.21', status: 'not-run' }),
    );
    const out = join(r.dir, 'docs/dev/passes/carry/4.1.21');
    const log = console.log;
    console.log = () => {};
    try {
      expect(main(['carry', `--from=${from}`, `--to=${to}`, '--pass=phone-both-renderers', `--out=${out}`])).toBe(0);
    } finally {
      console.log = log;
    }
    const pending = JSON.parse(readFileSync(join(out, 'phone-both-renderers.json'), 'utf8'));
    expect(pending).toMatchObject({ decision: 'pending', changedFiles: ['baseline/baseline-x.json'] });
    expect(readFileSync(join(out, 'phone-both-renderers.report.json'), 'utf8')).toBe(JSON.stringify(report));
    // Pending: written, not counted.
    expect(carriedPasses(to, out, '4.1.21', r.dir).get('phone-both-renderers')).toMatchObject({ counts: false });
    // The pending carry committed by the maintainer, signed; then an approval edited in the working tree, not
    // committed: nothing counts (the committed bytes are judged).
    r.g(['add', '-A']);
    r.g([
      '-c',
      'gpg.format=ssh',
      '-c',
      `user.signingkey=${maintainer.file}`,
      'commit',
      '-q',
      '-S',
      '-m',
      'the pending carry',
    ]);
    writeFileSync(
      join(out, 'phone-both-renderers.json'),
      JSON.stringify({ ...pending, decision: 'approved', approvedBy: 'maintainer' }),
    );
    expect(carriedPasses(to, out, '4.1.21', r.dir).get('phone-both-renderers')).toMatchObject({ counts: false });
    // The maintainer approves it in a commit signed with their key (Claude never does).
    writeFileSync(
      join(out, 'phone-both-renderers.json'),
      JSON.stringify({ ...pending, decision: 'approved', approvedBy: 'maintainer' }),
    );
    r.g(['add', '-A']);
    r.g([
      '-c',
      'gpg.format=ssh',
      '-c',
      `user.signingkey=${maintainer.file}`,
      'commit',
      '-q',
      '-S',
      '-m',
      'approve the carry',
    ]);
    expect(carriedPasses(to, out, '4.1.21', r.dir).get('phone-both-renderers')).toEqual({ counts: true, from: '100' });
    // Signed by another key, the same file does not count.
    const other = key(keys, 'other');
    writeFileSync(
      join(out, 'phone-both-renderers.json'),
      JSON.stringify({ ...pending, decision: 'approved', approvedBy: 'other' }),
    );
    r.g(['add', '-A']);
    r.g(['-c', 'gpg.format=ssh', '-c', `user.signingkey=${other.file}`, 'commit', '-q', '-S', '-m', 'approve again']);
    expect(carriedPasses(to, out, '4.1.21', r.dir).get('phone-both-renderers')).toMatchObject({ counts: false });
  });
});

describe('a carry and the sheet', () => {
  it('fills a pass not run here, never one that failed or was blocked here', async () => {
    const { renderPasses } = await import('../tools/field/field');
    const m = {
      format: 'web-scumm-candidate' as const,
      schema: 1 as const,
      sha: 'b'.repeat(40),
      candidateRunId: '200',
      createdAt: '',
      artifacts: [] as { name: string; sha256: string }[],
    };
    const base = { ...passed('safari-ios-offline-update'), release: '4.1.21', commit: m.sha, candidateRun: '200' };
    const carried = new Map([['safari-ios-offline-update', { counts: true, from: '100' }]]);
    const notRun = {
      ...base,
      status: 'not-run' as const,
      operator: undefined,
      startedAt: undefined,
      finishedAt: undefined,
      scenario: undefined,
      evidence: [],
    };
    const failed = {
      ...base,
      status: 'failed' as const,
      failures: [{ step: 's', expected: 'e', observed: 'o', reproducible: true }],
    };
    expect(renderPasses([notRun], m, carried)).toContain('| passed, carried from run 100 |');
    expect(renderPasses([failed], m, carried)).not.toContain('carried');
    expect(renderPasses([failed], m, carried)).toMatch(/\| failed \|/);
  });
});
