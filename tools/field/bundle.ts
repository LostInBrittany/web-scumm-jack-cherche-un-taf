// A Field Kit bundle that stands on its own (4.1.19, plan §6.5): what a reproduction ticket carries, and what someone
// who holds only the bundle can check. Schema 2 holds the report, the evidence it lists (redacted), the candidate's
// manifest and, when the candidate made one (from 4.1.19), the manifest's provenance attestation; its own
// `bundle-manifest.json` gives each file's SHA-256. `field:verify-bundle` says three things apart:
//   - integrity: every file is the one the bundle names, the report is the candidate's (commit, run, digests);
//   - authenticity offline: the manifest's attestation verifies against a trusted root saved once
//     (`gh attestation trusted-root > trusted-root.jsonl`), and names the candidate's run; nothing is fetched;
//   - authenticity online: the same attestation looked up on GitHub, and the run read now: a candidate, green,
//     started by hand on main. A bundle of a candidate older than 4.1.19 (no attestation) is checked online against
//     the manifest the run itself keeps.
// The leak scan is a hygiene barrier (patterns of keys, tokens, addresses), not a proof that a capture holds nothing
// private: a binary or an image is only searched for keys and tokens.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
// @ts-expect-error: a plain .mjs module (tools/release), typed by its JSDoc-free contract here
import * as provenance from '../release/provenance.mjs';
import { ARCHIVE, type CandidateManifest, digestsOf, isText, MANIFEST, readEvidence, sha256 } from './field';
import { FieldReportSchema } from './schema';
import { hardSecrets, redact, reportLeaks } from './secrets';
import { BUDGET, type Budget, readTarGz, writeTarGz } from './tar';

export const ATTESTATION = 'candidate-manifest.attestation.jsonl';
const P = provenance as {
  readCandidateManifest(text: string): CandidateManifest;
  digestProblems(m: CandidateManifest, files: Map<string, Buffer | string>, o?: { all?: boolean }): string[];
  verifyAttestation(
    file: string,
    o: {
      bundle?: string;
      trustedRoot?: string;
      signerWorkflow?: string;
      sourceRef?: string;
      gh?: string;
      timeoutMs?: number;
      former?: boolean;
    },
  ): { runId: string | null };
  queryRun(runId: string, o?: { gh?: string; timeoutMs?: number }): Record<string, string>;
  candidateRunProblem(r: Record<string, string>, runId: string): string | null;
  CANDIDATE_WORKFLOW: string;
};

const BundleManifestSchema = z
  .object({
    format: z.literal('web-scumm-field-bundle'),
    schema: z.literal(2),
    passId: z.string(),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    candidateRun: z.string().regex(/^\d+$/),
    report: z.string().regex(/^[0-9a-f]{64}$/),
    candidateManifest: z.string().regex(/^[0-9a-f]{64}$/),
    attestation: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    files: z
      .array(
        z
          .object({
            path: z.string(),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            source: z.string().regex(/^[0-9a-f]{64}$/),
            redacted: z.array(z.string()),
          })
          .strict(),
      )
      .max(BUDGET.maxEntries),
  })
  .strict();

/**
 * A bundle of a report: the report, the evidence it lists (text redacted; refused when a key or a token remains), the
 * candidate's manifest and its attestation when the folder holds one. Evidence keeps the path the report names (under
 * `evidence/`), never `evidence/evidence/` (4.1.18's bundles).
 */
