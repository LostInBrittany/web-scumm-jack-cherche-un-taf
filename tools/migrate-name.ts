// The project's former names in a game project: `quest-n-click migrate` rewrites what still says `web-scumm` (4.3.0,
// D47, now that its aliases are gone) or the unscoped `quest-n-click` of the packages (4.5.2, D53: the packages are
// `@quest-n-click/engine`, `@quest-n-click/bridge`… under the npm organisation's scope). A module of its own, so a
// test reads it (tools/migrate.ts runs at import), and the Studio Server's engine upgrade renames a hosted game's
// imports with it (studio-server/src/worker). Only the names of the packages, their imports and the former commands
// move: a format identifier (`web-scumm-save`, the `WEB_SCUMM_*` variables, the storage keys) has no `/` after it and
// is not a command, so it stays as it is; the commands of 4.2.5 and after (`quest-n-click`, `quest-n-click-bridge`…)
// keep their names (D53), and so does a bare `'quest-n-click'` (a command in a script, never an import).
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Each package of the engine by its unscoped name (4.2.5 to 4.5.1) and its name since 4.5.2 (D53). */
export const UNSCOPED_PACKAGES: Record<string, string> = {
  'quest-n-click': '@quest-n-click/engine',
  'create-quest-n-click': '@quest-n-click/create',
  'quest-n-click-bridge': '@quest-n-click/bridge',
  'quest-n-click-connectors': '@quest-n-click/connectors',
  'quest-n-click-studio-server': '@quest-n-click/studio-server',
};

/** Each package by its former name (through 4.2.x) and its name now (D47, then D53). */
export const FORMER_PACKAGES: Record<string, string> = {
  'web-scumm': '@quest-n-click/engine',
  'create-web-scumm': '@quest-n-click/create',
  'web-scumm-bridge': '@quest-n-click/bridge',
  'web-scumm-connectors': '@quest-n-click/connectors',
  'web-scumm-studio-server': '@quest-n-click/studio-server',
};

/** Every former name of a package (web-scumm's, then the unscoped ones) and its name now. */
const RENAMED: Record<string, string> = { ...FORMER_PACKAGES, ...UNSCOPED_PACKAGES };

/**
 * An import of a package that can be imported by a path (`web-scumm/content`, `quest-n-click/testing`,
 * `quest-n-click-bridge/cli`), in either quote style: the quote, the former name, the `/` after it. `create-…` has
 * nothing to import. `@quest-n-click/engine/…` never matches: a quote comes before the name, never a `@`.
 */
