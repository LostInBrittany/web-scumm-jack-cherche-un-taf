// npm run field:<command> … (4.1.18 "Dress Rehearsal", docs/dev/PLAN-4.1.18-DRESS-REHEARSAL.md §5): the people's passes
// as data. A pass is one JSON report (tools/field/schema.ts) in a folder that also holds the candidate's manifest; the
// sheet docs/dev/passes/<version>.md is generated from them, never edited by hand into a success.
//
//   field:init   --release=<x.y.z> --candidate=<run id> [--manifest=<candidate-manifest.json>] [--dir=<folder>] [--force]
//                the thirteen reports at `not-run`, bound to the candidate's commit, run and file digests (the manifest is
//                downloaded from the run with `gh` when not given); an existing report is kept unless --force
//   field:check  --dir=<folder> [--require=<passId,…>]
//                every report against the schema, the candidate, its evidence's SHA-256 and the leak scan; --require
//                names passes that must be `passed` (a 4.2 gate; no human pass blocks a 4.1.x tag, D12)
//   field:report --dir=<folder> --out=<sheet.md>
//                the people's passes table, written between `<!-- field:begin -->` and `<!-- field:end -->` (or in place of
//                the sheet's "## People's passes" section, or as a new sheet)
//   field:bundle --report=<report.json> --out=<bundle.tar.gz>
//                the report and only the evidence it lists, logs redacted, refused on a key or a token, the candidate's
//                manifest and its attestation, with its own SHA-256 manifest: what a reproduction ticket carries
//                (tools/field/bundle.ts, schema 2 since 4.1.19)
//   field:verify-bundle <bundle.tar.gz> [--offline --trusted-root=<file>]
//                the bundle read under its budgets, its files, its report against its candidate, then who made the
//                manifest: its attestation (offline with a trusted root), or the run read on GitHub
//   field:carry  --from=<folder> --to=<folder> --pass=<passId> [--out=<attestations folder>] | --check-range=<a..b>
//                (4.1.20, ADR 0024) a pass of the source candidate's folder carried to the target's: refused when a file
//                of its surface changed (the version included); else a `pending` CarryAttestation and the source
//                report's copy, written under docs/dev/passes/carry/<target release>/, for the maintainer to approve
//                in a commit signed with their key. `--check-range` refuses a range that changes both the trust root
//                and an attestation
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  FIELD_STATUSES,
  type FieldReport,
  FieldReportSchema,
  PASS_IDS,
  PASS_LABELS,
  type PassId,
  passesFor,
} from './schema';
import { makeBundle, verifyBundle, ATTESTATION } from './bundle';
import { CarryAttestationSchema, carriedPass, carryCheck, type Surfaces } from './carry';
import { CARRY_DIR, rangeProblems, trustedApproval } from './trust';
import { hardSecrets, reportLeaks } from './secrets';
import { BUDGET } from './tar';
// @ts-expect-error: a plain .mjs module
import { downloadArgs, repoOfRelease } from '../release/provenance.mjs';

/** The candidate's manifest (tools/release/candidate.mjs): the commit, the run, the digest of each file it judged. */
export interface CandidateManifest {
  format: 'web-scumm-candidate';
  schema: 1;
  sha: string;
  candidateRunId: string;
  createdAt: string;
  artifacts: { name: string; sha256: string }[];
}
export const MANIFEST = 'candidate-manifest.json';

/**
 * The checkout's package version: what a folder is judged as when nothing in it names a release (no report, no
 * package in the candidate's manifest). Its passes are asked, never every pass of `PASS_IDS`: a pass added in a later
 * version (`PASS_SINCE`, docs-beginner-reader from 4.5.0) is not asked of the version this checkout is.
 */
