// npm run test:mutation:core [-- --set=core|reality|all] [--file=src/engine/core/cond.ts] [--fresh] [--hash] (4.1.0 "Clarity",
// lot G; the sets and the gate by identity since 4.1.2): mutation testing of what a save, a session, a condition and
// a migration rest on (`core`), and of what a signal from the world outside rests on (`reality`: the engine's
// receive, the protocol, the client, the Bridge, its store, its lock and its policy). Each mutant changes one thing
// in the source (a comparison flipped, `&&` for `||`, a negation dropped, a condition forced, a boolean inverted),
// the tests that judge that set run against it (vitest.mutation.config.ts, `MUTATION_SET`), and the mutant must
// make one of them fail. A mutant that survives is a missing test, or an equivalent mutant: docs/dev/mutants.json
// names each one (file, operator, from, to) with its reason, docs/dev/MUTANTS.md explains them, and any survivor
// not named there fails the run, whatever the count. The source file is restored after each mutant, and on exit. (Stryker 10 does not activate its mutants under Vitest 5 here: 739 of 749
// survived, a block emptied included; this tool runs each mutant as plain source.)
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from '@typescript/typescript6';
import { ROOT } from './game';
import { SETS, SHARDS, setNamed, setsOf, TESTS, type MutationSet } from './mutation-sets';
import { mergeReports, type ShardReport, shardFiles } from './mutation-shards';

export { SETS, type MutationSet };
export const TARGETS = SETS.core;

/**
 * The hash of everything a run's verdict depends on (4.1.8): the set's sources and tests, the two configurations,
 * this tool, the named survivors, the lockfile. A report whose `inputHash` is the current one says what a new run
 * would say: the release reuses it instead of running the set again (`--reuse`, the default; `--fresh` runs anyway).
 * A commit that changes none of these (docs, a release's version) keeps the hash, so the key is not the commit.
 */
export function inputHash(set: MutationSet | 'all'): string {
  const roots = new Set<string>([
    'tools/mutate.ts',
    'tools/mutation-sets.ts',
    'vitest.mutation.config.ts',
    'vite.config.ts',
    'tsconfig.json',
    'docs/dev/mutants.json',
  ]);
  for (const k of setsOf(set)) {
    for (const f of SETS[k]) roots.add(f);
    for (const g of TESTS[k]) for (const f of expand(g)) roots.add(f);
  }
  // Everything the tests and the sources import, statically, inside the repository (4.1.8, the second reading): a
  // change in `engine.ts` or in the Bridge's server can turn a killed mutant of the set into a survivor, so it is an
  // input of the verdict even though it is not mutated.
  const files = importClosure([...roots]);
  const h = createHash('sha256');
  for (const f of [...files].sort()) {
    h.update(f);
    h.update('\0');
    h.update(existsSync(resolve(ROOT, f)) ? readFileSync(resolve(ROOT, f)) : 'missing');
    h.update('\0');
  }
  // The lockfile says which dependencies the tests ran with; its own `version` fields move with every release and
  // say nothing of the verdict, so they are left out (a version bump keeps the hash).
  const lock = JSON.parse(readFileSync(resolve(ROOT, 'package-lock.json'), 'utf8')) as {
    version?: string;
    packages?: Record<string, { version?: string }>;
  };
  delete lock.version;
  if (lock.packages?.['']) delete lock.packages[''].version;
  h.update('package-lock.json\0');
  h.update(JSON.stringify(lock));
  return h.digest('hex').slice(0, 16);
}

/** The repository files reachable from `files` through static imports (`from '…'`, `import('…')`), themselves included. */
export function importClosure(files: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...files];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f) || !existsSync(resolve(ROOT, f))) continue;
    seen.add(f);
    if (!/\.(ts|mts|mjs|js)$/.test(f)) continue;
    const src = readFileSync(resolve(ROOT, f), 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const target = resolveImport(f, m[1]!);
      if (target) queue.push(target);
    }
  }
  return seen;
}

