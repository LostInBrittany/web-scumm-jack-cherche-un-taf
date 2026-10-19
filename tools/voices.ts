// npm run voices -- status [--lang xx] | export --lang xx [--json] | import <file> --lang xx | check [--lang xx] [--release]
// The voice production table (src/engine/tools/voices.ts): per language, every line with a stable id, who speaks it,
// its text in that language, its clip and its status (`games/<id>/voices.json`: draft, record, recorded, approved).
// `export` writes the table for the actors (CSV, or JSON), `import` brings their statuses, actors and notes back,
// `check` measures every clip with ffmpeg (duration, sample rate, codec, loudness, peak). Exit codes: `status` 0;
// `import` 1 on an unknown line or status; `check` 1 on an error (with --release, an approved line without its clip
// is one), 0 otherwise. Lines without an id are not listed: `npm run ids -- --lines` first.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyLocale } from '../src/engine/tools/i18n';
import { lineIds } from '../src/engine/core/content-ids';
import {
  clipVerdict,
  mergeSheet,
  orphanClips,
  parseCsv,
  toCsv,
  voiceTable,
  VOICE_STATUSES,
  type VoiceSheet,
} from '../src/engine/tools/voices';
import { ASSETS_DIR, GAME, GAME_DIR, loadGameModule } from './game';
import { clipFacts } from './voice-facts';
import { writeGame } from './game-write';

const game = (await loadGameModule()).game;
const [cmd, ...rest] = process.argv.slice(2);
const arg = (k: string) => {
  const i = rest.indexOf(`--${k}`);
  return i >= 0 ? rest[i + 1] : rest.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
};
const base = game.lang ?? 'en';
const SHEET = join(GAME_DIR, 'voices.json');
const sheet: VoiceSheet = existsSync(SHEET) ? JSON.parse(readFileSync(SHEET, 'utf8')) : {};
const localeDir = join(GAME_DIR, 'locales');
const langs = [
  base,
  ...(existsSync(localeDir)
    ? readdirSync(localeDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .filter((l) => l !== base)
    : []),
];
const localized = (lang: string) =>
  lang === base
    ? game
    : applyLocale(structuredClone(game), JSON.parse(readFileSync(join(localeDir, `${lang}.json`), 'utf8')));
const table = (lang: string) => voiceTable(game, sheet, lang, localized(lang));

if (cmd === 'status') {
  for (const lang of arg('lang') ? [arg('lang')!] : langs) {
    const rows = table(lang);
    const by = Object.fromEntries(VOICE_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
    const orphans = orphanClips(game, lang);
    console.log(
      `[${GAME}] ${lang}: ${rows.length} line(s) with an id — ${VOICE_STATUSES.map((s) => `${by[s]} ${s}`).join(', ')}; ${rows.filter((r) => r.file).length} with a clip${orphans.length ? `, ${orphans.length} clip(s) no line claims` : ''}`,
    );
    for (const o of orphans) console.log(`  orphan clip ${o.id} → ${o.file}`);
  }
  process.exit(0);
}

if (cmd === 'export') {
  const lang = arg('lang') ?? base;
  const rows = table(lang);
  process.stdout.write(rest.includes('--json') ? JSON.stringify(rows, null, 2) + '\n' : toCsv(rows));
  process.exit(0);
}

if (cmd === 'import') {
  const file = rest.find((a) => !a.startsWith('--') && a !== arg('lang'));
  const lang = arg('lang') ?? base;
  if (!file || !existsSync(file)) {
    console.error('usage: npm run voices -- import <file.csv|file.json> --lang xx');
    process.exit(1);
  }
  const text = readFileSync(file, 'utf8');
  const rows = file.endsWith('.json') ? (JSON.parse(text) as Record<string, string>[]) : parseCsv(text);
  const r = mergeSheet(sheet, lang, rows, new Set(lineIds(game).map((l) => l.id)));
  for (const u of r.unknown) console.log(`  ✖ no line "${u}" in the game`);
  for (const b of r.bad) console.log(`  ✖ ${b}`);
  if (r.unknown.length || r.bad.length) process.exit(1);
  await writeGame(`voices import ${lang}`, [{ file: SHEET, text: JSON.stringify(r.sheet, null, 2) + '\n' }]);
  console.log(`✔  [${GAME}] ${lang}: ${rows.length} row(s) imported into ${SHEET.replace(process.cwd() + '/', '')}`);
  process.exit(0);
}

if (cmd === 'check') {
  const release = rest.includes('--release');
  const facts = (file: string) => clipFacts(resolve(ASSETS_DIR, 'audio/voices', file));
  let errors = 0,
    warnings = 0;
  for (const lang of arg('lang') ? [arg('lang')!] : langs) {
    for (const row of table(lang)) {
      const v = clipVerdict(row, row.file ? facts(row.file) : null);
      // Without --release, an approved line still waiting for its file is a warning: production is under way.
      const errs = release ? v.errors : v.errors.filter((e) => !e.endsWith('approved without a clip'));
      const warns = release
        ? v.warnings
        : [...v.warnings, ...v.errors.filter((e) => e.endsWith('approved without a clip'))];
      for (const e of errs) console.log(`  ✖ ${lang} ${e}`);
      for (const w of warns) console.log(`  ⚠ ${lang} ${w}`);
      errors += errs.length;
      warnings += warns.length;
    }
    for (const o of orphanClips(game, lang)) {
      console.log(`  ⚠ ${lang} ${o.id}: a clip no line claims (${o.file})`);
      warnings++;
    }
  }
  console.log(`${errors ? '✖' : '✔'}  [${GAME}] voices: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(errors ? 1 : 0);
}

console.log(
  'usage: npm run voices -- status [--lang xx] | export --lang xx [--json] | import <file> --lang xx | check [--lang xx] [--release]',
);
process.exit(cmd ? 1 : 0);
