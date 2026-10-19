// The Field Kit (4.1.18, plan §5.5): a report of another candidate, evidence that changed, a `passed` without what a
// reproduction needs, a duplicate, a secret, never make a pass succeed; `not-run`, `blocked` and `failed` are never
// rendered as done; the sheet has its thirteen rows and its counts; a bundle carries only the listed evidence,
// redacted, and refuses a key.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { manualPasses } from '../scripts/release-notes.mjs';
import {
  blankReport,
  type CandidateManifest,
  checkDir,
  MANIFEST,
  main,
  renderPasses,
  SITE_FILES,
  SURFACES,
  sha256,
  TAR,
  writePasses,
} from '../tools/field/field';
import { ATTESTATION, makeBundle, verifyBundle } from '../tools/field/bundle';
import { type FieldReport, PASS_IDS, passesFor } from '../tools/field/schema';
import { BUDGET, readTarGz, writeTarGz } from '../tools/field/tar';
import { hardSecrets, redact, reportLeaks } from '../tools/field/secrets';

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'field-kit-'));
  temps.push(d);
  return d;
};

const SHA = 'a'.repeat(40);
const manifest: CandidateManifest = {
  format: 'web-scumm-candidate',
  schema: 1,
  sha: SHA,
  candidateRunId: '42',
  createdAt: '2026-10-10T00:00:00.000Z',
  artifacts: [
    { name: 'web-scumm-4.1.18.tgz', sha256: '1'.repeat(64) },
    { name: 'wsrun/run-story.wsrun', sha256: '2'.repeat(64) },
  ],
};

/** A folder from field:init, then `edit` on the pass it names. As field:init writes it: the reports beside the
 * candidate's manifest, its surfaces and its site's files (4.2.0-rc.1 read those two as reports). */
function folder(edit: Partial<Record<(typeof PASS_IDS)[number], (r: FieldReport, dir: string) => void>> = {}) {
  const dir = tmp();
  writeFileSync(join(dir, MANIFEST), JSON.stringify(manifest));
  writeFileSync(
    join(dir, SURFACES),
    JSON.stringify({ format: 'web-scumm-qualification-surfaces', schema: 1, surfaces: {} }),
  );
  writeFileSync(join(dir, SITE_FILES), JSON.stringify({ format: 'web-scumm-site-files', files: [] }));
  for (const id of passesFor('4.1.18')) {
    const r = blankReport(id, '4.1.18', manifest);
    edit[id]?.(r, dir);
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(r, null, 1));
  }
  return dir;
}

/** A pass tried and passed, with its evidence written beside it. */
function passed(r: FieldReport, dir: string, log = 'replayed: valid\n') {
  mkdirSync(join(dir, 'evidence'), { recursive: true });
  writeFileSync(join(dir, 'evidence/run.log'), log);
  Object.assign(r, {
    status: 'passed',
    operator: 'tester-1',
    startedAt: '2026-10-10T09:00:00Z',
    finishedAt: '2026-10-10T09:40:00Z',
    environment: { os: 'iOS 19.1', browser: 'Safari', versions: { engine: '4.1.18' } },
    scenario: 'installed, offline, reload, update',
    evidence: [{ path: 'evidence/run.log', sha256: sha256(log), kind: 'log' }],
  });
}