export const checkoutVersion = (): string =>
  (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version;
/** Archives are refused as evidence: what is inside cannot be read for a leak. Text is told from binary by content. */
export const ARCHIVE = /\.(gz|tgz|zip|tar|7z|br|zst|xz|bz2|rar)$/i;
export const isText = (b: Buffer) => !b.subarray(0, 8192).includes(0);

/**
 * One piece of evidence read safely (4.1.18, second reading): under the folder's `evidence/`, a regular file and not
 * a link, inside the folder once resolved, not an archive. Else why not.
 */
export function readEvidence(dir: string, path: string): { bytes: Buffer } | { why: string } {
  if (!path.startsWith('evidence/'))
    return { why: 'lies outside evidence/ (a report or the manifest is not evidence)' };
  if (ARCHIVE.test(path)) return { why: 'is an archive, which cannot be read for a leak' };
  const p = join(dir, path);
  if (!existsSync(p)) return { why: 'is missing' };
  const st = lstatSync(p);
  if (st.isSymbolicLink()) return { why: 'is a link' };
  if (!st.isFile()) return { why: 'is not a file' };
  const root = realpathSync(dir);
  const real = realpathSync(p);
  if (real !== root && !real.startsWith(root + sep)) return { why: 'resolves outside the folder' };
  return { bytes: readFileSync(p) };
}

/** Windows' own tar (bsdtar): Git's GNU tar, first on a bash PATH, reads `C:\\…` as a remote host. */
export const TAR =
  process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export function readManifest(file: string): CandidateManifest {
  const m = JSON.parse(readFileSync(file, 'utf8')) as CandidateManifest;
  if (
    m?.format !== 'web-scumm-candidate' ||
    m.schema !== 1 ||
    !/^[0-9a-f]{40}$/.test(m.sha) ||
    !/^\d+$/.test(m.candidateRunId)
  )
    throw new Error(`${file}: not a candidate manifest of schema 1`);
  return m;
}

/** The surfaces and the site's files a folder keeps beside its manifest (4.1.20, `field:init`). */
export const SURFACES = 'qualification-surfaces.json';
export const SITE_FILES = 'site-files.json';

/**
 * A candidate as a carry reads it, from a folder `field:init` made: its manifest, its surfaces and its site's files,
 * each of the last two the very bytes the attested manifest names (`surfaces/…`, `site/…`). Every file of the
 * candidate (path → SHA-256, the site's as `site:<path>`).
 */
export function candidateOf(dir: string): { m: CandidateManifest; surfaces: Surfaces; files: Record<string, string> } {
  const m = readManifest(join(dir, MANIFEST));
  const want = digestsOf(m);
  const bound = (file: string, name: string) => {
    const p = join(dir, file);
    if (!existsSync(p)) throw new Error(`${dir}: no ${file} (a candidate before 4.1.20 has no surfaces: field:init)`);
    const b = readFileSync(p);
    if (want[name] !== sha256(b)) throw new Error(`${dir}/${file}: not the ${name} the candidate's manifest names`);
    return JSON.parse(b.toString('utf8'));
  };
  const surfaces = bound(SURFACES, 'surfaces/qualification-surfaces.json') as Surfaces;
  const site = bound(SITE_FILES, 'site/site-files.json') as { files: { path: string; sha256: string }[] };
  return {
    m,
    surfaces,
    files: { ...want, ...Object.fromEntries(site.files.map((f) => [`site:${f.path}`, f.sha256])) },
  };
}

/** The carries of a folder's release (`--carried=`, else docs/dev/passes/carry/<release>/), judged. */
function carriedOf(dir: string, carried: string | undefined) {
  const first = reportFiles(dir)[0];
  const release = first
    ? (JSON.parse(readFileSync(join(dir, first), 'utf8')) as { release?: string }).release
    : undefined;
  if (!release) return new Map<string, { counts: boolean; why?: string; from?: string }>();
  return carriedPasses(dir, resolve(carried ?? join(CARRY_DIR, release)), release);
}

/** The candidate a manifest names, as a carry refers to it. */
const refOf = (m: CandidateManifest, release: string) => ({ release, commit: m.sha, candidateRun: m.candidateRunId });

/**
 * The passes carried to a folder's candidate (4.1.20): every attestation under `carried` (docs/dev/passes/carry/
 * <release>/), counted only when approved, signed as tools/field/trust.ts requires (`repo`, the checkout), its source
 * report beside it the very bytes it names, its target this candidate's surface. Each pass, counted or why not.
 */
export function carriedPasses(
  dir: string,
  carried: string,
  release: string,
  repo = '.',
): Map<string, { counts: boolean; why?: string; from?: string }> {
  const out = new Map<string, { counts: boolean; why?: string; from?: string }>();
  if (!existsSync(carried)) return out;
  let target: ReturnType<typeof candidateOf> | null = null;
  let targetWhy = `${dir} keeps no surfaces of its candidate`;
  try {
    if (existsSync(join(dir, SURFACES))) target = candidateOf(dir);
  } catch (e) {
    targetWhy = (e as Error).message;
  }
  const seen = new Map<string, string>();
  for (const f of readdirSync(carried).filter((x) => x.endsWith('.json') && !x.endsWith('.report.json'))) {
    const p = join(carried, f);
    const rel = (q: string) => relative(resolve(repo), resolve(q)).split(sep).join('/');
    // The committed bytes, signed as the trust root requires; never what the working tree holds (an edit not
    // committed counts for nothing, second reading of PR 4).
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      out.set(f, { counts: false, why: 'not JSON' });
      continue;
    }
    const from = (json as { from?: { commit?: string } })?.from?.commit ?? '';
    const att = trustedApproval({ repo, path: rel(p), sourceCommit: from });
    if (!att.ok) {
      const id = (json as { passId?: string })?.passId ?? f;
      out.set(id, { counts: false, why: att.why });
      continue;
    }
    const parsed = CarryAttestationSchema.safeParse(JSON.parse(att.bytes));
    if (!parsed.success) {
      out.set(f, { counts: false, why: `not a carry attestation: ${parsed.error.issues[0]?.message}` });
      continue;
    }
    const a = parsed.data;
    if (f !== `${a.passId}.json`) {
      out.set(a.passId, { counts: false, why: `${f} holds the carry of ${a.passId}: one file per pass, by its id` });
      continue;
    }
    if (seen.has(a.passId)) {
      out.set(a.passId, { counts: false, why: `two carries of ${a.passId}` });
      continue;
    }
    seen.set(a.passId, f);
    if (!target) {
      out.set(a.passId, { counts: false, why: targetWhy });
      continue;
    }
    const reportPath = p.replace(/\.json$/, '.report.json');
    const rep = trustedApproval({ repo, path: rel(reportPath), sourceCommit: a.from.commit });
    if (!rep.ok) {
      out.set(a.passId, { counts: false, why: `the source report beside the carry: ${rep.why}` });
      continue;
    }
    if (rep.principal !== att.principal) {
      out.set(a.passId, { counts: false, why: 'the carry and its source report are signed by two principals' });
      continue;
    }
    const report = FieldReportSchema.safeParse(JSON.parse(rep.bytes));
    if (!report.success) {
      out.set(a.passId, { counts: false, why: 'the source report beside the carry is not a report' });
      continue;
    }
    const r = carriedPass({
      attestation: a,
      sourceReport: report.data,
      sourceReportBytes: rep.bytes,
      target: target.surfaces,
      targetRef: refOf(target.m, release),
      trusted: att,
    });
    out.set(a.passId, r.counts ? { counts: true, from: a.from.candidateRun } : { counts: false, why: r.why });
  }
  return out;
}