/**
 * A specifier of the repository (`@engine/*`, `@quest-n-click/engine/*`, a relative path) as a file, or null for a
 * package.
 */
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  const API = '@quest-n-click/engine/';
  if (spec.startsWith('@engine/')) base = `src/engine/${spec.slice('@engine/'.length)}`;
  else if (spec.startsWith(API)) base = `src/engine/api/${spec.slice(API.length)}`;
  else if (spec.startsWith('.')) base = relative(ROOT, resolve(ROOT, dirname(from), spec)).replace(/\\/g, '/');
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.mts`, `${base}.mjs`, `${base}.js`, `${base}/index.ts`])
    if (existsSync(resolve(ROOT, c)) && !c.endsWith('/')) {
      try {
        if (readFileSync(resolve(ROOT, c)).length >= 0 && !isDir(resolve(ROOT, c))) return c;
      } catch {
        /* a folder */
      }
    }
  return null;
}
const isDir = (p: string) => {
  try {
    return readdirSync(p) !== undefined;
  } catch {
    return false;
  }
};

/** The files a vitest `include` glob of the form `dir/prefix-*.test.ts` names (one `*`, in the file name). */
function expand(glob: string): string[] {
  if (!glob.includes('*')) return [glob];
  const dir = dirname(glob);
  const re = new RegExp(
    `^${glob
      .slice(dir.length + 1)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')}$`,
  );
  return readdirSync(resolve(ROOT, dir))
    .filter((f) => re.test(f))
    .map((f) => `${dir}/${f}`)
    .sort();
}

/** What a run writes (4.1.8): the set, its input hash, the commit, the verdict, and every mutant's fate. */
export interface MutationReport {
  v: 1;
  set: MutationSet | 'all' | 'file';
  inputHash: string;
  commitSha: string;
  at: string;
  status: 'passed' | 'failed';
  killed: number;
  total: number;
  results: (Omit<Mutant, 'start' | 'end'> & { status: string })[];
}

/** The named survivors as a Markdown table, what `--doc` writes into docs/dev/MUTANTS.md between its markers. */
export function survivorsTable(known: KnownSurvivor[]): string {
  const rows = [...known]
    .sort((a, b) => a.file.localeCompare(b.file) || a.from.localeCompare(b.from))
    .map(
      (k) =>
        `| \`${k.file}\`${k.context ? ` (\`${k.context.replace(/\|/g, '\\|')}\`)` : ''} | \`${k.operator}\`: \`${k.from}\` → \`${k.to}\` | ${k.category}${k.proof === 'argument' ? '' : `, \`${k.proof}\``} | ${k.why} |`,
    );
  return `| Where | Mutant | Kind | Why |\n|---|---|---|---|\n${rows.join('\n')}\n`;
}
export const DOC_MARKERS = ['<!-- mutants:start -->', '<!-- mutants:end -->'] as const;
/** MUTANTS.md with the table of docs/dev/mutants.json between its markers (the text outside them is the author's). */
export function withSurvivorsTable(doc: string, known: KnownSurvivor[]): string {
  const [a, b] = DOC_MARKERS;
  const i = doc.indexOf(a);
  const j = doc.indexOf(b);
  if (i < 0 || j < 0 || j < i) throw new Error(`MUTANTS.md: the markers ${a} … ${b} are missing`);
  return `${doc.slice(0, i + a.length)}\n${known.length} named in \`docs/dev/mutants.json\` (generated by \`npm run test:mutation:core -- --doc\`; the gate reads the JSON, this table says it):\n\n${survivorsTable(known)}${doc.slice(j)}`;
}

const commitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

/** A report of this set (or of this shard of it) with the current inputs, if one is there. */
export function reusableReport(
  set: MutationSet | 'all',
  hash: string,
  shard?: ShardReport['shard'],
): MutationReport | null {
  const file = resolve(ROOT, `.cache/mutation/${reportName(set, shard)}.json`);
  if (!existsSync(file)) return null;
  try {
    const r = JSON.parse(readFileSync(file, 'utf8')) as Partial<ShardReport>;
    return r.v === 1 &&
      r.inputHash === hash &&
      r.status === 'passed' &&
      Array.isArray(r.results) &&
      r.shard?.inputHash === shard?.inputHash
      ? (r as MutationReport)
      : null;
  } catch {
    return null;
  }
}

/** A report's file name in .cache/mutation: the set's, or one shard's (`report-<set>.shard-<i>of<n>`). */
export const reportName = (set: string, shard?: { index: number; total: number }) =>
  shard ? `report-${set}.shard-${shard.index}of${shard.total}` : `report-${set}`;

/** The cut of a set into `n` shards, by the mutants each of its files holds now (4.1.20 PR 2a). */
export function cutOf(set: MutationSet, n: number): string[][] {
  return shardFiles(SETS[set], n, (f) => mutants(f, readFileSync(resolve(ROOT, f), 'utf8')).length);
}
/** The shards a set runs in: SHARDS, never more than its files. */
export const shardsOf = (set: MutationSet) => Math.min(SHARDS[set] ?? 1, SETS[set].length);