export function makeBundle(reportFile: string, budget: Budget = BUDGET): { bytes: Buffer; redacted: string[] } {
  const dir = join(reportFile, '..');
  const raw = readFileSync(reportFile, 'utf8');
  const r = FieldReportSchema.parse(JSON.parse(raw));
  const leaks = reportLeaks(raw);
  if (leaks.length) throw new Error(`the report holds ${leaks.join(', ')}: refused`);
  const out = new Map<string, Buffer>();
  const files: z.infer<typeof BundleManifestSchema>['files'] = [];
  const redacted = new Set<string>();
  let total = 0;
  for (const e of r.evidence) {
    const read = readEvidence(dir, e.path);
    if ('why' in read) throw new Error(`evidence ${e.path} ${read.why}: refused`);
    const src = read.bytes;
    if (sha256(src) !== e.sha256) throw new Error(`evidence ${e.path} is not the file the report names`);
    if (src.length > budget.maxFileBytes) throw new Error(`evidence ${e.path}: more than ${budget.maxFileBytes} bytes`);
    let body: Buffer = src;
    let cut: string[] = [];
    if (isText(src)) {
      const text = src.toString('utf8');
      const hard = hardSecrets(text);
      if (hard.length) throw new Error(`evidence ${e.path} holds ${hard.join(', ')}: refused, never bundled`);
      const red = redact(text);
      body = Buffer.from(red.text);
      cut = red.redacted;
    } else if (hardSecrets(src.toString('latin1')).length) {
      throw new Error(`evidence ${e.path} holds a key or a token: refused, never bundled`);
    }
    total += body.length;
    if (total > budget.maxTotalBytes) throw new Error(`the evidence passes ${budget.maxTotalBytes} bytes`);
    for (const k of cut) redacted.add(k);
    out.set(e.path, body);
    files.push({ path: e.path, sha256: sha256(body), source: e.sha256, redacted: cut });
  }
  const manifestBytes = readFileSync(join(dir, MANIFEST));
  const m = P.readCandidateManifest(manifestBytes.toString('utf8'));
  if (m.sha !== r.commit || m.candidateRunId !== r.candidateRun)
    throw new Error("the report is not the folder candidate's: field:check first");
  out.set(MANIFEST, manifestBytes);
  let attestation: Buffer | null = null;
  try {
    attestation = readFileSync(join(dir, ATTESTATION));
    out.set(ATTESTATION, attestation);
  } catch {
    /* a candidate older than 4.1.19 made no attestation of its manifest */
  }
  const report = Buffer.from(`${JSON.stringify(r, null, 1)}\n`);
  out.set('report.json', report);
  const bm = {
    format: 'web-scumm-field-bundle' as const,
    schema: 2 as const,
    passId: r.passId,
    commit: r.commit,
    candidateRun: r.candidateRun,
    report: sha256(report),
    candidateManifest: sha256(manifestBytes),
    attestation: attestation ? sha256(attestation) : null,
    files,
  };
  out.set('bundle-manifest.json', Buffer.from(`${JSON.stringify(bm, null, 1)}\n`));
  // Every file counts, as the reader counts them; a bundle its own check would refuse is never written.
  const all = [...out.values()].reduce((n, b) => n + b.length, 0);
  if (all > budget.maxTotalBytes)
    throw new Error(`the bundle would hold ${all} bytes, more than ${budget.maxTotalBytes}`);
  const bytes = writeTarGz(out);
  if (bytes.length > budget.maxArchiveBytes)
    throw new Error(`the bundle would be ${bytes.length} bytes compressed, more than ${budget.maxArchiveBytes}`);
  return { bytes, redacted: [...redacted] };
}

export interface BundleVerdict {
  passId: string;
  status: string;
  commit: string;
  candidateRun: string;
  /** Integrity and candidate: [] when the files are the bundle's and the report is its candidate's. */
  problems: string[];
  authenticity:
    | { level: 'attested'; mode: 'offline' | 'online'; runId: string }
    | { level: 'run-manifest'; runId: string }
    | { level: 'unverified'; why: string };
}

/**
 * Checks a bundle as its receiver would: read under the budget (tar.ts), every file against the bundle manifest, the
 * report against its schema and its candidate's manifest, then authenticity by the means given. `offline` never asks
 * GitHub; it needs `trustedRoot` to verify the attestation.
 */
