// quest-n-click migrate (3.9): brings the game's sources to the authoring schema of the installed engine. The schema is
// `schemaVersion` in defineGame (wiki/en/install.upgrade.md, wiki/en/start.stability.md): 3 is the current one. A game on 3 has
// nothing to do; an older game gets its stable ids written (`npm run ids -- --write --map`) and the steps left to do
// by hand are printed. 4.3.0: first, a project still under the former name (D47) has its `web-scumm/…` imports, its
// tsconfig.json and its package.json's commands renamed (tools/migrate-name.ts); 4.5.2 (D53): so are the unscoped
// `quest-n-click/…` imports and dependencies, to `@quest-n-click/engine`. `--check`: exit 1 when a migration is due,
// write nothing.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME, loadGameModule, PROJECT } from './game';
import { renameProject } from './migrate-name';
import { tsconfigWithoutBaseUrl } from './migrate-tsconfig';

export const CURRENT_SCHEMA = 3;

// The project's own tsconfig (project mode, 3.9): brought to what TypeScript 7 accepts, whatever the schema says.
const tsconfig = PROJECT ? resolve(PROJECT, 'tsconfig.json') : null;
if (tsconfig && existsSync(tsconfig)) {
  const next = tsconfigWithoutBaseUrl(readFileSync(tsconfig, 'utf8'));
  if (next && process.argv.includes('--check')) {
    console.error(
      `✖  tsconfig.json has \`baseUrl\`, which TypeScript 7 refuses: a migration is due (quest-n-click migrate)`,
    );
    process.exit(1);
  }
  if (next) {
    writeFileSync(tsconfig, next);
    console.log(
      '✔  tsconfig.json: `baseUrl` removed, its `paths` made relative (TypeScript 7, 4.1.8); a comment it had is not kept',
    );
  }
}
// The former names (4.3.0, D47; 4.5.2, D53): a project of 4.2.x or before has its imports and commands renamed, one of
// 4.5.1 or before its imports and dependencies, before its game is loaded; then this runs again in a new process, which reads the renamed tsconfig.json.
if (PROJECT) {
  const check = process.argv.includes('--check');
  const r = renameProject(PROJECT, { write: !check });
  for (const t of r.todo) console.error(`✖  ${t}`);
  if (r.files.length && check) {
    console.error(
      `✖  still under a former name (web-scumm, or the unscoped quest-n-click): ${r.files.join(', ')} (quest-n-click migrate renames them)`,
    );
    process.exit(1);
  }
  if (r.files.length) {
    console.log(`✔  the former names renamed @quest-n-click/… in ${r.files.join(', ')} (then: npm install)`);
    const again = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      stdio: 'inherit',
      env: process.env,
    });
    process.exit(again.status ?? 1);
  }
  if (r.todo.length && check) process.exit(1);
}
const { game } = await loadGameModule();
const at = game.schemaVersion ?? 2;
if (at === CURRENT_SCHEMA) {
  console.log(`✔  [${GAME}] authoring schema ${at}: up to date with this engine`);
  process.exit(0);
}
if (at > CURRENT_SCHEMA) {
  console.error(
    `✖  [${GAME}] authoring schema ${at} is newer than this engine's (${CURRENT_SCHEMA}): install a newer quest-n-click`,
  );
  process.exit(1);
}
if (process.argv.includes('--check')) {
  console.error(`✖  [${GAME}] authoring schema ${at}: a migration to ${CURRENT_SCHEMA} is due (quest-n-click migrate)`);
  process.exit(1);
}
console.log(
  `[${GAME}] authoring schema ${at} → ${CURRENT_SCHEMA}: writing stable ids (https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Install-Upgrade)`,
);
const r = spawnSync(
  process.execPath,
  [...process.execArgv, resolve(import.meta.dirname, 'ids.ts'), '--write', '--map'],
  { stdio: 'inherit', env: process.env },
);
process.exit(r.status ?? 1);
