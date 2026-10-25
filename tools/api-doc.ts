// npx tsx tools/api-doc.ts [--check]: the signatures of the public API, read from the sources with the TypeScript
// compiler (4.1.7), written as the generated part of the wiki's `engine.api` (wiki/en/engine.api.md and
// wiki/fr/engine.api.md: the same signatures, the table header in the page's language; and that page's identifiers in
// wiki/manifest.json; 4.5.0, docs/en|fr/API.md being transition pages). `--check` exits 1 when the page is behind the
// code; tests/api-doc.test.ts and `npm run wiki -- check` say the same, and `npm run wiki -- generate engine.api` writes
// the same.
//
// Stability (4.1.8). Every symbol the five entries of src/engine/api re-export carries, on the JSDoc of its original
// declaration, exactly one of two tags and a first sentence that says what it is:
// - `@public`: a name a game or a host calls or reads (a function, a constant, a class, a type its content or its
//   options are written with). A change is announced in the CHANGELOG; a removal waits for the next major
//   (wiki/en/start.stability.md).
// - `@extension`: a contract a game or a host IMPLEMENTS, or is handed while implementing it (a Presenter, a save
//   store, a painter and the specs it is given, a minigame and its context, a custom command, a signal port). The same
//   promise, and one more: a member added to it is a breaking change for whoever implemented it, so it waits too.
// knip reads `@public` too (it never reports such an export unused): the tag is for the API's names, never a way to
// silence knip on an internal symbol.
// What src/engine exports without an entry re-exporting it is internal by construction and carries no tag (`@internal`
// marks the members of Engine the modules of core/ read). tests/api-doc.test.ts fails on a row with no description or
// no stability.
import { resolve } from 'node:path';
import ts from '@typescript/typescript6';
import { sortedUnique, updateGeneratedPage } from './wiki/generated';

const ROOT = resolve(import.meta.dirname, '..');
const ENTRIES = ['content', 'player', 'minigames', 'testing', 'reality'];
/** The widest signature printed (a wider one is cut: the page is a map, the source is the territory). */
const SIG_MAX = 160;

/** One export of an entry, as the generated table shows it. */
export interface ApiRow {
  entry: string;
  name: string;
  signature: string;
  doc: string;
  /** The declared stability, or '' when the declaration carries neither tag. */
  stability: 'public' | 'extension' | '';
  /** `@deprecated` beside the stability: the name still answers, its replacement is in its doc. */
  deprecated: boolean;
  /** Both tags at once: a mistake the test names (a declaration carries exactly one). */
  bothTags: boolean;
}

/** The first sentence of a symbol's doc comment, one line: cut at the blank line and at a bullet list. */
const doc = (sym: ts.Symbol, checker: ts.TypeChecker): string =>
  ts
    .displayPartsToString(sym.getDocumentationComment(checker))
    .split(/\n\s*\n|\n\s*- /)[0]!
    .replace(/\s+/g, ' ')
    .trim();

/** The stability a symbol's JSDoc declares, '' when it declares none; whether it is deprecated; whether both tags are there. */
const tagsOf = (sym: ts.Symbol, checker: ts.TypeChecker) => {
  const tags = new Set(sym.getJsDocTags(checker).map((t) => t.name));
  const stability: ApiRow['stability'] = tags.has('public') ? 'public' : tags.has('extension') ? 'extension' : '';
  return { stability, deprecated: tags.has('deprecated'), bothTags: tags.has('public') && tags.has('extension') };
};

/** The members of a type, summarised: a union by its size, an object by its first names. */
function summary(t: ts.Type, decl: ts.Node | undefined, checker: ts.TypeChecker): string {
  const props = t.getProperties();
  if (t.isUnion()) return `union of ${t.types.length}`;
  if (props.length)
    return `{ ${props
      .slice(0, 6)
      .map((p) => p.name)
      .join(', ')}${props.length > 6 ? `, … ${props.length - 6} more` : ''} }`;
  return checker.typeToString(t, decl, ts.TypeFormatFlags.NoTruncation);
}

/** The signature of one export: a call, a value's type, `class`, `interface { … }` or `type Name = …`. */
function signatureOf(sym: ts.Symbol, real: ts.Symbol, sf: ts.SourceFile, checker: ts.TypeChecker): string {
  const decl = real.declarations?.[0];
  if (real.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable | ts.SymbolFlags.Class)) {
    const t = checker.getTypeOfSymbolAtLocation(real, decl ?? sf);
    const calls = t.getCallSignatures();
    if (calls.length)
      return calls.map((c) => checker.signatureToString(c, decl, ts.TypeFormatFlags.NoTruncation)).join(' · ');
    if (real.flags & ts.SymbolFlags.Class) return `class ${sym.name}`;
    // A constant's literal type is its value (a CSS text, a number): the page says the kind, the source the value.
    return checker.typeToString(
      t.isLiteral() ? checker.getBaseTypeOfLiteralType(t) : t,
      decl,
      ts.TypeFormatFlags.NoTruncation,
    );
  }
  const t = checker.getDeclaredTypeOfSymbol(real);
  if (real.flags & ts.SymbolFlags.TypeAlias) {
    // The alias's right-hand side as the source writes it (`type Id = string`, `type Point = [number, number]`,
    // `type Keyring = BridgeKey[]`, `type WalkTarget = Id | Point`): the checker would print the alias's own name, or
    // expand `Record` and the other aliases it is written with. A side too wide to read (`Cond`, `Cmd`) is summarised.
    // A side that names another declaration's type (`typeof schema`, `z.infer<…>`) says nothing to the reader: the
    // members are summarised instead. Comments inside the type are not printed.
    const head = `type ${sym.name} = `;
    const written = decl && ts.isTypeAliasDeclaration(decl) ? decl.type : undefined;
    const derived = (n: ts.Node): boolean =>
      ts.isTypeQueryNode(n) ||
      (ts.isTypeReferenceNode(n) && /\b(infer|typeof)\b/i.test(n.typeName.getText(n.getSourceFile()))) ||
      ts.forEachChild(n, derived) === true;
    const rhs = written
      ? derived(written)
        ? summary(t, decl, checker)
        : ts
            .createPrinter({ removeComments: true })
            .printNode(ts.EmitHint.Unspecified, written, written.getSourceFile())
            .replace(/\s+/g, ' ')
            .replace(/\[ /g, '[')
            .replace(/ \]/g, ']')
      : checker.typeToString(t, decl, ts.TypeFormatFlags.NoTruncation);
    return head + (head.length + rhs.length <= SIG_MAX ? rhs : summary(t, decl, checker));
  }
  return `interface ${summary(t, decl, checker)}`;
}