const IMPORT = /(['"])(web-scumm|quest-n-click)(-bridge|-connectors|-studio-server)?\//g;
const now = (base: string, suffix = '') => RENAMED[`${base}${suffix}`] ?? `${base}${suffix}`;

/** A source file's text with its former imports (`web-scumm/…`, `quest-n-click/…`) renamed, or null when it has none. */
export function renameImports(text: string): string | null {
  const next = text.replace(IMPORT, (_, q: string, base: string, suffix?: string) => `${q}${now(base, suffix)}/`);
  return next === text ? null : next;
}

/**
 * tsconfig.json: the `web-scumm/*` and `quest-n-click/*` paths and the `node_modules/web-scumm/…` and
 * `node_modules/quest-n-click/…` targets and includes (`./node_modules/…` or `node_modules/…`), to the scoped engine.
 */
export function renameTsconfig(text: string): string | null {
  const next = text.replace(
    /(['"]|node_modules\/)(web-scumm|quest-n-click)(-bridge|-connectors|-studio-server)?\//g,
    (_, before: string, base: string, suffix?: string) => `${before}${now(base, suffix)}/`,
  );
  return next === text ? null : next;
}

/** The former commands in a script line: `web-scumm dev`, `web-scumm-bridge serve`, `npx create-web-scumm`. */
const COMMAND = /(?<![\w./@-])(create-)?web-scumm(-bridge|-connectors?|-studio-server|-studio-worker)?(?![\w.@/-])/g;

export interface RenamedPackage {
  /** The new text, or null when nothing is to change. */
  text: string | null;
  /** What the author still does by hand: a former package the project depends on whose new name it lacks. */
  todo: string[];
}

/**
 * package.json: the former commands (`web-scumm …`) and a script named after the command; a dependency on a former
 * package (`web-scumm…`, or the unscoped `quest-n-click…` of 4.5.1 and before) dropped when its scoped name is there too
 * (`npm install` then prunes it), otherwise said, never guessed (its spec names an archive or a version of the old
 * package). A `web-scumm` script beside a `quest-n-click` one is left as it is and said. The file keeps its indentation
 * (tabs or spaces) and its byte order mark.
 */
export function renamePackageJson(text: string): RenamedPackage {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = text.slice(bom.length);
  const indent = /^[ \t]+(?=")/m.exec(body)?.[0] ?? 2;
  const pkg = JSON.parse(body) as Record<string, unknown> & {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const todo: string[] = [];
  if (pkg.scripts) {
    const both = 'web-scumm' in pkg.scripts && 'quest-n-click' in pkg.scripts;
    if (both)
      todo.push('package.json has both a web-scumm and a quest-n-click script: the web-scumm one is left as it is');
    pkg.scripts = Object.fromEntries(
      Object.entries(pkg.scripts).map(([k, v]) =>
        both && k === 'web-scumm'
          ? [k, v]
          : [k === 'web-scumm' ? 'quest-n-click' : k, String(v).replace(COMMAND, '$1quest-n-click$2')],
      ),
    );
  }
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [old, scoped] of Object.entries(RENAMED))
      if (old in deps) {
        if (scoped in all) delete deps[old];
        else todo.push(`package.json depends on ${old}: npm uninstall ${old} && npm install ${scoped}`);
      }
  }
  const next = `${bom}${JSON.stringify(pkg, null, indent)}\n`;
  return { text: JSON.stringify(JSON.parse(body)) === JSON.stringify(pkg) ? null : next, todo };
}

/** The folders of a project the rename never enters: dependencies, builds, caches, the built assets, anything hidden. */
const SKIP = new Set(['node_modules', 'dist', 'public']);
const SOURCE = /\.(?:[cm]?[jt]s|tsx|jsx)$/;

/**
 * Every source file of a project (`/` paths), its folders above left out. A symbolic link is followed when it leads
 * inside the project (each file once, by its first path); one that leads outside, or nowhere, is named in `todo`
 * (renaming another folder's files is not this command's), so `--check` never calls such a project clean.
 */
export function sourcesIn(dir: string, todo: string[] = []): string[] {
  const out: string[] = [];
  const root = realpathSync(dir);
  const seen = new Set<string>();
  const inside = (real: string) => real === root || real.startsWith(root + sep);
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith('.') || SKIP.has(name)) continue;
      const p = join(d, name);
      const rel = relative(dir, p).split(sep).join('/');
      let real: string;
      try {
        real = realpathSync(p);
      } catch {
        todo.push(`${rel}: a symbolic link that leads nowhere, not renamed`);
        continue;
      }
      if (lstatSync(p).isSymbolicLink() && !inside(real)) {
        todo.push(`${rel}: a symbolic link out of the project, not renamed (rename what it leads to by hand)`);
        continue;
      }
      if (seen.has(real)) continue;
      seen.add(real);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile() && SOURCE.test(name)) out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * The former name in a game project (`dir`): its sources' imports, its tsconfig.json, its package.json. `write`: the
 * files rewritten, otherwise only named. Returns the files that change (`/` paths) and what is left to the author.
 */
export function renameProject(dir: string, o: { write: boolean }): { files: string[]; todo: string[] } {
  const files: string[] = [];
  const todo: string[] = [];
  const change = (path: string, next: string | null) => {
    if (next === null) return;
    files.push(path);
    if (o.write) writeFileSync(join(dir, path), next);
  };
  for (const f of sourcesIn(dir, todo)) change(f, renameImports(readFileSync(join(dir, f), 'utf8')));
  if (existsSync(join(dir, 'tsconfig.json')))
    change('tsconfig.json', renameTsconfig(readFileSync(join(dir, 'tsconfig.json'), 'utf8')));
  if (existsSync(join(dir, 'package.json'))) {
    const r = renamePackageJson(readFileSync(join(dir, 'package.json'), 'utf8'));
    change('package.json', r.text);
    todo.push(...r.todo);
  }
  return { files, todo };
}