describe('field:check', () => {
  it('accepts the thirteen reports field:init writes, all not run', () => {
    const { problems, reports } = checkDir(folder());
    expect(problems).toEqual([]);
    expect(reports.map((r) => r.status)).toEqual(passesFor('4.1.18').map(() => 'not-run'));
  });

  it('reads the candidate files field:init writes beside the reports as no report (4.2.0-rc.1)', () => {
    const dir = folder();
    const out = join(tmp(), 'sheet.md');
    expect(main(['report', `--dir=${dir}`, `--out=${out}`])).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('13 not run, of 13');
  });

  it("refuses a report of another commit, another run or another candidate's files", () => {
    const dir = folder({
      'firefox-real-offline': (r) => (r.commit = 'b'.repeat(40)),
      'livesplit-obs': (r) => (r.candidateRun = '43'),
      'voices-listening': (r) => (r.packageDigests['web-scumm-4.1.18.tgz'] = '3'.repeat(64)),
      'blind-playtesters': (r) => delete r.packageDigests['wsrun/run-story.wsrun'],
    });
    const { problems } = checkDir(dir);
    expect(problems).toEqual([
      "blind-playtesters.json: its file digests are not the candidate's",
      'firefox-real-offline.json: tried commit bbbbbbb, the candidate is aaaaaaa',
      'livesplit-obs.json: tried run 43, the candidate is run 42',
      "voices-listening.json: its file digests are not the candidate's",
    ]);
  });

  it('accepts a pass passed with its evidence, refuses one whose evidence is missing or changed', () => {
    expect(checkDir(folder({ 'safari-ios-offline-update': passed })).problems).toEqual([]);
    const changed = folder({ 'safari-ios-offline-update': passed });
    writeFileSync(join(changed, 'evidence/run.log'), 'replayed: valid (edited)\n');
    expect(checkDir(changed).problems).toEqual([
      'safari-ios-offline-update.json: evidence evidence/run.log is not the file it names (SHA-256 differs)',
    ]);
    const gone = folder({ 'safari-ios-offline-update': passed });
    rmSync(join(gone, 'evidence/run.log'));
    expect(checkDir(gone).problems).toEqual(['safari-ios-offline-update.json: evidence evidence/run.log is missing']);
  });

  it('refuses a `passed` without its time, operator, environment, scenario or evidence, and one with a failure', () => {
    for (const [what, edit, want] of [
      ['no evidence', (r: FieldReport) => (r.evidence = []), 'evidence: a pass passed shows its evidence'],
      ['no time', (r: FieldReport) => delete r.startedAt, 'startedAt: a pass tried (passed) says startedAt'],
      ['no scenario', (r: FieldReport) => delete r.scenario, 'scenario: a pass tried (passed) says scenario'],
      ['no operator', (r: FieldReport) => delete r.operator, 'operator: a pass tried (passed) says operator'],
      [
        'no environment',
        (r: FieldReport) => (r.environment = { versions: {} }),
        'environment: a pass tried (passed) says on what (os, browser, device or versions)',
      ],
      [
        'a failure',
        (r: FieldReport) => r.failures.push({ step: 'update', expected: 'new', observed: 'old', reproducible: true }),
        'failures: a pass passed has no failure: it is failed',
      ],
      [
        'ends before it starts',
        (r: FieldReport) => (r.finishedAt = '2026-10-10T08:00:00Z'),
        'finishedAt: it finished before it started',
      ],
    ] as const) {
      const dir = folder({ 'phone-both-renderers': (r, d) => (passed(r, d), edit(r)) });
      expect(checkDir(dir).problems, what).toEqual([`phone-both-renderers.json: ${want}`]);
    }
  });

  it('a failed pass says what failed, a blocked one why, a pass not run has nothing', () => {
    const dir = folder({
      'code-wheel-human': (r, d) => (passed(r, d), (r.status = 'failed')),
      'mystery-deployed': (r, d) => (passed(r, d), (r.status = 'blocked'), (r.evidence = [])),
      'livesplit-obs': (r) => (r.startedAt = '2026-10-10T09:00:00Z'),
    });
    expect(checkDir(dir).problems).toEqual([
      'code-wheel-human.json: failures: a failed pass says what failed',
      'livesplit-obs.json: status: a pass not run has no time, evidence or failure',
      'mystery-deployed.json: notes: a blocked pass says what blocked it (notes)',
    ]);
  });

  it('refuses a field the schema does not name, two reports of one pass, and a missing pass', () => {
    const dir = folder({ 'run-resume-power-cycle': (r) => Object.assign(r, { token: 'x' }) });
    writeFileSync(join(dir, 'again.json'), readFileSync(join(dir, 'livesplit-obs.json')));
    rmSync(join(dir, 'voices-listening.json'));
    expect(checkDir(dir).problems).toEqual([
      'livesplit-obs.json: livesplit-obs is also again.json: one report per pass',
      'run-resume-power-cycle.json: (report): Unrecognized key: "token"',
      'voices-listening: no report',
    ]);
  });

  it('refuses an address, a bearer or a key in a report or in its text evidence', () => {
    const dir = folder({
      'archive-human-install': (r) => (r.notes = 'mail me at ann@example.org'),
      'connectors-real-security': (r, d) =>
        passed(r, d, 'auth: Authorization: Bearer abcdefghijklmnop\n-----BEGIN PRIVATE KEY-----\n'),
    });
    expect(checkDir(dir).problems).toEqual([
      'archive-human-install.json: holds an email address',
      'connectors-real-security.json: evidence evidence/run.log holds a private key',
      'connectors-real-security.json: evidence evidence/run.log holds a bearer',
    ]);
  });

  it('--require names passes that must be passed (a 4.2 gate), and refuses an id that is not a pass', () => {
    const dir = folder({ 'firefox-real-offline': passed });
    expect(checkDir(dir, ['firefox-real-offline']).problems).toEqual([]);
    expect(checkDir(dir, ['safari-ios-offline-update', 'nope']).problems).toEqual([
      'safari-ios-offline-update: required, not passed (nor carried by an approved, signed attestation)',
      '--require=nope: not a pass',
    ]);
  });
});

