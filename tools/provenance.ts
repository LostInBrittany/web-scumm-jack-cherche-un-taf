// npm run provenance: where the shipped assets come from, under which licences, and whether they are the files that
// were reviewed. `--lock` writes games/<id>/provenance.lock.json (each file's SHA-256 and size with its entry's claims)
// after a review; `validate --release` then refuses any file or claim that changed since
// (wiki/en/create.asset-provenance.md#provenance). Exit codes: 0 clean, 1 something to review (coverage, lock, licences).
import {
  entryOf,
  licenceVerdict,
  lockDiff,
  lockMessages,
  makeLock,
  placeholderVerdict,
  provenanceReport,
} from '../src/engine/tools/provenance';
import { GAME, GAME_DIR, loadGameModule } from './game';
import {
  fileFacts,
  LOCK,
  PROVENANCE,
  readJson,
  shippedKeys,
  type Provenance,
  type ProvenanceLock,
} from './provenance-files';
import { resolve } from 'node:path';
import { writeGame } from './game-write';

const { game } = await loadGameModule();
const prov = readJson<Provenance>(PROVENANCE);
if (!prov) {
  console.log(
    `✖  [${GAME}] no provenance.json: say where every asset comes from first (https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Create-Asset-Provenance#provenance)`,
  );
  process.exit(1);
}
const keys = shippedKeys(game);
const manifest = readJson<{ images: Record<string, unknown>; videos?: Record<string, unknown> }>(
  resolve(GAME_DIR, 'assets.gen.json'),
) ?? { images: {} };
const r = provenanceReport(game, manifest, prov);
const files = fileFacts(keys);
const problems = [
  ...r.uncovered.map((k) => `${k}: no entry says where it comes from`),
  ...r.ambiguous.map((k) => `${k}: more than one entry matches`),
  ...r.incomplete.map((m) => `${m}: an entry needs match, source, licence and status`),
];

if (process.argv.includes('--lock')) {
  const missing = keys.filter((k) => !files[k]);
  if (problems.length || missing.length) {
    for (const p of [...problems, ...missing.map((k) => `${k}: the file is missing`)]) console.log('   ' + p);
    console.log(`✖  [${GAME}] not locked: fix the provenance first`);
    process.exit(1);
  }
  const lock = makeLock(keys, prov, files);
  await writeGame('provenance lock', [{ file: LOCK, text: JSON.stringify(lock, null, 1) + '\n' }], { guard: false });
  console.log(
    `✔  [${GAME}] provenance.lock.json: ${Object.keys(lock.assets).length} files locked (${(Object.values(lock.assets).reduce((n, a) => n + a.bytes, 0) / 1e6).toFixed(1)} MB)`,
  );
  process.exit(0);
}

const byLicence = new Map<string, number>();
for (const k of keys) {
  const e = entryOf(prov, k);
  if (e) byLicence.set(e.licence, (byLicence.get(e.licence) ?? 0) + 1);
}
console.log(`[${GAME}] ${keys.length} shipped assets`);
for (const [l, n] of [...byLicence].sort((a, b) => b[1] - a[1]))
  console.log(
    `  ${String(n).padStart(5)}  ${l}${prov.licences?.allow?.includes(l) ? '' : prov.licences ? '  (not in licences.allow)' : ''}`,
  );
const lock = readJson<ProvenanceLock>(LOCK);
const lockMsgs = lock
  ? lockMessages(lockDiff(keys, prov, files, lock))
  : ['provenance.lock.json › missing: npm run provenance -- --lock after reviewing every entry'];
const lic = licenceVerdict(keys, prov);
const ph = placeholderVerdict(prov, r);
const errs = [...problems.map((p) => `provenance.json › ${p}`), ...lockMsgs, ...lic.errors, ...ph.errors];
for (const a of [...lic.accepted, ...ph.accepted]) console.log('  ℹ accepted: ' + a);
for (const e of errs) console.log('  ✖ ' + e);
console.log(
  `${errs.length ? '✖' : '✔'}  [${GAME}] provenance ${errs.length ? `${errs.length} thing(s) to review` : 'clean: every file is the one reviewed'}`,
);
process.exit(errs.length ? 1 : 0);