/** An equivalent mutant, as docs/dev/mutants.json names it: the line may move, the edit itself may not. */
export interface KnownSurvivor {
  file: string;
  operator: string;
  from: string;
  to: string;
  why: string;
  /**
   * The source line the mutant sits on, trimmed (4.1.8): without it an entry names every mutant of that file with the
   * same edit (`+` → `-` anywhere), and a new survivor on another line would hide behind an old equivalent.
   */
  context?: string;
  /** What kind of survivor it is (4.1.20 PR 2a, plan §7.4): never "the score is good enough". */
  category: (typeof SURVIVOR_CATEGORIES)[number];
  /** `argument` (the `why` proves it: an equivalent mutant only), or the test that pins what makes it so. */
  proof: string;
  /** Who reads it again. */
  owner: string;
  /** The version at which it is read again: an entry is refused from that version on (its pre-releases included). */
  revisit: string;
}
export const SURVIVOR_CATEGORIES = ['equivalent', 'unreachable', 'instrumentation', 'out-of-contract'] as const;

const semverCore = (v: string) => /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(v)?.slice(1, 4).map(Number);

/** What is wrong with the entries of docs/dev/mutants.json at this version; empty when every one holds (pure). */
export function checkKnown(known: KnownSurvivor[], version: string): string[] {
  const now = semverCore(version);
  const out: string[] = [];
  if (!now) out.push(`the repository's version ${version} is not x.y.z: no revisit can be judged`);
  for (const k of known) {
    const at = `${k.file} ${k.operator}: ${k.from} → ${k.to}`;
    if (!SURVIVOR_CATEGORIES.includes(k.category)) out.push(`${at}: a category (${SURVIVOR_CATEGORIES.join(', ')})`);
    if (typeof k.why !== 'string' || k.why.length <= 20) out.push(`${at}: a why that says it`);
    if (typeof k.owner !== 'string' || !k.owner.trim()) out.push(`${at}: an owner`);
    if (k.proof === 'argument') {
      if (k.category !== 'equivalent') out.push(`${at}: a proof by a test (only an equivalent mutant is argued)`);
    } else if (
      typeof k.proof !== 'string' ||
      !/^tests\/.+\.test\.ts$/.test(k.proof) ||
      !existsSync(resolve(ROOT, k.proof))
    )
      out.push(`${at}: a proof, \`argument\` or a test file that exists`);
    const due = typeof k.revisit === 'string' ? semverCore(k.revisit) : undefined;
    if (!due) out.push(`${at}: a revisit version (x.y.z)`);
    else if (now && (now[0]! - due[0]! || now[1]! - due[1]! || now[2]! - due[2]!) >= 0)
      out.push(`${at}: to be read again at ${k.revisit} (this is ${version})`);
  }
  return out;
}
export const sameMutant = (a: Pick<Mutant, 'file' | 'operator' | 'from' | 'to' | 'context'>, b: KnownSurvivor) =>
  a.file === b.file &&
  a.operator === b.operator &&
  a.from === b.from &&
  a.to === b.to &&
  (b.context === undefined || a.context === b.context);

export interface Mutant {
  file: string;
  line: number;
  /** The source line, trimmed. */
  context: string;
  operator: string;
  from: string;
  to: string;
  start: number;
  end: number;
}

const SWAP: Partial<Record<ts.SyntaxKind, [ts.SyntaxKind, string]>> = {
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: [ts.SyntaxKind.ExclamationEqualsEqualsToken, '!=='],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: [ts.SyntaxKind.EqualsEqualsEqualsToken, '==='],
  [ts.SyntaxKind.LessThanToken]: [ts.SyntaxKind.LessThanEqualsToken, '<='],
  [ts.SyntaxKind.LessThanEqualsToken]: [ts.SyntaxKind.LessThanToken, '<'],
  [ts.SyntaxKind.GreaterThanToken]: [ts.SyntaxKind.GreaterThanEqualsToken, '>='],
  [ts.SyntaxKind.GreaterThanEqualsToken]: [ts.SyntaxKind.GreaterThanToken, '>'],
  [ts.SyntaxKind.AmpersandAmpersandToken]: [ts.SyntaxKind.BarBarToken, '||'],
  [ts.SyntaxKind.BarBarToken]: [ts.SyntaxKind.AmpersandAmpersandToken, '&&'],
  [ts.SyntaxKind.PlusToken]: [ts.SyntaxKind.MinusToken, '-'],
  [ts.SyntaxKind.MinusToken]: [ts.SyntaxKind.PlusToken, '+'],
};