describe('the passes of a release', () => {
  it('4.2.1 asks fifteen, its two new ones in the sheet; an older release keeps its thirteen', () => {
    const reports = passesFor('4.2.1').map((id) => blankReport(id, '4.2.1', manifest));
    const section = renderPasses(reports, manifest);
    expect(section).toContain('0 passed, 0 failed, 0 blocked, 15 not run, of 15.');
    expect(section).toContain('(`studio-hosted`)');
    expect(section).toContain('(`studio-collab`)');
    const older = renderPasses(
      passesFor('4.1.18').map((id) => blankReport(id, '4.1.18', manifest)),
      manifest,
    );
    expect(older).toContain('of 13.');
    expect(older).not.toContain('studio-hosted');
  });

  it('4.2.3 asks nineteen: an agent through the remote MCP, and a second OIDC provider', () => {
    const section = renderPasses(
      passesFor('4.2.3').map((id) => blankReport(id, '4.2.3', manifest)),
      manifest,
    );
    expect(section).toContain('of 19.');
    expect(section).toContain('(`studio-mcp-remote`)');
    expect(section).toContain('(`studio-oidc-generic`)');
    expect(passesFor('4.2.2')).not.toContain('studio-mcp-remote');
  });

  it('4.2.2 asks seventeen: the workshop played and its assets prepared, hosted', () => {
    const section = renderPasses(
      passesFor('4.2.2').map((id) => blankReport(id, '4.2.2', manifest)),
      manifest,
    );
    expect(section).toContain('of 17.');
    expect(section).toContain('(`studio-preview`)');
    expect(section).toContain('(`studio-assets-hosted`)');
    expect(passesFor('4.2.1')).not.toContain('studio-preview');
  });
});

describe('field:report', () => {
  it('writes the thirteen rows and their counts; only `passed` is done for the release notes', () => {
    const dir = folder({
      'firefox-real-offline': passed,
      'code-wheel-human': (r, d) => {
        passed(r, d);
        r.status = 'failed';
        r.failures = [{ step: 'print', expected: 'readable', observed: 'too small', reproducible: true, issue: '#99' }];
      },
      'mystery-deployed': (r) =>
        Object.assign(r, {
          status: 'blocked',
          operator: 'ops',
          startedAt: '2026-10-10T09:00:00Z',
          finishedAt: '2026-10-10T09:05:00Z',
          scenario: 'deploy',
          environment: { os: 'Linux', versions: {} },
          notes: 'no domain yet',
        }),
    });
    const { reports } = checkDir(dir);
    const section = renderPasses(reports, manifest);
    const rows = section.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Pass'));
    expect(rows).toHaveLength(13);
    expect(section).toContain('1 passed, 1 failed, 1 blocked, 10 not run, of 13.');
    expect(rows.find((r) => r.includes('`code-wheel-human`'))).toContain('| failed | tester-1, 2026-10-10 |');
    expect(rows.find((r) => r.includes('`code-wheel-human`'))).toContain('print: too small (#99) |');
    expect(rows.find((r) => r.includes('`mystery-deployed`'))).toContain('| blocked |');
    expect(rows.find((r) => r.includes('`mystery-deployed`'))).toContain('no domain yet |');
    const sheet = writePasses(null, section, '4.1.18');
    expect(manualPasses(sheet)).toContain('1 of 13 done.');
  });

  it("replaces only its block in a sheet, or the sheet's people's passes section; 4.1.17's sheet still reads", () => {
    const old = readFileSync('docs/dev/passes/4.1.17.md', 'utf8');
    expect(manualPasses(old)).toContain('0 of 13 done.');
    const section = renderPasses([], manifest);
    const once = writePasses(old, section, '4.1.17');
    expect(once.startsWith(old.slice(0, old.indexOf("## People's passes")))).toBe(true);
    expect(once).not.toContain('| not done |');
    const again = writePasses(
      `${once}\n## After\n\ntext\n`,
      renderPasses([], { ...manifest, candidateRunId: '7' }),
      '4.1.17',
    );
    expect(again).toContain('candidate run 7');
    expect(again).not.toContain('candidate run 42');
    expect(again).toContain('## After\n\ntext\n');
  });

  it('field:report writes nothing when the reports do not check', () => {
    const dir = folder({ 'livesplit-obs': (r) => (r.commit = 'b'.repeat(40)) });
    const out = join(dir, 'sheet.md');
    expect(main(['report', `--dir=${dir}`, `--out=${out}`])).toBe(1);
    expect(() => readFileSync(out)).toThrow();
    const ok = folder();
    expect(main(['report', `--dir=${ok}`, `--out=${join(ok, 'sheet.md')}`])).toBe(0);
    expect(readFileSync(join(ok, 'sheet.md'), 'utf8')).toContain('0 passed, 0 failed, 0 blocked, 13 not run, of 13.');
  });
});

