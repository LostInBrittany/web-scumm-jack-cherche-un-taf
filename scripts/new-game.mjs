// Scaffolds games/<id> from games/_template and makes it the current game.
// Usage: npm run new-game <id> ["Working title"]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [id, ...rest] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('usage: npm run new-game <id> ["Title"]   (id: lowercase letters, digits, dashes)');
  process.exit(1);
}
const title = rest.join(' ') || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const dir = join('games', id);
if (existsSync(dir)) {
  console.error(`${dir} already exists`);
  process.exit(1);
}

cpSync('games/_template', dir, { recursive: true });
// Placeholder art so the game runs right away, drawn from shapes for the template (tools/placeholder-art.py): a
// backdrop, a cat-shaped hero, interface icons, two items. Provenance says each is a placeholder, so it is never shipped
// by mistake (npm run validate -- --release fails on every placeholder, on an asset no entry covers, on a licence
// outside `licences.allow`, and without a provenance.lock.json: npm run provenance -- --lock once the art is reviewed).
const placeholder = {
  source:
    "Placeholder drawn from shapes by tools/placeholder-art.py (quest'n'click template): replace before a release",
  author: "quest'n'click",
  licence: 'CC0 1.0',
  status: 'placeholder',
};
writeFileSync(
  join(dir, 'provenance.json'),
  JSON.stringify(
    { licences: { allow: ['CC BY 4.0', 'CC0 1.0'] }, assets: [{ match: 'img:*', ...placeholder }] },
    null,
    2,
  ) + '\n',
);

const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|json|md)$/.test(e))
      writeFileSync(
        p,
        readFileSync(p, 'utf8')
          .replace(/__ID__/g, id)
          .replace(/__TITLE__/g, title),
      );
  }
};
walk(dir);

// The current game is a link in .cache (tools/select-game.ts), never a change to package.json (4.1.6).
execFileSync('npx', ['tsx', 'tools/select-game.ts'], { stdio: 'inherit', env: { ...process.env, GAME: id } });

console.log(`games/${id} created ("${title}") and set as the current game.
Next:
  npm run assets      # prepare the placeholder art
  npm run validate && npm run solve
  (provenance.json lists the borrowed placeholder art: add an entry for each asset you make)
  npm run dev         # then open the URL on your phone, landscape; ?edit=start to place things
Write the story in games/${id}/storyboard.json, rooms in games/${id}/rooms/, characters in cast.ts. See https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Create-Principles.`);