/** The digests a report is bound to: every file the candidate judged (its tarballs since 4.1.18, its runs, its reports). */
export const digestsOf = (m: CandidateManifest): Record<string, string> =>
  Object.fromEntries(m.artifacts.map((a) => [a.name, a.sha256]));

/** One pass, not run yet, bound to the candidate. */
export function blankReport(passId: PassId, release: string, m: CandidateManifest): FieldReport {
  return {
    schema: 1,
    passId,
    release,
    commit: m.sha,
    candidateRun: m.candidateRunId,
    packageDigests: digestsOf(m),
    status: 'not-run',
    environment: { versions: {} },
    evidence: [],
    failures: [],
  };
}

const sameDigests = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

/** The reports of a folder, by file, as parsed JSON: the candidate's own files `field:init` writes beside them (its
 * manifest, its surfaces, its site's files) and anything not `.json` left out. 4.2.0-rc.1 counted the last two as
 * reports, so a folder fresh from `field:init` failed `field:check` and `field:report` wrote nothing. */
function reportFiles(dir: string): string[] {
  const candidate = new Set([MANIFEST, SURFACES, SITE_FILES]);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !candidate.has(f))
    .sort();
}

/**
 * What is wrong with a folder of reports; [] when nothing is. Each report must parse, be the folder candidate's (commit,
 * run, every digest), say nothing a leak scan refuses, and show evidence whose SHA-256 is the one it names; each pass
 * appears exactly once; `require` names passes that must be `passed`.
 */
