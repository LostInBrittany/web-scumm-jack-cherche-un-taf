#!/usr/bin/env node
// npm run ops:qualify -- [--tarballs=<dir>] [--image-from=<dir>] [--short] [--candidate-run=<id>] [--old-bridge=<tgz>]
// [--out=<dir>] [--keep] (4.1.18 "Dress Rehearsal", plan §8.3): the Bridge's
// qualification profile (ops/qualify/compose.yml) built from the candidate's `quest-n-click-bridge` tarball, brought up
// behind HTTPS with three instances on one Postgres and two tenants, then driven the way an operator's bad day goes:
//
//   1. every image pinned by digest (compose and Dockerfile);
//   2. two tenants initialised by the package's own `init` and `grant`, three players each paired over HTTPS;
//   3. a stream held on one instance while proposals go through the proxy to all three;
//   4. an instance killed in the middle, then started again; a connector repeats what failed (its dedupeKey);
//   5. every player's sequence contiguous, each proposal applied once, duplicates said so, the stream in order;
//   6. a tenant's capability and token refused by the other tenant;
//   7. (4.1.19) the leaderboard of tenant a: the daily token alike on the three instances, a Mystery committed on one
//      and revealed on the others, a run verified by the speedrun worker and read elsewhere, its duplicate refused, a
//      moderator's bearer, an instance killed while its worker verifies (another takes the run when the lease ends,
//      verifies it once), one submission quota for the three instances, the board after 20 000 runs;
//   8. `backup` (schema 4 since 4.1.20: the whole store in one snapshot), the whole topology destroyed (its database
//      volume too), brought up empty, `restore --mode=merge`, then every player's signals, the board and the daily
//      token compared, and a new proposal continuing the sequence; (4.1.20) a restore refused at once while the
//      Bridges serve (their maintenance leases), then `--mode=replace-store` with them stopped, after its safety backup;
//   9. a store made by the published 4.1.17 Bridge read by this one.
//
// Writes <out>/ops-qualify.json (format web-scumm-ops-qualify, schema 2 since 4.1.20: the profile, the commit, the
// candidate run, the four archives' SHA-256, the images, the command that reproduces it, each step with its stable id,
// duration and first defect) and exits 1 when a step fails. Docker with Compose v2 on Linux; the human pass behind a real domain for
// 24-48 h (`bridge-postgres-https`) uses the same profile (ops/qualify/README.md).
//
// The steps live in scripts/ops-qualify/ (4.1.20 PR 3, plan §8.0): setup.mjs (1–2), topology.mjs, signals.mjs (3–6),
// runs.mjs (7), backup.mjs (8–9), report.mjs; steps.mjs judges and keeps each step.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { backupRestore, oldStore } from './ops-qualify/backup.mjs';
import { newReport, verdict, writeReport } from './ops-qualify/report.mjs';
import { runs } from './ops-qualify/runs.mjs';
import { setup } from './ops-qualify/setup.mjs';
import { signals } from './ops-qualify/signals.mjs';
import { createSteps, sh } from './ops-qualify/steps.mjs';
import { topology } from './ops-qualify/topology.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PROFILE = join(ROOT, 'ops', 'qualify');
const args = process.argv.slice(2);
const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const out = resolve(flag('out') ?? '.cache/field/deployment');
mkdirSync(out, { recursive: true });
const base = mkdtempSync(join(tmpdir(), 'quest-n-click-qualify-'));
// Whatever ends the run (a setup step that throws included), its folder (tenant keys, the store's URL) goes with it.
process.on('exit', () => {
  if (!args.includes('--keep')) rmSync(base, { recursive: true, force: true });
});
const PORT = Number(flag('port') ?? 8443);
const { steps, step } = createSteps();
const SHORT = args.includes('--short');

// What every part reads: the run's own, then what each part before it gave.
const c = { ROOT, PROFILE, args, flag, version, out, base, PORT, SHORT, steps, step, sh };
Object.assign(c, setup(c));
c.topology = topology(c);
Object.assign(c, c.topology);
const report = newReport(c);
let failedHard = null;
try {
  c.up();
  await c.readyCa();
  step('three Bridges and Postgres up behind HTTPS', true);
  Object.assign(c, await signals(c));
  Object.assign(c, await runs(c));
  Object.assign(c, await backupRestore(c));
  await oldStore(c);
  // Said when it is so (4.1.20): the gate reads every step of the catalogue, this one included.
  step('the qualification ran to its end', true);
} catch (e) {
  failedHard = e;
  step('the qualification ran to its end', false, { error: String(e.message ?? e).slice(0, 400) });
  try {
    console.error(c.dc(['logs', '--no-color', '--tail', '60'], { allowFail: true }).stdout);
  } catch {
    /* no logs */
  }
} finally {
  if (!args.includes('--keep')) c.dc(['down', '-v'], { allowFail: true });
  writeReport(out, report);
  if (!args.includes('--keep')) rmSync(base, { recursive: true, force: true });
}
process.exit(verdict(out, steps, failedHard));