describe('field:bundle (schema 2, 4.1.19)', () => {
  it('carries the report, its evidence (logs redacted, under the path the report names) and the candidate manifest', () => {
    const dir = folder({
      'bridge-postgres-https': (r, d) =>
        passed(r, d, 'from 203.0.113.7 ops@example.org token=s3cr3tvalue Authorization: Bearer abcdefghijkl\nok\n'),
    });
    const { bytes, redacted } = makeBundle(join(dir, 'bridge-postgres-https.json'));
    const files = readTarGz(bytes);
    // 4.1.18's bundles wrote evidence/evidence/…: the path the report names, once.
    expect([...files.keys()].sort()).toEqual(['bundle-manifest.json', MANIFEST, 'evidence/run.log', 'report.json']);
    expect(redacted.sort()).toEqual(['a bearer', 'a password or token value', 'an IPv4 address', 'an email address']);
    const log = files.get('evidence/run.log')!.toString('utf8');
    expect(log).toBe('from <ip> <email> token=<redacted> Authorization: Bearer <redacted>\nok\n');
    const m = JSON.parse(files.get('bundle-manifest.json')!.toString('utf8'));
    expect(m).toMatchObject({
      schema: 2,
      passId: 'bridge-postgres-https',
      commit: SHA,
      candidateRun: '42',
      attestation: null,
    });
    expect(m.files[0]).toMatchObject({ path: 'evidence/run.log', sha256: sha256(log) });
    expect(m.candidateManifest).toBe(sha256(files.get(MANIFEST)!));
    // The same files give the same bytes.
    expect(sha256(makeBundle(join(dir, 'bridge-postgres-https.json')).bytes)).toBe(sha256(bytes));
  });

  it('refuses a key or a token in the evidence, and evidence that is not the file the report names', () => {
    const keyed = folder({ 'bridge-postgres-https': (r, d) => passed(r, d, 'ghp_abcdefghijklmnopqrstuvwxyz0123\n') });
    expect(() => makeBundle(join(keyed, 'bridge-postgres-https.json'))).toThrow(/a GitHub token: refused/);
    const changed = folder({ 'bridge-postgres-https': passed });
    writeFileSync(join(changed, 'evidence/run.log'), 'other\n');
    expect(() => makeBundle(join(changed, 'bridge-postgres-https.json'))).toThrow(/not the file the report names/);
  });

  it('field:bundle writes it; `tar` reads it on every system', () => {
    const dir = folder({ 'livesplit-obs': passed });
    const out = join(tmp(), 'b.tar.gz');
    expect(main(['bundle', `--report=${join(dir, 'livesplit-obs.json')}`, `--out=${out}`])).toBe(0);
    const list = spawnSync(TAR, ['-tzf', out], { encoding: 'utf8' }).stdout;
    expect(list).toContain('bundle-manifest.json');
    expect(list).toContain('evidence/run.log');
    expect(list).not.toContain('evidence/evidence');
  });
});