export function checkDir(
  dir: string,
  require: readonly string[] = [],
  carried: ReadonlyMap<string, { counts: boolean }> = new Map(),
): { problems: string[]; reports: FieldReport[] } {
  const problems: string[] = [];
  if (!existsSync(join(dir, MANIFEST)))
    return { problems: [`${dir}: no ${MANIFEST} (npm run field:init)`], reports: [] };
  const m = readManifest(join(dir, MANIFEST));
  const want = digestsOf(m);
  const reports: FieldReport[] = [];
  const seen = new Map<string, string>();
  for (const f of reportFiles(dir)) {
    const raw = readFileSync(join(dir, f), 'utf8');
    for (const leak of reportLeaks(raw)) problems.push(`${f}: holds ${leak}`);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      problems.push(`${f}: not JSON`);
      continue;
    }
    // The pass a file is for counts before its schema: an invalid report is not also a missing one.
    const id = (json as { passId?: unknown })?.passId;
    if (typeof id === 'string') {
      if (seen.has(id)) problems.push(`${f}: ${id} is also ${seen.get(id)}: one report per pass`);
      else seen.set(id, f);
    }
    const parsed = FieldReportSchema.safeParse(json);
    if (!parsed.success) {
      for (const i of parsed.error.issues) problems.push(`${f}: ${i.path.join('.') || '(report)'}: ${i.message}`);
      continue;
    }
    const r = parsed.data;
    if (r.commit !== m.sha)
      problems.push(`${f}: tried commit ${r.commit.slice(0, 7)}, the candidate is ${m.sha.slice(0, 7)}`);
    if (r.candidateRun !== m.candidateRunId)
      problems.push(`${f}: tried run ${r.candidateRun}, the candidate is run ${m.candidateRunId}`);
    if (!sameDigests(r.packageDigests, want)) problems.push(`${f}: its file digests are not the candidate's`);
    let evidenceBytes = 0;
    for (const e of r.evidence) {
      const read = readEvidence(dir, e.path);
      if ('why' in read) {
        problems.push(`${f}: evidence ${e.path} ${read.why}`);
        continue;
      }
      const b = read.bytes;
      // Bounded (4.1.19): what a bundle can carry, said here before anyone tries to bundle it; a file above it is not
      // scanned (the scan of megabytes of one character would take minutes).
      evidenceBytes += b.length;
      if (b.length > BUDGET.maxFileBytes) {
        problems.push(`${f}: evidence ${e.path} holds ${b.length} bytes, more than ${BUDGET.maxFileBytes}`);
        continue;
      }
      if (sha256(b) !== e.sha256) problems.push(`${f}: evidence ${e.path} is not the file it names (SHA-256 differs)`);
      const leaks = isText(b) ? reportLeaks(b.toString('utf8')) : hardSecrets(b.toString('latin1'));
      for (const leak of leaks) problems.push(`${f}: evidence ${e.path} holds ${leak}`);
    }
    if (evidenceBytes > BUDGET.maxTotalBytes)
      problems.push(
        `${f}: its evidence holds ${evidenceBytes} bytes, more than ${BUDGET.maxTotalBytes} for one bundle`,
      );
    reports.push(r);
  }
  // One release per folder, and the one its packages name when the candidate packed them (`pack/quest-n-click-x.y.z.tgz`
  // from 4.2.5, `pack/web-scumm-x.y.z.tgz` before).
  const releases = new Set(reports.map((r) => r.release));
  if (releases.size > 1) problems.push(`the reports name several releases: ${[...releases].join(', ')}`);
  const packed = Object.keys(want)
    .map((n) => /(?:^|\/)(?:quest-n-click|web-scumm)-(\d+\.\d+\.\d+)\.tgz$/.exec(n)?.[1])
    .find(Boolean);
  for (const rel of releases)
    if (packed && rel.replace(/-rc\.\d+$/, '') !== packed)
      problems.push(`release ${rel}: the candidate packed ${packed}`);
  const asked = releases.size === 1 ? passesFor([...releases][0]!) : passesFor(packed ?? checkoutVersion());
  for (const id of asked) if (!seen.has(id)) problems.push(`${id}: no report`);
  // A pass this release is not asked (added later): its report is not judged here, and is said so.
  const release = [...releases][0] ?? packed ?? checkoutVersion();
  for (const id of seen.keys()) if (!(asked as string[]).includes(id)) problems.push(`${id}: not a pass of ${release}`);
  for (const id of require) {
    if (!(PASS_IDS as readonly string[]).includes(id)) problems.push(`--require=${id}: not a pass`);
    else if (!(asked as string[]).includes(id)) problems.push(`--require=${id}: not a pass of ${release}`);
    else if (
      !filledBy(
        reports.find((r) => r.passId === id),
        carried.get(id),
      )
    )
      problems.push(`${id}: required, not passed (nor carried by an approved, signed attestation)`);
  }
  return { problems, reports };
}

