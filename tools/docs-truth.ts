// npm run docs:truth (4.1.16, plan §12): what the documentation states that the code can contradict, checked against
// the code. The schemas the docs name (a save's envelope, a `.wsrun`), every `npm run <script>` they cite, every
// `tools/…` or `scripts/…` file they name, the capabilities they call mounted (each with the line of code that makes it
// true), and the current release the READMEs give (their link and download URL name this version). Exit 1 on the first list of contradictions, with each
// one named; the counters (tests, first-visit KB, states) stay `npm run quality:baseline`'s (README metric markers).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const pkg = JSON.parse(read('package.json')) as { version: string; scripts: Record<string, string> };
/**
 * The scripts of a game made with `quest-n-click create` (cli/create.mjs): what the READMEs tell its author to run,
 * the engine's own command (`[NAME]: NAME`) among them.
 */
const createdScripts = /scripts: \{([\s\S]*?)\n\s*\},/.exec(read('cli/create.mjs'))?.[1] ?? '';
const created = new Set([
  ...[...createdScripts.matchAll(/(?:^|[\s,{])'?([\w:-]+)'?:\s*['`]/g)].map((m) => m[1]!),
  ...(/\[NAME\]:/.test(createdScripts) ? ['quest-n-click'] : []),
]);

/**
 * The documents a reader is pointed to: the READMEs, CONTRIBUTING, SECURITY, and the wiki's pages, wiki/en and wiki/fr
 * (since 4.5.0; docs/en and docs/fr are transition pages, docs/dev is the project's own record).
 */
export function documents(): string[] {
  const out = ['README.md', 'README.fr.md', 'CONTRIBUTING.md', 'SECURITY.md'];
  for (const d of ['wiki/en', 'wiki/fr'])
    for (const f of readdirSync(resolve(ROOT, d)).sort()) if (f.endsWith('.md')) out.push(`${d}/${f}`);
  return out.filter((f) => existsSync(resolve(ROOT, f)));
}

/** What the code says: the schemas it writes. */
export function facts() {
  const save = Math.max(...[...read('src/engine/core/save.ts').matchAll(/schema: (\d+)/g)].map((m) => Number(m[1])));
  const sealed = /format: 'web-scumm-speedrun',\s+schema: (\d+)/.exec(read('src/engine/tools/speedrun/envelope.ts'));
  return { version: pkg.version, saveSchema: save, wsrunSchema: Number(sealed?.[1] ?? 0) };
}

/**
 * Capabilities a document may call mounted or wired, each with the code that has to say so: a doc naming the left-hand
 * phrase while the right-hand code is missing is a contradiction.
 */
const WIRED: { says: RegExp; file: string; has: RegExp; what: string }[] = [
  {
    says: /bridge -- serve`? mounts `\/v1\/runs`|serve` monte `\/v1\/runs`|mounted by `npm run bridge -- serve`|monté par `npm run bridge -- serve`/,
    file: 'bridge/src/server.ts',
    has: /runsRoute\(/,
    what: 'the leaderboards mounted on the Bridge',
  },
  {
    says: /`\/v1\/daily`/,
    file: 'bridge/src/server.ts',
    has: /DAILY\(req\.method, path\)/,
    what: 'the daily challenge mounted on the Bridge',
  },
  {
    says: /`worldVerdict`/,
    file: 'src/engine/tools/speedrun/verify.ts',
    has: /worldVerdict\(policy, variant, evidence\)/,
    what: 'worldVerdict called by the verifier',
  },
  {
    says: /`leaderboardKey`/,
    file: 'src/engine/tools/speedrun/verify.ts',
    has: /leaderboardKey\(category\.id/,
    what: 'leaderboardKey called by the verifier',
  },
  {
    says: /`minigame\.code-wheel`/,
    file: 'src/engine/core/command-handlers.ts',
    has: /`minigame\.\$\{c\.minigame\}`/,
    what: 'the minigame result flag written',
  },
];

export interface Contradiction {
  doc: string;
  line: number;
  what: string;
}

export function check(docs = documents()): Contradiction[] {
  const f = facts();
  const out: Contradiction[] = [];
  const code = new Map<string, string>();
  const src = (p: string) => code.get(p) ?? (code.set(p, existsSync(resolve(ROOT, p)) ? read(p) : ''), code.get(p)!);
  for (const doc of docs) {
    const lines = read(doc).split('\n');
    lines.forEach((text, i) => {
      const at = (what: string) => out.push({ doc, line: i + 1, what });
      // A save's envelope written with its schema, as the docs show it.
      for (const m of text.matchAll(/\{ format, schema: (\d+)/g))
        if (Number(m[1]) !== f.saveSchema) at(`a save envelope is schema ${f.saveSchema}, the text says ${m[1]}`);
      for (const m of text.matchAll(/(?:versioned \(schema|versionnée \(schéma) (\d+)/g))
        if (Number(m[1]) !== f.saveSchema) at(`a save envelope is schema ${f.saveSchema}, the text says ${m[1]}`);
      for (const m of text.matchAll(/(?:Schema|Schéma) (\d+)(?: since| depuis) [\d.]+ \(`SpeedrunEnvelope/g))
        if (Number(m[1]) !== f.wsrunSchema) at(`a .wsrun is schema ${f.wsrunSchema}, the text says ${m[1]}`);
      // Every script a reader is told to run (a family, `npm run field:*`, and a placeholder, `npm run -s <script>`,
      // name none).
      for (const m of text.matchAll(/npm run (?:-s |--silent )?([\w:.-]+)(\*?)/g)) {
        if (m[2] || m[1]!.startsWith('-')) continue;
        const name = m[1]!.replace(/[.:]+$/, '');
        if (!(name in pkg.scripts) && !created.has(name))
          at(`\`npm run ${name}\`: no such script in package.json nor in a created game's`);
      }
      // Every tool or script file named.
      for (const m of text.matchAll(/`((?:tools|scripts)\/[\w./-]+\.(?:ts|mjs|js|py|sh))`/g))
        if (!existsSync(resolve(ROOT, m[1]!))) at(`\`${m[1]}\`: no such file`);
      for (const w of WIRED) if (w.says.test(text) && !w.has.test(src(w.file))) at(`${w.what}: not in ${w.file}`);
    });
  }
  // The current release: no release link newer than this version, and the "current release" link and the download
  // URL the READMEs give name exactly this version. One exception (4.2.0-rc, the passes' campaign): while the version
  // is only a release candidate, the download URL names its `v<version>-rc.N` release and "current release" may still
  // name the last published one, older; never a newer one, never another version's archive.
  for (const doc of ['README.md', 'README.fr.md']) out.push(...releaseContradictions(doc, read(doc), f.version));
  return out;
}

/** What a README says of the current release that the package contradicts (`version`): see `check`. */
export function releaseContradictions(doc: string, t: string, version: string): Contradiction[] {
  const out: Contradiction[] = [];
  for (const m of t.matchAll(/releases\/tag\/v(\d+\.\d+\.\d+)/g))
    if (newer(m[1]!, version))
      out.push({ doc, line: lineOf(t, m.index ?? 0), what: `links release v${m[1]}, newer than ${version}` });
  // Every download URL, whatever its tag and file (second reading of #124): its tag must be `v<version>` or
  // `v<version>-rc.N` (N from 1, no leading zero), its archive this version's.
  const downloads = [...t.matchAll(/releases\/download\/(v[^/\s)]+)\/([^\s)]*)/g)].map((m) => {
    const tag = /^v(\d+\.\d+\.\d+)(-rc\.[1-9]\d*)?$/.exec(m[1]!);
    // The engine's archive of that version: `quest-n-click-<v>.tgz` from 4.2.5 (D47), `web-scumm-<v>.tgz` before.
    const file = /^(quest-n-click|web-scumm)-(\d+\.\d+\.\d+)\.tgz$/.exec(m[2]!);
    const named = file && file[1] === archiveOf(file[2]!) ? file[2]! : m[2]!;
    return { at: m.index ?? 0, raw: m[1]!, version: tag?.[1], rc: tag?.[2], file: named };
  });
  const candidate = downloads.length > 0 && downloads.every((d) => d.version === version && d.rc);
  for (const d of downloads)
    if (d.version !== version)
      out.push({
        doc,
        line: lineOf(t, d.at),
        what: d.version
          ? `names ${d.raw} as the current release, the package is ${version}`
          : `names ${d.raw}, neither v${version} nor a v${version}-rc.N release`,
      });
    else if (d.file !== version)
      out.push({
        doc,
        line: lineOf(t, d.at),
        what: `downloads ${d.file} from ${d.raw}, not ${archiveOf(version)}-${version}.tgz`,
      });
  for (const m of t.matchAll(/(?:Current release|Release actuelle) ?: \[v(\d+\.\d+\.\d+)/g))
    if (m[1] !== version && !(candidate && newer(version, m[1]!)))
      out.push({
        doc,
        line: lineOf(t, m.index ?? 0),
        what: `names v${m[1]} as the current release, the package is ${version}${candidate ? '' : ' (an older one only while the install names a release candidate of it)'}`,
      });
  return out;
}

const parts = (v: string) => v.split('.').map(Number);
/** The name the engine's archive of a version starts with: quest-n-click from 4.2.5 (D47), web-scumm before. */
const archiveOf = (v: string) => (newer('4.2.5', v) ? 'web-scumm' : 'quest-n-click');
function newer(a: string, b: string): boolean {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}
const lineOf = (t: string, i: number) => t.slice(0, i).split('\n').length;

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const bad = check();
  const f = facts();
  if (bad.length) {
    for (const b of bad) console.error(`✖  ${b.doc}:${b.line}: ${b.what}`);
    process.exit(1);
  }
  console.log(
    `✔  docs:truth: ${documents().length} documents agree with the code (version ${f.version}, saves schema ${f.saveSchema}, .wsrun schema ${f.wsrunSchema}, scripts, files, ${WIRED.length} wired capabilities)`,
  );
}
