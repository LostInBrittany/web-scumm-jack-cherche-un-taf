#!/usr/bin/env node
// quest-n-click create <folder> ["Title"] [--engine=<npm spec>] (3.9), also `npm init @quest-n-click <folder>`: a
// game project from the engine's template. The folder gets game/ (the template: one room, a hero, placeholder art drawn
// from shapes), a package.json whose scripts call the engine's command, a tsconfig.json whose `@engine` points into the
// installed package, and a .gitignore. Then: cd <folder> && npm install && npm run dev.
// The engine's name is the package's own (4.2.5, D47): `@quest-n-click/engine` since 4.5.2 (D53), `quest-n-click`
// before (its former name's alias, `web-scumm`, made projects under the old names through 4.2.x); `quest-n-click
// migrate` moves a project off either. The command keeps its name, `quest-n-click`, whatever the package's.
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { name: PACKAGE, version } = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
/** The engine's command (its package's `bin`), which the project's scripts call. */
const NAME = 'quest-n-click';
const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const [folder, ...words] = args.filter((a) => !a.startsWith('--'));
if (!folder) {
  console.error(`usage: ${NAME} create <folder> ["Title"] [--engine=<npm spec>]`);
  process.exit(2);
}
const dir = resolve(folder);
const id =
  basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^[^a-z]+/, '') || 'game';
const title = words.join(' ') || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
if (existsSync(dir) && readdirSync(dir).length) {
  console.error(`${folder} exists and is not empty`);
  process.exit(1);
}

// The template's tests/ is this repository's (vitest, `npm run check`); a project checks its game with `quest-n-click verify`.
cpSync(join(PKG, 'games', '_template'), join(dir, 'game'), {
  recursive: true,
  filter: (src) => !src.includes(`${join('_template', 'tests')}`),
});
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|json|md)$/.test(e))
      writeFileSync(
        p,
        readFileSync(p, 'utf8')
          .replace(/__ID__/g, id)
          .replace(/__TITLE__/g, title)
          .replace(/(['"])@quest-n-click\/engine\//g, `$1${PACKAGE}/`),
      );
  }
};
walk(join(dir, 'game'));
// The template's art is a placeholder drawn from shapes (tools/placeholder-art.py): provenance says so, and a release
// refuses it until each file is replaced and reviewed (quest-n-click provenance --lock).
writeFileSync(
  join(dir, 'game', 'provenance.json'),
  JSON.stringify(
    {
      licences: { allow: ['CC BY 4.0', 'CC0 1.0'] },
      assets: [
        {
          match: 'img:*',
          source:
            "Placeholder drawn from shapes by tools/placeholder-art.py (quest'n'click template): replace before a release",
          author: "quest'n'click",
          licence: 'CC0 1.0',
          status: 'placeholder',
        },
      ],
    },
    null,
    2,
  ) + '\n',
);

// The page's icons, its preview image and the full font the engine falls back to: the project's public/ (Vite serves it).
for (const f of ['icons', 'og.png', 'fonts'])
  if (existsSync(join(PKG, 'public', f))) cpSync(join(PKG, 'public', f), join(dir, 'public', f), { recursive: true });

const engine = opt('engine') ?? `^${version}`;
writeFileSync(
  join(dir, 'package.json'),
  JSON.stringify(
    {
      name: id,
      private: true,
      version: '0.1.0',
      type: 'module',
      config: { game: id },
      scripts: {
        dev: `${NAME} dev`,
        studio: `${NAME} studio`,
        assets: `${NAME} assets`,
        verify: `${NAME} verify`,
        build: `${NAME} build`,
        release: `${NAME} release`,
        preview: `${NAME} preview`,
        [NAME]: NAME,
      },
      dependencies: { [PACKAGE]: engine },
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  join(dir, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        strict: true,
        skipLibCheck: true,
        isolatedModules: true,
        noEmit: true,
        resolveJsonModule: true,
        // Relative to this file, no `baseUrl` (removed by TypeScript 7, 4.1.8).
        paths: {
          '@engine/*': [`./node_modules/${PACKAGE}/src/engine/*`],
          [`${PACKAGE}/*`]: [`./node_modules/${PACKAGE}/src/engine/api/*`],
          '@game': ['./game/index.ts'],
          '@game/*': ['./game/*'],
        },
        types: ['vite/client', 'node'],
      },
      include: ['game', `node_modules/${PACKAGE}/src/env.d.ts`],
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(join(dir, '.gitignore'), 'node_modules\ndist\n.cache\npublic/assets\n');
writeFileSync(
  join(dir, 'README.md'),
  `# ${title}\n\nA point-and-click game made with [quest'n'click](https://github.com/Quest-n-Click/quest-n-click).\n\n\`\`\`bash\nnpm install\nnpm run assets   # art and audio into public/assets (Python 3 with Pillow)\nnpm run dev      # open the URL, landscape; ?edit=start places things\nnpm run verify   # the content checked, the solver finds the end\nnpm run build    # dist/, every file accounted for, licences inside\n\`\`\`\n\nThe game is in \`game/\`: rooms, characters, items, rules. The art in \`game/art\` is a placeholder; a release refuses it\nuntil it is replaced and reviewed (\`npx ${NAME} provenance --lock\`).\n\nThe documentation is the wiki, in English and in French, https://github.com/Quest-n-Click/quest-n-click/wiki: start with\nhttps://github.com/Quest-n-Click/quest-n-click/wiki/EN-Create-Project-Layout for this project's files, and\nhttps://github.com/Quest-n-Click/quest-n-click/wiki/EN-Create-Working-Loop for the commands above.\n`,
);
console.log(
  `${folder}: "${title}" created (${PACKAGE} ${engine}).\nNext:\n  cd ${folder}\n  npm install\n  npm run assets && npm run dev`,
);