/** Whether a pass counts as passed here: its own report passed, or not run and filled by a counted carry. */
const filledBy = (r: FieldReport | undefined, c: { counts: boolean } | undefined) =>
  r?.status === 'passed' || ((!r || r.status === 'not-run') && !!c?.counts);

/** A table cell from a person's text: one line, its backslashes, pipes and markup escaped (no row, comment or tag). */
const cell = (s: string | undefined) =>
  (s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\s*(\r\n|\r|\n)\s*/g, ' ');

/** The people's passes table of a sheet, from the reports, in the order of PASS_IDS. */
export function renderPasses(
  reports: readonly FieldReport[],
  m: CandidateManifest,
  carried: ReadonlyMap<string, { counts: boolean; from?: string }> = new Map(),
): string {
  const by = new Map(reports.map((r) => [r.passId, r]));
  const count = Object.fromEntries(FIELD_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  // The passes asked of the reports' release (a pass added later is not a row of an older sheet).
  const asked = passesFor(reports[0]?.release ?? checkoutVersion());
  const rows = asked.map((id) => {
    const r = by.get(id);
    // A pass carried here by an approved, signed attestation counts as passed; its report stays the person's (ADR 0024).
    // Only where the person tried nothing on this candidate: a carry never covers a failure made here.
    const carry = !r || r.status === 'not-run' ? carried.get(id) : undefined;
    const status = carry?.counts ? 'passed' : (r?.status ?? 'not-run');
    count[status]++;
    const env = r
      ? [r.environment.deviceFamily, r.environment.deviceModel, r.environment.os, r.environment.browser]
          .concat(Object.entries(r.environment.versions).map(([k, v]) => `${k} ${v}`))
          .filter(Boolean)
          .join(', ')
      : '';
    const who = r?.operator ? `${r.operator}, ${r.startedAt?.slice(0, 10) ?? ''}` : '';
    const failed = r?.failures.map((x) => `${x.step}: ${x.observed}${x.issue ? ` (${x.issue})` : ''}`).join('; ');
    return `| ${PASS_LABELS[id]} (\`${id}\`) | ${carry?.counts ? `passed, carried from run ${carry.from}` : status} | ${cell(who)} | ${cell(env)} | ${cell(failed || (status === 'blocked' ? r?.notes : ''))} |`;
  });
  return [
    "## People's passes",
    '',
    `Generated by \`npm run field:report\` from the reports of candidate run ${m.candidateRunId} (commit \`${m.sha.slice(0, 7)}\`):`,
    `${count.passed} passed, ${count.failed} failed, ${count.blocked} blocked, ${count['not-run']} not run, of ${asked.length}.`,
    'Only `passed` qualifies a surface (D18); a pass of another commit no longer counts. Each pass is an open issue',
    'labelled `field-pass`, closed by the maintainer once tested: https://github.com/Quest-n-Click/quest-n-click/issues?q=label%3Afield-pass',
    '',
    '| Pass | Status | Who, when | Device, OS, browser, versions | What failed |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

const BEGIN = '<!-- field:begin -->';
const END = '<!-- field:end -->';

/** The sheet with its people's passes replaced: between the markers, else the section, else appended. */
export function writePasses(sheet: string | null, section: string, release: string): string {
  const block = `${BEGIN}\n${section}${END}\n`;
  if (sheet === null) return `# Passes, ${release}\n\n${block}`;
  const b = sheet.indexOf(BEGIN);
  const e = sheet.indexOf(END);
  if (b >= 0 && e > b) return sheet.slice(0, b) + block + sheet.slice(e + END.length).replace(/^\r?\n/, '');
  const h = sheet.indexOf("## People's passes");
  if (h < 0) return `${sheet.trimEnd()}\n\n${block}`;
  const next = sheet.indexOf('\n## ', h + 1);
  return sheet.slice(0, h) + block + (next < 0 ? '' : sheet.slice(next + 1));
}

const flag = (args: string[], k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

export function main(args: string[]): number {
  const [cmd] = args;
  if (cmd === 'init') {
    const release = flag(args, 'release');
    const run = flag(args, 'candidate');
    if (!release || !run) throw new Error('field:init --release=<x.y.z> --candidate=<run id>');
    const dir = resolve(flag(args, 'dir') ?? `.cache/field/${release}`);
    mkdirSync(dir, { recursive: true });
    let manifestFile = flag(args, 'manifest');
    if (!manifestFile) {
      const tmp = mkdtempSync(join(tmpdir(), 'field-manifest-'));
      const r = spawnSync('gh', ['run', 'download', run, '-n', 'candidate-manifest', '-D', tmp], { stdio: 'inherit' });
      if (r.status !== 0)
        throw new Error(`the manifest of run ${run} could not be downloaded (--manifest= to give it)`);
      manifestFile = join(tmp, MANIFEST);
    }
    const m = readManifest(manifestFile);
    if (m.candidateRunId !== run) throw new Error(`the manifest is run ${m.candidateRunId}'s, not ${run}'s`);
    writeFileSync(join(dir, MANIFEST), readFileSync(manifestFile));
    // The manifest's provenance attestation (4.1.19): what lets a bundle be checked offline, by anyone.
    rmSync(join(dir, ATTESTATION), { force: true }); // never the attestation of the candidate before
    const att = mkdtempSync(join(tmpdir(), 'field-attestation-'));
    // Looked up where the release's identity keeps them: under the user wanoo before the transfer (4.5.2, D51).
    const g = spawnSync(
      'gh',
      ['attestation', 'download', join(dir, MANIFEST), ...downloadArgs(repoOfRelease(release))],
      {
        cwd: att,
        encoding: 'utf8',
      },
    );
    const got = g.status === 0 ? readdirSync(att).find((f) => f.endsWith('.jsonl')) : undefined;
    if (got) writeFileSync(join(dir, ATTESTATION), readFileSync(join(att, got)));
    else
      console.log(
        `ℹ  no attestation of the manifest downloaded (${g.status === 0 ? 'none: a candidate before 4.1.19' : (g.stderr || '').trim().split('\n').at(-1)}): its bundles are checked online`,
      );
    rmSync(att, { recursive: true, force: true });
    // The surfaces and the site's files (4.1.20, ADR 0024): what a carry of a pass from or to this candidate reads.
    for (const [artifact, file] of [
      ['candidate-surfaces', SURFACES],
      ['candidate-site', SITE_FILES],
    ] as const) {
      if (flag(args, 'manifest') && existsSync(join(dirname(resolve(flag(args, 'manifest')!)), file))) {
        writeFileSync(join(dir, file), readFileSync(join(dirname(resolve(flag(args, 'manifest')!)), file)));
        continue;
      }
      const t = mkdtempSync(join(tmpdir(), 'field-surfaces-'));
      const d = spawnSync('gh', ['run', 'download', run, '-n', artifact, '-D', t], { encoding: 'utf8' });
      if (d.status === 0 && existsSync(join(t, file))) writeFileSync(join(dir, file), readFileSync(join(t, file)));
      else console.log(`ℹ  no ${file} in run ${run} (a candidate before 4.1.20): its passes cannot be carried`);
      rmSync(t, { recursive: true, force: true });
    }
    let made = 0;
    for (const id of passesFor(release)) {
      const f = join(dir, `${id}.json`);
      if (existsSync(f) && !args.includes('--force')) continue;
      writeFileSync(f, `${JSON.stringify(blankReport(id, release, m), null, 1)}\n`);
      made++;
    }
    console.log(`✔  ${dir}: ${made} report(s) written at not-run, bound to ${m.sha.slice(0, 7)} (run ${run})`);
    return 0;
  }
  if (cmd === 'check') {
    const dir = resolve(flag(args, 'dir') ?? '.');
    const require = (flag(args, 'require') ?? '').split(',').filter(Boolean);
    const carried = carriedOf(dir, flag(args, 'carried'));
    const { problems, reports } = checkDir(dir, require, carried);
    for (const p of problems) console.error(`  ✖ ${p}`);
    const passed = reports.filter((r) => r.status === 'passed').length;
    if (problems.length) {
      console.error(`✖  field:check: ${problems.length} problem(s) in ${dir}`);
      return 1;
    }
    const carriedOk = [...carried.values()].filter((c) => c.counts).length;
    for (const [id, c] of carried) if (!c.counts) console.log(`  ℹ ${id}: a carry that does not count (${c.why})`);
    console.log(
      `✔  field:check: ${reports.length} reports agree with their candidate; ${passed} passed${carriedOk ? `, ${carriedOk} carried` : ''}`,
    );
    return 0;
  }
  if (cmd === 'report') {
    const dir = resolve(flag(args, 'dir') ?? '.');
    const out = flag(args, 'out');
    if (!out) throw new Error('field:report --dir=<folder> --out=<sheet.md>');
    const { problems, reports } = checkDir(dir);
    if (problems.length) {
      for (const p of problems) console.error(`  ✖ ${p}`);
      console.error('✖  field:report: the reports do not check (npm run field:check); nothing written');
      return 1;
    }
    const m = readManifest(join(dir, MANIFEST));
    const release = reports[0]?.release ?? 'unknown';
    const carried = carriedOf(dir, flag(args, 'carried'));
    writeFileSync(
      out,
      writePasses(existsSync(out) ? readFileSync(out, 'utf8') : null, renderPasses(reports, m, carried), release),
    );
    console.log(`✔  ${out}: the people's passes written from ${reports.length} reports`);
    return 0;
  }
  if (cmd === 'bundle') {
    const report = flag(args, 'report');
    const out = flag(args, 'out');
    if (!report || !out) throw new Error('field:bundle --report=<report.json> --out=<bundle.tar.gz>');
    const { bytes, redacted } = makeBundle(resolve(report));
    writeFileSync(resolve(out), bytes);
    console.log(`✔  ${out}: ${bytes.length} bytes${redacted.length ? `, redacted: ${redacted.join(', ')}` : ''}`);
    return 0;
  }
  if (cmd === 'verify-bundle') {
    const file = args.find((a, i) => i > 0 && !a.startsWith('--'));
    if (!file) throw new Error('field:verify-bundle <bundle.tar.gz> [--offline --trusted-root=<file>]');
    const offline = args.includes('--offline');
    const trustedRoot = flag(args, 'trusted-root');
    const v = verifyBundle(readFileSync(resolve(file)), {
      offline,
      ...(trustedRoot ? { trustedRoot: resolve(trustedRoot) } : {}),
    });
    for (const p of v.problems) console.error(`  ✖ ${p}`);
    const a = v.authenticity;
    const said =
      a.level === 'attested'
        ? `attested by candidate run ${a.runId} (${a.mode})`
        : a.level === 'run-manifest'
          ? `the manifest run ${a.runId} keeps (online)`
          : `not verified: ${a.why}`;
    console.log(
      `${v.problems.length ? '✖' : '✔'}  ${v.passId} (${v.status}) on ${v.commit.slice(0, 12)}, run ${v.candidateRun}: integrity ${v.problems.length ? 'refused' : 'ok'}; authenticity ${said}`,
    );
    return v.problems.length || a.level === 'unverified' ? 1 : 0;
  }
  if (cmd === 'carry') {
    const range = flag(args, 'check-range');
    if (range) {
      const bad = rangeProblems('.', range);
      for (const b of bad) console.error(`✖  ${b}`);
      if (!bad.length) console.log(`✔  ${range}: the trust root and the attestations are not changed together`);
      return bad.length ? 1 : 0;
    }
    const from = flag(args, 'from');
    const to = flag(args, 'to');
    const pass = flag(args, 'pass');
    if (!from || !to || !pass)
      throw new Error('field:carry --from=<folder> --to=<folder> --pass=<passId> [--out=<folder>]');
    const reportFile = join(resolve(from), `${pass}.json`);
    const reportBytes = readFileSync(reportFile, 'utf8');
    const report = FieldReportSchema.parse(JSON.parse(reportBytes));
    const source = candidateOf(resolve(from));
    const target = candidateOf(resolve(to));
    const targetRelease = JSON.parse(readFileSync(join(resolve(to), `${pass}.json`), 'utf8')).release as string;
    const r = carryCheck({
      report,
      reportBytes,
      from: refOf(source.m, report.release),
      to: refOf(target.m, targetRelease),
      source: source.surfaces,
      target: target.surfaces,
      sourceFiles: source.files,
      targetFiles: target.files,
    });
    if (!r.ok) {
      for (const w of r.why) console.error(`  ✖ ${w}`);
      console.error(`✖  field:carry: ${pass} is not carried to run ${target.m.candidateRunId}; it is run again`);
      return 1;
    }
    const out = resolve(flag(args, 'out') ?? join(CARRY_DIR, targetRelease));
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `${pass}.json`), `${JSON.stringify(r.attestation, null, 1)}\n`);
    // The person's report as they wrote it, byte for byte: what the attestation's digest names.
    writeFileSync(join(out, `${pass}.report.json`), reportBytes);
    console.log(
      `✔  ${pass}: its surface is unchanged (${r.attestation.changedFiles.length} other file(s) changed); a pending carry in ${out}. The maintainer commits it and approves it (decision "approved", approvedBy their principal), every commit signed with their key: one unsigned commit on that path refuses it for good. Claude commits nothing there.`,
    );
    return 0;
  }
  console.error('npm run field:<init|check|report|bundle|verify-bundle|carry> -- … (tools/field/field.ts)');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
    process.exit(1);
  }
}