export function verifyBundle(
  archive: Buffer,
  o: { offline?: boolean; trustedRoot?: string; budget?: Budget; maxMs?: number; gh?: string } = {},
): BundleVerdict {
  const started = Date.now();
  const budgetMs = o.maxMs ?? 60_000;
  const late = () => {
    if (Date.now() - started > budgetMs) throw new Error(`the check took more than ${budgetMs} ms`);
  };
  /** What is left of the minute: every call to `gh` is bounded by it, not only the steps between them. */
  const left = () => Math.max(1_000, budgetMs - (Date.now() - started));
  const files = readTarGz(archive, o.budget ?? BUDGET);
  late();
  const problems: string[] = [];
  const get = (name: string) => {
    const b = files.get(name);
    if (!b) throw new Error(`the bundle holds no ${name}`);
    return b;
  };
  const raw = JSON.parse(get('bundle-manifest.json').toString('utf8')) as { schema?: unknown };
  if (raw?.schema === 1)
    throw new Error('a bundle of schema 1 (4.1.18) carries no candidate manifest: it cannot be verified on its own');
  const bm = BundleManifestSchema.parse(raw);
  const reportBytes = get('report.json');
  const r = FieldReportSchema.parse(JSON.parse(reportBytes.toString('utf8')));
  for (const leak of reportLeaks(reportBytes.toString('utf8'))) problems.push(`report.json: holds ${leak}`);
  const manifestBytes = get(MANIFEST);
  const m = P.readCandidateManifest(manifestBytes.toString('utf8'));
  const attestation = files.get(ATTESTATION) ?? null;
  // Integrity: each file the bundle names, nothing it does not.
  const expected = new Set(['bundle-manifest.json', 'report.json', MANIFEST, ...bm.files.map((f) => f.path)]);
  if (attestation) expected.add(ATTESTATION);
  for (const name of files.keys()) if (!expected.has(name)) problems.push(`${name}: not named by the bundle`);
  if (sha256(reportBytes) !== bm.report) problems.push('report.json: not the report the bundle names');
  if (sha256(manifestBytes) !== bm.candidateManifest) problems.push(`${MANIFEST}: not the one the bundle names`);
  if ((attestation ? sha256(attestation) : null) !== bm.attestation)
    problems.push(`${ATTESTATION}: not the one the bundle names`);
  const listed = new Map(r.evidence.map((e) => [e.path, e.sha256]));
  for (const f of bm.files) {
    // Evidence only, never an archive whose inside cannot be read (as field:check refuses it at the source).
    if (!f.path.startsWith('evidence/')) problems.push(`${f.path}: evidence lies under evidence/`);
    if (ARCHIVE.test(f.path)) problems.push(`${f.path}: an archive inside the bundle`);
    const b = files.get(f.path);
    if (!b) problems.push(`${f.path}: missing`);
    else if (sha256(b) !== f.sha256) problems.push(`${f.path}: its SHA-256 differs from the bundle's`);
    if (listed.get(f.path) !== f.source) problems.push(`${f.path}: not evidence the report lists`);
    if (b && (isText(b) ? hardSecrets(b.toString('utf8')) : hardSecrets(b.toString('latin1'))).length)
      problems.push(`${f.path}: holds a key or a token`);
  }
  for (const path of listed.keys()) if (!bm.files.some((f) => f.path === path)) problems.push(`${path}: not bundled`);
  // The candidate: the report's commit, run and digests are its manifest's.
  if (r.commit !== m.sha || bm.commit !== m.sha)
    problems.push(`the report tried ${r.commit.slice(0, 7)}, the manifest is ${m.sha.slice(0, 7)}`);
  if (r.candidateRun !== m.candidateRunId || bm.candidateRun !== m.candidateRunId)
    problems.push(`the report names run ${r.candidateRun}, the manifest run ${m.candidateRunId}`);
  const want = digestsOf(m);
  const got = r.packageDigests;
  if (Object.keys(want).length !== Object.keys(got).length || Object.entries(want).some(([k, v]) => got[k] !== v))
    problems.push("the report's file digests are not its candidate's");
  if (bm.passId !== r.passId) problems.push('the bundle and its report name different passes');
  late();
  // Authenticity.
  let authenticity: BundleVerdict['authenticity'];
  const tmp = mkdtempSync(join(tmpdir(), 'field-verify-'));
  try {
    const mf = join(tmp, MANIFEST);
    writeFileSync(mf, manifestBytes);
    if (attestation && (o.offline ? o.trustedRoot : true)) {
      const af = join(tmp, ATTESTATION);
      writeFileSync(af, attestation);
      const { runId } = P.verifyAttestation(mf, {
        bundle: af,
        ...(o.offline ? { trustedRoot: o.trustedRoot } : {}),
        signerWorkflow: P.CANDIDATE_WORKFLOW,
        // Started on main: a candidate a tag (or a pass) may stand on, said by the attestation itself offline.
        sourceRef: 'refs/heads/main',
        // A candidate made before the transfer (4.5.2, D51) was attested by wanoo/quest-n-click, one before 4.2.5 by
        // wanoo/web-scumm (D47): both looked up under the user wanoo, the workflow pinned.
        former: true,
        ...(o.gh ? { gh: o.gh } : {}),
        timeoutMs: left(),
      });
      if (runId !== m.candidateRunId)
        problems.push(`the attestation names run ${runId}, the manifest run ${m.candidateRunId}`);
      if (!o.offline) {
        const why = P.candidateRunProblem(
          P.queryRun(m.candidateRunId, { ...(o.gh ? { gh: o.gh } : {}), timeoutMs: left() }),
          m.candidateRunId,
        );
        if (why) problems.push(why);
      }
      authenticity = { level: 'attested', mode: o.offline ? 'offline' : 'online', runId: runId ?? '' };
    } else if (o.offline) {
      authenticity = {
        level: 'unverified',
        why: attestation
          ? 'offline without --trusted-root'
          : 'no attestation (a candidate before 4.1.19): verify online',
      };
    } else {
      // No attestation: the run itself, then the manifest it keeps, byte for byte.
      const why = P.candidateRunProblem(
        P.queryRun(m.candidateRunId, { ...(o.gh ? { gh: o.gh } : {}), timeoutMs: left() }),
        m.candidateRunId,
      );
      if (why) problems.push(why);
      const dl = join(tmp, 'run');
      const g = spawnSync(o.gh ?? 'gh', ['run', 'download', m.candidateRunId, '-n', 'candidate-manifest', '-D', dl], {
        encoding: 'utf8',
        timeout: left(),
      });
      if (g.status !== 0) throw new Error(`the manifest of run ${m.candidateRunId} could not be downloaded`);
      if (sha256(readFileSync(join(dl, MANIFEST))) !== sha256(manifestBytes))
        problems.push(`${MANIFEST}: not the manifest run ${m.candidateRunId} keeps`);
      authenticity = { level: 'run-manifest', runId: m.candidateRunId };
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  late();
  return { passId: r.passId, status: r.status, commit: m.sha, candidateRun: m.candidateRunId, problems, authenticity };
}