/** The rows of the five entries, in the order of the page (entries as listed, names sorted). */
export function apiRows(): ApiRow[] {
  const config = ts.parseJsonConfigFileContent(
    ts.readConfigFile(resolve(ROOT, 'tsconfig.json'), ts.sys.readFile).config,
    ts.sys,
    ROOT,
  );
  const files = ENTRIES.map((e) => resolve(ROOT, 'src/engine/api', `${e}.ts`));
  const program = ts.createProgram(files, { ...config.options, noEmit: true });
  const checker = program.getTypeChecker();
  const rows: ApiRow[] = [];
  for (const [i, file] of files.entries()) {
    const sf = program.getSourceFile(file)!;
    const mod = checker.getSymbolAtLocation(sf)!;
    for (const sym of checker.getExportsOfModule(mod).sort((a, b) => a.name.localeCompare(b.name))) {
      const real = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      const own = tagsOf(real, checker);
      const viaAlias = tagsOf(sym, checker);
      rows.push({
        entry: ENTRIES[i]!,
        name: sym.name,
        signature: signatureOf(sym, real, sf, checker).replace(/\s+/g, ' ').slice(0, SIG_MAX),
        doc: doc(real, checker) || doc(sym, checker),
        stability: own.stability || viaAlias.stability,
        deprecated: own.deprecated || viaAlias.deprecated,
        bothTags: own.bothTags || viaAlias.bothTags,
      });
    }
  }
  return rows;
}

const cell = (s: string) => s.replace(/\|/g, '\\|');

const LABELS = {
  en: { head: '| Name | Signature | Stability | Doc |', deprecated: 'deprecated' },
  fr: { head: '| Nom | Signature | Stabilité | Doc |', deprecated: 'dépréciée' },
} as const;

function block(rows: ApiRow[], lang: 'en' | 'fr'): string {
  const out: string[] = [];
  for (const entry of ENTRIES) {
    out.push(`<a name="${entry}-reference"></a>`, '');
    out.push(`### @quest-n-click/engine/${entry}`, '', LABELS[lang].head, '|---|---|---|---|');
    for (const r of rows.filter((r) => r.entry === entry))
      out.push(
        `| \`${r.name}\` | \`${cell(r.signature)}\` | ${r.stability}${r.deprecated ? ` (${LABELS[lang].deprecated})` : ''} | ${cell(r.doc).slice(0, 140)} |`,
      );
    out.push('');
  }
  return out.join('\n');
}

/**
 * The generated block of the wiki's `engine.api` (4.5.0, lot B11): one table per entry after its
 * `<a name="<entry>-reference">` section id, one line per export, its header in the page's language; the docs stay the
 * source's English first sentences.
 */
export const signaturesWiki = (rows: ApiRow[], lang: 'en' | 'fr'): string => block(rows, lang);

/** The rows a page cannot show: no description, no stability, or both tags. */
export function rowProblems(rows: ApiRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (!r.doc) out.push(`${r.entry}: ${r.name} has no description`);
    if (!r.stability) out.push(`${r.entry}: ${r.name} declares no stability (@public or @extension)`);
    if (r.bothTags) out.push(`${r.entry}: ${r.name} declares both @public and @extension`);
  }
  return out;
}

/** The identifiers the wiki's `engine.api` names: each entry, and each export. */
export const apiIdentifiers = (rows: ApiRow[]): string[] =>
  sortedUnique([
    ...[...new Set(rows.map((r) => r.entry))].map((e) => `@quest-n-click/engine/${e}`),
    ...rows.map((r) => r.name),
  ]);

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const check = process.argv.includes('--check');
  const rows = apiRows();
  // A row without a description or a stability fails the command too (tests/api-doc.test.ts says the same).
  const problems = rowProblems(rows);
  if (!problems.length)
    problems.push(
      ...updateGeneratedPage(
        resolve(ROOT, 'wiki'),
        'engine.api',
        { en: signaturesWiki(rows, 'en'), fr: signaturesWiki(rows, 'fr') },
        apiIdentifiers(rows),
        check,
      ).map((p) => `${p}: npx tsx tools/api-doc.ts`),
    );
  for (const p of problems) console.error(`✖  ${p}`);
  if (!problems.length)
    console.log(`✔  wiki/en|fr/engine.api.md: the signatures ${check ? 'are up to date' : 'written'}`);
  process.exit(problems.length ? 1 : 0);
}