/** Every mutant of a source file, in order. Pure: reads the text, returns the edits. */
export function mutants(file: string, src: string): Mutant[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const out: Mutant[] = [];
  const lines = src.split('\n');
  const line = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const add = (operator: string, node: ts.Node, to: string, start = node.getStart(sf), end = node.getEnd()) => {
    const n = line(start);
    out.push({
      file,
      line: n,
      context: (lines[n - 1] ?? '').trim(),
      operator,
      from: src.slice(start, end),
      to,
      start,
      end,
    });
  };
  const visit = (n: ts.Node) => {
    // Types, imports and comments carry no behaviour.
    if (ts.isTypeNode(n) || ts.isImportDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n))
      return;
    if (ts.isBinaryExpression(n)) {
      const swap = SWAP[n.operatorToken.kind];
      if (swap) add('operator', n.operatorToken, swap[1]);
    }
    if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken)
      add('negation', n, n.operand.getText(sf));
    if (n.kind === ts.SyntaxKind.TrueKeyword) add('boolean', n, 'false');
    if (n.kind === ts.SyntaxKind.FalseKeyword) add('boolean', n, 'true');
    if (ts.isIfStatement(n) || ts.isConditionalExpression(n)) {
      const c = ts.isIfStatement(n) ? n.expression : n.condition;
      add('condition true', c, 'true');
      add('condition false', c, 'false');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export const apply = (src: string, m: Mutant) => src.slice(0, m.start) + m.to + src.slice(m.end);

/**
 * What a failed vitest run says, short (4.1.20 PR 2a): each failed test (at most ten) with its first error line, then
 * the totals; the last lines when vitest named no failure (a crash, a configuration that does not load). Pure.
 */
export function failureSummary(output: string): string[] {
  const lines = output.split('\n').map((l) => l.replace(/\s+$/, ''));
  const out: string[] = [];
  let failed = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (!l.startsWith('FAIL ')) continue;
    if (++failed > 10) continue;
    out.push(l);
    const error = lines.slice(i + 1).find((x) => x.trim() && !x.trim().startsWith('FAIL '));
    if (error) out.push(`  ${error.trim()}`);
  }
  if (failed > 10) out.push(`… and ${failed - 10} more failed tests`);
  else if (failed) for (const l of lines) if (/^(Test Files|Tests) /.test(l.trim())) out.push(l.trim());
  return failed ? out : lines.filter((l) => l.trim()).slice(-20);
}

/**
 * The set's tests against the source as it stands. A run that exceeds three minutes is a timeout, counted as killed;
 * the whole process group goes with it (vitest's forked workers included: a timed-out parent alone left orphans that
 * slowed CI's runner to a crawl, 4.1.8).
 */
function runTests(set: MutationSet | 'all', o: { output?: string[] } = {}): Promise<'killed' | 'survived' | 'timeout'> {
  return new Promise((done) => {
    // The output is kept only when asked (the run before the first mutant): a mutant's run says killed or survived.
    const child = spawn('npx', ['vitest', 'run', '--config', 'vitest.mutation.config.ts', '--bail', '1'], {
      cwd: ROOT,
      stdio: o.output ? ['ignore', 'pipe', 'pipe'] : 'ignore',
      detached: true,
      env: { ...process.env, MUTATION_SET: set },
    });
    child.stdout?.on('data', (d: Buffer) => o.output?.push(d.toString()));
    child.stderr?.on('data', (d: Buffer) => o.output?.push(d.toString()));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }, 180_000);
    child.on('error', () => {
      clearTimeout(timer);
      done('killed');
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      done(timedOut ? 'timeout' : code === 0 ? 'survived' : 'killed');
    });
  });
}