describe('a bundle read by someone else (tar.ts): nothing but regular files, under budget', () => {
  /** A one-entry tar.gz whose header is then changed (its type, its name), the checksum written again. */
  function forged(name: string, type: string, body = Buffer.from('x')) {
    const tar = gunzipSync(writeTarGz(new Map([[name, body]])));
    tar.write(type, 156);
    tar.write('        ', 148);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += tar[i]!;
    tar.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    return gzipSync(tar);
  }
  it('refuses links, devices, extended headers', () => {
    for (const [type, why] of [
      ['2', /symbolic link/],
      ['1', /hard link/],
      ['3', /device/],
      ['6', /FIFO/],
      ['x', /extended header/],
    ] as const)
      expect(() => readTarGz(forged('evidence/a.log', type)), type).toThrow(why);
  });
  it('refuses absolute paths, `..`, backslashes and a name twice', () => {
    const raw = (name: string) => {
      const tar = gunzipSync(writeTarGz(new Map([['placeholder', Buffer.from('x')]])));
      tar.fill(0, 0, 100);
      tar.write(name, 0);
      tar.write('        ', 148);
      let sum = 0;
      for (let i = 0; i < 512; i++) sum += tar[i]!;
      tar.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
      return gzipSync(tar);
    };
    for (const name of ['/etc/passwd', '../escape', 'evidence/../../x', 'evidence\\x', 'C:/x'])
      expect(() => readTarGz(raw(name)), name).toThrow(/not a name a bundle may hold/);
    const twice = gunzipSync(writeTarGz(new Map([['a', Buffer.from('1')]])));
    const doubled = Buffer.concat([twice.subarray(0, 1024), twice]);
    expect(() => readTarGz(gzipSync(doubled))).toThrow(/twice/);
  });
  it('keeps a long name in UTF-8 whole: cut by bytes, never truncated', () => {
    const name = `evidence/${'é'.repeat(70)}/a.txt`; // 149 bytes of prefix: once cut by characters
    expect([...readTarGz(writeTarGz(new Map([[name, Buffer.from('x')]]))).keys()]).toEqual([name]);
    expect(() => writeTarGz(new Map([[`evidence/${'é'.repeat(130)}.txt`, Buffer.from('x')]]))).toThrow(/too long/);
    // 159 bytes of prefix, 84 characters: 4.1.19's first writer cut it at 155 bytes and lost the name.
    expect(() => writeTarGz(new Map([[`evidence/${'é'.repeat(75)}/a.txt`, Buffer.from('x')]]))).toThrow(/too long/);
  });

  it('refuses a file, a total or a count above its budget, and a gzip that inflates past it', () => {
    const budget = { ...BUDGET, maxFileBytes: 10, maxTotalBytes: 15, maxEntries: 2 };
    expect(() => readTarGz(writeTarGz(new Map([['a', Buffer.alloc(11)]])), budget)).toThrow(/more than 10/);
    expect(() =>
      readTarGz(
        writeTarGz(
          new Map([
            ['a', Buffer.alloc(8)],
            ['b', Buffer.alloc(8)],
          ]),
        ),
        budget,
      ),
    ).toThrow(/once inflated/);
    expect(() => readTarGz(writeTarGz(new Map(['a', 'b', 'c'].map((n) => [n, Buffer.alloc(1)]))), budget)).toThrow(
      /more than 2 files/,
    );
    // A bomb: a few kilobytes that inflate to megabytes stop at the budget.
    expect(() => readTarGz(gzipSync(Buffer.alloc(8 << 20)), budget)).toThrow(/budget/);
  });
});

