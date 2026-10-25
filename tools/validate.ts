// npm run validate: checks the game content (references, text, geometry). --report: the content profiler (Markdown).
// --release: a line without a stable id is reported (an error when the game has voices, else a warning), and the
//   asset provenance (games/<id>/provenance.json) is required: every asset covered by exactly one entry, and a
//   placeholder is an error unless a releaseExceptions entry names it. A game that ships a language other than its own
//   (`game.lang`, default en) or voices needs a stable id on every line.
//   The scores' stem files are measured (ffprobe): same rate, channels and samples, the loop inside, pcmBytes right.
// --commercial (npm run verify:commercial): a release that may be sold: no exception, no placeholder, no non-commercial
//   licence, every entry with an author and a source that can be checked (commercialVerdict).
// Without --release, a game that has provenance.json gets the same coverage check.
// The game: GAME, otherwise package.json → config.game (see tools/game.ts).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  commercialVerdict,
  licenceVerdict,
  lockDiff,
  lockMessages,
  placeholderVerdict,
  provenanceReport,
  type Provenance,
  type ProvenanceLock,
} from '../src/engine/tools/provenance';
import { fileFacts, LOCK, readJson, shippedKeys } from './provenance-files';
import { validate } from '../src/engine/tools/validate';
import { report, reportMarkdown } from '../src/engine/tools/report';
import { loadAssets, loadLayouts, loadLocales } from '../src/engine/tools/load';
import { ASSETS_DIR, GAME, GAME_DIR, WORK, loadGameModule } from './game';
import { assetPath } from '../src/engine/tools/provenance';
import { stemErrors } from '../src/engine/tools/stems';
import { hasFfprobe, stemFacts } from './stem-facts';

const mod = await loadGameModule();
const game = mod.game;
const commercial = process.argv.includes('--commercial');
const release = commercial || process.argv.includes('--release');
/** What the release ships knowingly: each exception named in provenance.json, with its reason (not a warning to fix). */
const accepted: string[] = [];
const layouts = loadLayouts(resolve(GAME_DIR, 'layout'));
const assets = loadAssets(resolve(GAME_DIR, 'assets.gen.json'));
let minigames: Record<string, { required?: string[] }> | undefined;
try {
  minigames = { ...(await import('../src/engine/minigames/index')).minigames, ...(mod.minigames ?? {}) };
} catch {
  minigames = undefined;
}
const minigameIds = minigames ? Object.keys(minigames) : undefined;
const minigameParams = minigames
  ? Object.fromEntries(Object.entries(minigames).map(([k, m]) => [k, m.required ?? []]))
  : undefined;
const minigameBindings = minigames
  ? Object.fromEntries(
      Object.entries(minigames).map(([k, m]) => [
        k,
        (m as { bindings?: { images?: string[]; sfx?: string[] } }).bindings ?? {},
      ]),
    )
  : undefined;

if (process.argv.includes('--report')) {
  process.stdout.write(reportMarkdown(report(game, layouts, { locales: loadLocales(resolve(GAME_DIR, 'locales')) })));
  process.exit(0);
}
const locales = loadLocales(resolve(GAME_DIR, 'locales'));
const { errors, warnings } = validate(game, layouts, {
  assets,
  minigameIds,
  minigameParams,
  minigameBindings,
  commands: mod.commands,
  release,
  translated: Object.keys(locales).some((l) => l !== (game.lang ?? 'en')),
  locales,
});
// Asset provenance: where every shipped image and sound comes from, and under which licence.
const provFile = resolve(GAME_DIR, 'provenance.json');
if (existsSync(provFile) && assets) {
  const r = provenanceReport(
    game,
    {
      images: assets.images,
      videos: (
        JSON.parse(readFileSync(resolve(GAME_DIR, 'assets.gen.json'), 'utf8')) as { videos?: Record<string, unknown> }
      ).videos,
    },
    JSON.parse(readFileSync(provFile, 'utf8')) as Provenance,
  );
  for (const k of r.uncovered) errors.push(`provenance.json › ${k}: no entry says where this asset comes from`);
  for (const m of r.incomplete)
    errors.push(`provenance.json › ${m}: an entry needs match, source, licence and status (final | placeholder)`);
  for (const a of r.ambiguous)
    errors.push(`provenance.json › ${a}: more than one entry matches this asset; make the patterns disjoint`);
  const prov = JSON.parse(readFileSync(provFile, 'utf8')) as Provenance;
  if (release) {
    const v = placeholderVerdict(prov, r);
    errors.push(...v.errors);
    accepted.push(...v.accepted);
  }
  // The lock: the files and claims that were reviewed. Required for a release; otherwise checked when present.
  const lock = readJson<ProvenanceLock>(LOCK);
  const keys = shippedKeys(game);
  if (lock) (release ? errors : warnings).push(...lockMessages(lockDiff(keys, prov, fileFacts(keys), lock)));
  else if (release)
    errors.push(
      'provenance.lock.json › missing: a release ships the files that were reviewed (npm run provenance -- --lock)',
    );
  if (release) {
    const l = licenceVerdict(keys, prov);
    errors.push(...l.errors);
    accepted.push(...l.accepted);
  }
  if (commercial) errors.push(...commercialVerdict(keys, prov, (p) => existsSync(resolve(WORK, p))));
} else if (release)
  errors.push(
    'provenance.json › missing: a release says where every asset comes from (https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Create-Asset-Provenance#provenance)',
  );
// The scores' stem files (3.6): the same rate, channels and samples, the loop inside them, pcmBytes as decoded. The
// built files (npm run assets), measured with ffprobe.
if (release && game.audio?.scores && !hasFfprobe())
  errors.push('audio.scores › ffprobe not found: a release measures the stem files (install ffmpeg, npm run doctor)');
else if (release)
  for (const [id, sc] of Object.entries(game.audio?.scores ?? {})) {
    errors.push(
      ...stemErrors(
        id,
        sc,
        Object.fromEntries(
          Object.entries(sc.stems).map(([s, f]) => [s, stemFacts(resolve(ASSETS_DIR, assetPath(`music:${f}`)!))]),
        ),
      ),
    );
  }
const quiet = process.argv.includes('--errors');
if (!quiet && accepted.length && !commercial) {
  console.log(
    `\nℹ  ${accepted.length} release exception(s), accepted by name in provenance.json (verify:commercial refuses them)`,
  );
  for (const a of accepted) console.log('   ' + a);
}
if (!quiet && warnings.length) {
  console.log(`\n⚠  ${warnings.length} warning(s)`);
  for (const w of warnings) console.log('   ' + w);
}
if (errors.length) {
  console.log(`\n✖  ${errors.length} error(s)`);
  for (const e of errors) console.log('   ' + e);
}
console.log(
  `\n${errors.length ? '✖' : '✔'}  [${GAME}]${commercial ? ' commercial release:' : ''} ${game.rooms.length} room(s), ${Object.keys(game.items).length} items, ${Object.keys(game.characters).length} characters` +
    `${assets ? '' : ' (images not checked: run npm run assets)'}${minigameIds ? '' : ' (minigames not checked)'}`,
);
process.exit(errors.length ? 1 : 0);