if (process.argv[1]?.endsWith('mutate.ts')) {
  const only = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1];
  const given = process.argv.find((a) => a.startsWith('--set='))?.split('=')[1] ?? 'core';
  const setArg = setNamed(given);
  if (setArg !== given)
    console.error(`ℹ  --set=${given} is --set=${setArg} since 4.1.19 (the old name works until 4.2)`);
  // Without a database its tests skip their Postgres cases: every mutant would survive, a measure of nothing.
  const measuring = !['--doc', '--hash', '--merge'].some((f) => process.argv.includes(f));
  const setOf = (f: string): MutationSet | 'all' =>
    (Object.keys(SETS) as MutationSet[]).find((k) => SETS[k].includes(f)) ?? 'all';
  const set: MutationSet | 'all' = only ? setOf(only) : setArg;
  let files = only ? [only] : setsOf(set).flatMap((k) => SETS[k]);
  if (setsOf(set).includes('reality-store-postgres') && !process.env.BRIDGE_PG_URL && measuring) {
    console.error(
      `✖  --set=${set} mutates reality-store-postgres, which needs BRIDGE_PG_URL (a Postgres its tests run against)`,
    );
    process.exit(2);
  }
  if (process.argv.includes('--doc')) {
    const known = JSON.parse(readFileSync(resolve(ROOT, 'docs/dev/mutants.json'), 'utf8')) as KnownSurvivor[];
    const doc = resolve(ROOT, 'docs/dev/MUTANTS.md');
    writeFileSync(doc, withSurvivorsTable(readFileSync(doc, 'utf8'), known));
    console.log(`✔  docs/dev/MUTANTS.md: ${known.length} named survivors written`);
    process.exit(0);
  }
  const hash = inputHash(set);
  if (process.argv.includes('--hash')) {
    console.log(hash);
    process.exit(0);
  }
  const known = JSON.parse(readFileSync(resolve(ROOT, 'docs/dev/mutants.json'), 'utf8')) as KnownSurvivor[];
  const version = (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
  const incomplete = checkKnown(known, version);
  if (incomplete.length) {
    console.error(
      `✖  docs/dev/mutants.json: ${incomplete.length} entr${incomplete.length > 1 ? 'ies' : 'y'} do not hold:`,
    );
    for (const l of incomplete.slice(0, 20)) console.error(`   ${l}`);
    process.exit(2);
  }
  // The shards' reports of a set merged into its report (4.1.20 PR 2a): every shard of the cut this commit gives, of
  // these inputs, or the merge refuses and the gate fails (`--merge [--from=<dir>]`, the reports found anywhere below).
  if (process.argv.includes('--merge')) {
    if (only || set === 'all') {
      console.error('✖  --merge takes a set (not --file, not all)');
      process.exit(2);
    }
    const from = resolve(
      ROOT,
      process.argv.find((a) => a.startsWith('--from='))?.slice('--from='.length) ?? '.cache/mutation',
    );
    const prefix = `report-${set}.shard-`;
    const found: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d, { withFileTypes: true }))
        if (f.isDirectory()) walk(resolve(d, f.name));
        else if (f.name.startsWith(prefix) && f.name.endsWith('.json')) found.push(resolve(d, f.name));
    };
    if (existsSync(from)) walk(from);
    let merged: ReturnType<typeof mergeReports>;
    try {
      merged = mergeReports(
        found.map((f) => JSON.parse(readFileSync(f, 'utf8')) as ShardReport),
        { set, inputHash: hash, shards: cutOf(set, shardsOf(set)), known },
      );
    } catch (e) {
      console.error(`✖  ${set}: ${(e as Error).message}; nothing merged, the set is not judged`);
      process.exit(2);
    }
    const out = resolve(ROOT, '.cache/mutation');
    if (!existsSync(out)) mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, `report-${set}.json`), JSON.stringify(merged, null, 1));
    console.log(
      `${merged.status === 'passed' ? '✔' : '✖'}  ${set}: ${merged.killed}/${merged.total} mutants killed in ${merged.shards.length} shard(s), ${merged.status}; report in .cache/mutation/report-${set}.json (inputs ${hash})`,
    );
    process.exit(merged.status === 'passed' ? 0 : 1);
  }
  // One shard of the set (4.1.20 PR 2a): the files the cut gives it, its inputs the set's and its cut's.
  const shardArg = process.argv.find((a) => a.startsWith('--shard='))?.slice('--shard='.length);
  let shard: ShardReport['shard'] | undefined;
  if (shardArg) {
    const m = /^(\d+)\/(\d+)$/.exec(shardArg);
    const [i, n] = m ? [Number(m[1]), Number(m[2])] : [0, 0];
    if (!m || only || set === 'all' || i < 1 || i > n || n > SETS[set].length) {
      console.error('✖  --shard=<i>/<n> takes a set (not --file, not all), 1 ≤ i ≤ n, n at most its files');
      process.exit(2);
    }
    files = cutOf(set, n)[i - 1]!;
    const shardHash = createHash('sha256')
      .update(`${hash}\0${i}/${n}\0${files.join('\n')}`)
      .digest('hex');
    shard = { index: i, total: n, files, inputHash: shardHash.slice(0, 16) };
  }
  // A report of these very inputs says what this run would say (4.1.8): reused, unless --fresh.
  if (!only && !process.argv.includes('--fresh')) {
    const r = reusableReport(set, hash, shard);
    if (r) {
      console.log(
        `✔  ${r.killed}/${r.total} mutants killed (set ${set}${shard ? `, shard ${shard.index}/${shard.total}` : ''}, inputs ${hash}, measured on ${r.commitSha.slice(0, 7)} at ${r.at}): the same inputs, the report reused (--fresh runs again)`,
      );
      process.exit(0);
    }
  }
  const originals = new Map(files.map((f) => [f, readFileSync(resolve(ROOT, f), 'utf8')]));
  const restore = () => {
    for (const [f, s] of originals) writeFileSync(resolve(ROOT, f), s);
  };
  process.on('SIGINT', () => {
    restore();
    process.exit(130);
  });
  const before: string[] = [];
  if ((await runTests(set, { output: before })) !== 'survived') {
    console.error('✖  the tests fail before any mutation: fix them first');
    for (const l of failureSummary(before.join(''))) console.error(`   ${l}`);
    process.exit(2);
  }
  const results: (Mutant & { status: string })[] = [];
  try {
    for (const f of files) {
      const src = originals.get(f)!;
      const ms = mutants(f, src);
      console.log(`${f}: ${ms.length} mutants`);
      // A mutant is judged by the tests of its own set (`all` runs the sets one after the other, as the nightly did):
      // running both sets' tests on every mutant doubled CI's time and said nothing more.
      const judge = set === 'all' ? setOf(f) : set;
      for (const m of ms) {
        writeFileSync(resolve(ROOT, f), apply(src, m));
        const status = await runTests(judge);
        results.push({ ...m, status });
        if (status === 'survived') console.log(`  survived ${f}:${m.line} ${m.operator}: ${m.from} → ${m.to}`);
      }
      writeFileSync(resolve(ROOT, f), src);
    }
  } finally {
    restore();
  }
  const killed = results.filter((r) => r.status !== 'survived').length;
  const out = resolve(ROOT, '.cache/mutation');
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  for (const f of files) {
    const rs = results.filter((r) => r.file === f);
    const k = rs.filter((r) => r.status !== 'survived').length;
    console.log(`  ${f}: ${k}/${rs.length} killed (${rs.length ? ((100 * k) / rs.length).toFixed(1) : '100'}%)`);
  }
  // The equivalent mutants, each named in docs/dev/mutants.json (and explained in MUTANTS.md): a survivor not named
  // there fails the run, in every mode, whatever the count; a name whose mutant no longer exists is reported too.
  const survivors = results.filter((r) => r.status === 'survived');
  const unexplained = survivors.filter((r) => !known.some((k) => sameMutant(r, k)));
  const stale = known.filter((k) => files.includes(k.file) && !survivors.some((r) => sameMutant(r, k)));
  for (const r of unexplained)
    console.log(
      `  ✖ not in docs/dev/mutants.json: ${r.file}:${r.line} ${r.operator}: ${r.from} → ${r.to}  (${r.context})`,
    );
  for (const k of stale)
    console.log(`  ⚠ named in docs/dev/mutants.json but killed or gone: ${k.file} ${k.operator}: ${k.from} → ${k.to}`);
  const report: MutationReport & { shard?: ShardReport['shard'] } = {
    v: 1,
    set: only ? 'file' : set,
    inputHash: hash,
    commitSha: commitSha(),
    at: new Date().toISOString(),
    status: unexplained.length ? 'failed' : 'passed',
    killed,
    total: results.length,
    results: results.map(({ start, end, ...r }) => r),
    ...(shard ? { shard } : {}),
  };
  const name = reportName(report.set, shard);
  writeFileSync(resolve(out, `${name}.json`), JSON.stringify(report, null, 1));
  console.log(
    `${unexplained.length ? '✖' : '✔'}  ${killed}/${results.length} mutants killed, ${survivors.length - unexplained.length} survivors explained, ${unexplained.length} not; report in .cache/mutation/${name}.json (inputs ${hash})`,
  );
  if (unexplained.length) process.exitCode = 1;
}
