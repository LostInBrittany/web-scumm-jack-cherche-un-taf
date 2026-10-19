// npm run ids [-- --write] [--map] [--lines | --lines=all]
// Gives the current game's rules, topics, listeners, choices, once/nth/cycle/random blocks and script steps their
// stable ids (schema v3). Without flags: a dry run that prints what would be written and what must be done by hand.
// --write: edits games/<id>/rooms/*.ts, rules.ts and game.ts in place (quotes and indentation kept), and renames the
//          keys of games/<id>/locales/*.json to the id-based paths.
// --map:   writes games/<id>/ids.migration.json (the `renameSeen` / `renameCounter` step for `migrations`) and
//          games/<id>/ids.paths.json (old translation path → new), and prints the three manual steps.
// --lines: also give every `say` / `toast` / `guide` object, every `{ id, text }` line of a list (looks, hints,
//          fallback answers), every hint and every reaction by kind a stable id (translations and voice clips follow
//          it); --lines=all first turns every plain string line into `{ say: ['hero', text], id }` and every plain
//          string of a list into `{ id, text }` (verbose, for a game that voices or translates every line). Without
//          it, lines stay keyed by their position inside their owner.
// The game: GAME, else package.json → config.game (tools/game.ts). Safe to run again: nothing is renamed twice.
import { join, relative } from 'node:path';
import { GAME, GAME_DIR, WORK, loadGameModule } from './game';
import { planIds } from './ids/plan';
import { writeGame } from './game-write';

const write = process.argv.includes('--write');
const wantMap = process.argv.includes('--map');
const linesArg = process.argv.find((a) => a === '--lines' || a.startsWith('--lines='));
const lines = linesArg === '--lines=all' ? ('all' as const) : linesArg ? true : false;
const { game } = await loadGameModule();
const plan = planIds(GAME_DIR, game, { lines, write, map: wantMap });
const { results, map, added } = plan;

const rel = (f: string) => relative(WORK, f);
for (const u of plan.unknownRooms) console.log(`  ${rel(u.file)}: no room of the game has id "${u.id}" (skipped)`);
const gameFile = join(GAME_DIR, 'game.ts');

let inserted = 0,
  skipped = 0;
for (const { file, r } of results) {
  if (!r.inserted.length && !r.skipped.length) continue;
  console.log(
    `${rel(file)}: ${r.inserted.length} id(s)${r.skipped.length ? `, ${r.skipped.length} to do by hand` : ''}`,
  );
  for (const s of r.skipped)
    console.log(`  ✖ line ${s.line} ${s.path}: ${s.reason}${s.expected ? ` → write id: '${s.expected}'` : ''}`);
  inserted += r.inserted.length;
  skipped += r.skipped.length;
}
console.log(
  `\n[${GAME}] ${added} id(s) assigned in memory, ${inserted} written to the sources${write ? '' : ' (dry run: add --write)'}, ${skipped} skipped${game.schemaVersion === 3 ? '' : '; the game is still schema 2'}`,
);

// Every file of the run, written as one operation of the game's journal at the end (tools/game-write.ts).
const out: { file: string; text: string }[] = [];
if (write) {
  for (const { file, r } of results) if (r.inserted.length) out.push({ file, text: r.code });
  for (const l of plan.locales) {
    out.push({ file: l.file, text: l.text });
    console.log(`${rel(l.file)}: ${l.moved} path(s) renamed to ids`);
  }
}

if (wantMap) {
  out.push(...plan.maps);
  console.log(
    `\nTo write: ${rel(join(GAME_DIR, 'ids.migration.json'))} (${Object.keys(map.seen).length} seen, ${Object.keys(map.counters).length} counter keys), ${rel(join(GAME_DIR, 'ids.paths.json'))} (${Object.keys(map.paths).length} paths)`,
  );
}

const keysMoved = Object.keys(map.seen).length + Object.keys(map.counters).length > 0;
if (!write || (wantMap && keysMoved) || game.schemaVersion !== 3) {
  console.log(`\nTo finish by hand in ${rel(gameFile)}:`);
  console.log(`  1. schemaVersion: 3`);
  console.log(`  2. saveVersion: ${game.saveVersion + 1}`);
  console.log(
    `  3. migrations: [...(migrations ?? []), idsMigration]   // import idsMigration from './ids.migration.json' (npm run ids -- --map)`,
  );
  console.log(`Then: npm run validate && npm run i18n -- extract && npm run solve`);
}

const written = await writeGame('ids', out, { guard: false });
if (out.length) console.log(`Written as one operation of the journal: ${written.length} file(s) changed`);