describe('field:verify-bundle', () => {
  /** A `gh` that answers as GitHub would for run 42 (green candidate, attested), or as told. */
  function fakeGh(o: { runId?: string; conclusion?: string; verifies?: boolean; manifest?: string } = {}) {
    const d = tmp();
    const bin = join(d, 'gh');
    const statement = JSON.stringify([
      {
        verificationResult: {
          statement: {
            predicate: {
              runDetails: {
                metadata: {
                  invocationId: `https://github.com/wanoo/web-scumm/actions/runs/${o.runId ?? '42'}/attempts/1`,
                },
              },
            },
          },
        },
      },
    ]);
    writeFileSync(join(d, 'statement.json'), statement);
    writeFileSync(
      join(d, 'run.json'),
      JSON.stringify({
        workflowName: 'candidate',
        status: 'completed',
        conclusion: o.conclusion ?? 'success',
        event: 'workflow_dispatch',
        headBranch: 'main',
        headSha: SHA,
      }),
    );
    writeFileSync(join(d, MANIFEST), o.manifest ?? JSON.stringify(manifest));
    writeFileSync(
      bin,
      `#!/bin/sh\necho "$@" >> "${d}/calls"\ncase "$1 $2" in\n  "attestation verify") ${o.verifies === false ? 'echo "verification failed" >&2; exit 1' : `cat "${d}/statement.json"`} ;;\n  "run view") cat "${d}/run.json" ;;\n  "run download") shift 2; while [ "$1" != "-D" ]; do shift; done; mkdir -p "$2"; cp "${d}/${MANIFEST}" "$2/" ;;\n  *) exit 3 ;;\nesac\n`,
      { mode: 0o755 },
    );
    return { gh: bin, calls: () => readFileSync(join(d, 'calls'), 'utf8') };
  }
  const bundled = (attest = false, edit?: (dir: string) => void) => {
    const dir = folder({ 'livesplit-obs': passed });
    if (attest)
      writeFileSync(join(dir, ATTESTATION), '{"mediaType":"application/vnd.dev.sigstore.bundle.v0.3+json"}\n');
    edit?.(dir);
    return makeBundle(join(dir, 'livesplit-obs.json')).bytes;
  };

  it.skipIf(process.platform === 'win32')(
    'offline: the attestation against a trusted root, nothing asked of GitHub',
    () => {
      const gh = fakeGh();
      const v = verifyBundle(bundled(true), { offline: true, trustedRoot: '/roots/trusted-root.jsonl', gh: gh.gh });
      expect(v.problems).toEqual([]);
      expect(v.authenticity).toEqual({ level: 'attested', mode: 'offline', runId: '42' });
      expect(gh.calls()).toContain('--custom-trusted-root /roots/trusted-root.jsonl');
      expect(gh.calls()).not.toMatch(/run view|run download/);
      // Without a trusted root, or without an attestation: integrity only, said so.
      expect(verifyBundle(bundled(true), { offline: true, gh: gh.gh }).authenticity.level).toBe('unverified');
      expect(verifyBundle(bundled(false), { offline: true, gh: gh.gh }).authenticity).toMatchObject({
        level: 'unverified',
        why: /before 4\.1\.19/,
      });
    },
  );

  it.skipIf(process.platform === 'win32')(
    'an attestation of another run, or one that does not verify, is refused',
    () => {
      expect(
        verifyBundle(bundled(true), { offline: true, trustedRoot: 'r', gh: fakeGh({ runId: '7' }).gh }).problems.join(),
      ).toMatch(/names run 7/);
      expect(() =>
        verifyBundle(bundled(true), { offline: true, trustedRoot: 'r', gh: fakeGh({ verifies: false }).gh }),
      ).toThrow(/does not verify/);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'online: the run read now; without an attestation, the manifest the run keeps',
    () => {
      expect(verifyBundle(bundled(true), { gh: fakeGh().gh })).toMatchObject({
        problems: [],
        authenticity: { level: 'attested', mode: 'online' },
      });
      expect(verifyBundle(bundled(true), { gh: fakeGh({ conclusion: 'failure' }).gh }).problems.join()).toMatch(
        /green candidate/,
      );
      expect(verifyBundle(bundled(false), { gh: fakeGh().gh })).toMatchObject({
        problems: [],
        authenticity: { level: 'run-manifest', runId: '42' },
      });
      const other = fakeGh({ manifest: JSON.stringify({ ...manifest, createdAt: '2026-10-11T00:00:00.000Z' }) });
      expect(verifyBundle(bundled(false), { gh: other.gh }).problems.join()).toMatch(/not the manifest run 42 keeps/);
    },
  );

  it('integrity: a file changed or added, a report of another candidate, are refused', () => {
    const files = readTarGz(bundled());
    const changed = new Map(files);
    changed.set('evidence/run.log', Buffer.from('replayed: invalid\n'));
    expect(verifyBundle(writeTarGz(changed), { offline: true }).problems.join()).toMatch(
      /evidence\/run\.log: its SHA-256 differs/,
    );
    const added = new Map(files);
    added.set('evidence/extra.log', Buffer.from('x'));
    expect(verifyBundle(writeTarGz(added), { offline: true }).problems.join()).toMatch(/not named by the bundle/);
    const other = new Map(files);
    other.set(MANIFEST, Buffer.from(JSON.stringify({ ...manifest, sha: 'b'.repeat(40) })));
    expect(verifyBundle(writeTarGz(other), { offline: true }).problems.join()).toMatch(/not the one the bundle names/);
  });

  it('refuses an archive or a file outside evidence/ even in a bundle made by hand, and says a schema 1 bundle', () => {
    const files = readTarGz(bundled());
    const bm = JSON.parse(files.get('bundle-manifest.json')!.toString('utf8'));
    const report = JSON.parse(files.get('report.json')!.toString('utf8'));
    const zip = Buffer.from('PK');
    report.evidence.push({ path: 'evidence/x.zip', sha256: sha256(zip), kind: 'log' });
    const reportBytes = Buffer.from(`${JSON.stringify(report, null, 1)}\n`);
    bm.report = sha256(reportBytes);
    bm.files.push({ path: 'evidence/x.zip', sha256: sha256(zip), source: sha256(zip), redacted: [] });
    const forged = new Map(files);
    forged.set('evidence/x.zip', zip);
    forged.set('report.json', reportBytes);
    forged.set('bundle-manifest.json', Buffer.from(JSON.stringify(bm)));
    expect(verifyBundle(writeTarGz(forged), { offline: true }).problems.join()).toMatch(/an archive inside the bundle/);
    const old = new Map(files);
    old.set('bundle-manifest.json', Buffer.from(JSON.stringify({ ...bm, schema: 1 })));
    expect(() => verifyBundle(writeTarGz(old), { offline: true })).toThrow(/schema 1 \(4\.1\.18\)/);
  });

  it('field:check says when evidence passes what a bundle may carry', () => {
    const dir = folder({
      'livesplit-obs': (r, d) => passed(r, d, 'x'.repeat(BUDGET.maxFileBytes + 1)),
    });
    expect(checkDir(dir).problems.join()).toMatch(/more than 16777216/);
  });
});

describe('the leak scan', () => {
  it('names a secret by its kind, never its value', () => {
    expect(hardSecrets('AKIAABCDEFGHIJKLMNOP')).toEqual(['an AWS access key']);
    expect(hardSecrets('{"kty":"OKP","d":"abcdefghijklmnopqrstuvwxyz"}')).toEqual(['a private JWK']);
    expect(hardSecrets(`${'1'.repeat(64)} ${'a'.repeat(40)}`)).toEqual([]);
    expect(reportLeaks('Basic dXNlcjpwYXNzd29yZA==')).toEqual(['a bearer']);
    expect(redact('nothing here').redacted).toEqual([]);
  });
});

describe('the second reading (4.1.18): what could pass for a pass, or leak', () => {
  it('reads a JSON escape decoded: a token or an address spelt \\u… is found', () => {
    const dir = folder({ 'archive-human-install': (r) => (r.notes = 'x') });
    const f = join(dir, 'archive-human-install.json');
    writeFileSync(
      f,
      readFileSync(f, 'utf8').replace(
        '"notes": "x"',
        '"notes": "\\u0067hp_abcdefghijklmnopqrstuvwxyz0123 ops\\u0040example.org"',
      ),
    );
    expect(checkDir(dir).problems).toEqual([
      'archive-human-install.json: holds a GitHub token',
      'archive-human-install.json: holds an email address',
    ]);
  });

  it("redacts a secret named inside an identifier, and a URL's credentials", () => {
    const { text } = redact(
      'access_token=abcd1234 DB_PASSWORD=hunter22 clientSecret: s3cr3tv4lue postgres://bridge:pw1234@db:5432/bridge',
    );
    expect(text).toBe(
      'access_token=<redacted> DB_PASSWORD=<redacted> clientSecret: <redacted> postgres://bridge:<redacted>@db:5432/bridge',
    );
  });

  it('takes evidence only from evidence/: not a report, not the manifest, not a link, not an archive', () => {
    const own = folder({
      'firefox-real-offline': (r, d) => {
        passed(r, d);
        r.evidence = [
          { path: 'candidate-manifest.json', sha256: sha256(readFileSync(join(d, MANIFEST))), kind: 'log' },
        ];
      },
    });
    expect(checkDir(own).problems).toEqual([
      'firefox-real-offline.json: evidence candidate-manifest.json lies outside evidence/ (a report or the manifest is not evidence)',
    ]);
    const outside = tmp();
    writeFileSync(join(outside, 'secret.txt'), 'aws_secret_access_key=abcdefgh\n');
    const linked = folder({
      'firefox-real-offline': (r, d) => {
        passed(r, d);
        symlinkSync(join(outside, 'secret.txt'), join(d, 'evidence/link.txt'));
        r.evidence = [
          { path: 'evidence/link.txt', sha256: sha256(readFileSync(join(outside, 'secret.txt'))), kind: 'log' },
        ];
      },
    });
    expect(checkDir(linked).problems).toEqual(['firefox-real-offline.json: evidence evidence/link.txt is a link']);
    const zipped = folder({
      'firefox-real-offline': (r, d) => {
        passed(r, d);
        writeFileSync(join(d, 'evidence/logs.gz'), 'x');
        r.evidence = [{ path: 'evidence/logs.gz', sha256: sha256('x'), kind: 'log' }];
      },
    });
    expect(checkDir(zipped).problems).toEqual([
      'firefox-real-offline.json: evidence evidence/logs.gz is an archive, which cannot be read for a leak',
    ]);
  });

  it('reads any text evidence for a leak, whatever its extension (a .har, a .env)', () => {
    const dir = folder({
      'connectors-real-security': (r, d) => {
        passed(r, d);
        writeFileSync(
          join(d, 'evidence/session.har'),
          '{"headers":[{"name":"Authorization","value":"Bearer abcdefghijkl"}]}',
        );
        r.evidence = [
          { path: 'evidence/session.har', sha256: sha256(readFileSync(join(d, 'evidence/session.har'))), kind: 'har' },
        ];
      },
    });
    expect(checkDir(dir).problems).toEqual([
      'connectors-real-security.json: evidence evidence/session.har holds a bearer',
    ]);
  });

  it('refuses reports of two releases, and a release the candidate did not pack', () => {
    const two = folder({ 'voices-listening': (r) => (r.release = '4.1.19') });
    expect(checkDir(two).problems).toContain('the reports name several releases: 4.1.18, 4.1.19');
    const other = { ...manifest, artifacts: [{ name: 'pack/web-scumm-4.1.17.tgz', sha256: '1'.repeat(64) }] };
    const dir = tmp();
    writeFileSync(join(dir, MANIFEST), JSON.stringify(other));
    for (const id of passesFor('4.1.18'))
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(blankReport(id, '4.1.18', other)));
    expect(checkDir(dir).problems).toEqual(['release 4.1.18: the candidate packed 4.1.17']);
  });

  it("keeps a person's text in its cell: no new row, comment, tag or marker", () => {
    const dir = folder({
      'mystery-deployed': (r) =>
        Object.assign(r, {
          status: 'blocked',
          operator: 'ops',
          startedAt: '2026-10-10T09:00:00Z',
          finishedAt: '2026-10-10T09:05:00Z',
          scenario: 'deploy',
          environment: { os: 'Linux', versions: {} },
          notes: 'a\r| fake | passed | | | |\\| <!-- field:end -->',
        }),
    });
    const section = renderPasses(checkDir(dir).reports, manifest);
    const row = section.split('\n').find((l) => l.includes('`mystery-deployed`'))!;
    expect(row).toContain('a \\| fake \\| passed \\| \\| \\| \\|\\\\\\| &lt;!-- field:end --&gt; |');
    expect(section.split('\n').filter((l) => l.startsWith('| ')).length).toBe(14);
    const sheet = writePasses(null, section, '4.1.18');
    expect(writePasses(sheet.replaceAll('\n', '\r\n'), section, '4.1.18')).not.toContain('\r\r');
    expect(manualPasses(sheet)).toContain('0 of 13 done.');
  });

  it('counts the status column only, in the first table', () => {
    const sheet =
      "## People's passes\n\n| Pass | Status | Who | Env | Failed |\n|---|---|---|---|---|\n| a | passed | | | failed once |\n| b | not-run | | | |\n\n| other | failed |\n";
    expect(manualPasses(sheet)).toContain('1 of 2 done.');
  });
});
