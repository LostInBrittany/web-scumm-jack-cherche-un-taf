// The documentation access contract (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3, phase A4), on the fixture wiki
// (tests/fixtures/wiki/base: three ready pages, a draft, planned pages, a glossary) and on the repository's own:
//   - the loader: a repository preview holds the draft and ready pages, never a planned one; a bundle holds the ready
//     ones only, with its identity and no publication state; an unknown major format version is refused, plainly;
//   - search_docs: accents, case and plurals set aside, the glossary's other language followed, weights title and
//     question > alias and identifier > section heading > body, the explicit empty result, the filters, the version
//     filter (left out, or marked with includeArchived), pages of results with a cursor;
//   - read_doc by id: a section, a language, maxChars and a cursor for the rest; a cursor of another request or of
//     another revision refused as stale_cursor; the provenance in the text and in the structured content;
//   - read_doc's rule "exactly one of name and id", and name's answer as before: one text block, no truncation, the
//     provenance in the structured content only;
//   - read_doc {name} since the switch-over (C2): the concatenation `legacy.json` orders, each section once (a whole
//     page only for its parts not given yet), a page the set lacks named as coming, within 1.5 × the 4.4.0 page (the
//     longest sections then given by their heading, first paragraph and the section read for the rest), built from
//     wiki/ in the repository and written into the bundle as legacy/<NAME>.md;
//   - the bundle: reproducible (two builds, the same bytes), its files hashed in its manifest, the eight legacy pages
//     with their links made for their folder, written only where the repository tracks nothing.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { callTool, DOCS, jsonSchema, TOOLS, type ToolBackend } from '../tools/studio/tools';
import { bundleOutProblem, main } from '../tools/wiki';
import { bundleProblems, dirtySources, writeBundle } from '../tools/wiki/bundle';
import {
  compareVersions,
  type DocsSet,
  formatProblem,
  legacyBudget,
  legacyConcatenation,
  listDocs,
  readDocById,
  searchDocs,
  splitSections,
} from '../tools/wiki/docs';
import {
  bundleDocs,
  legacyDoc,
  legacyOfSet,
  PUBLICATION_URL,
  repositoryDocs,
  resolveDocs,
} from '../tools/wiki/docs-load';
import { trackedFiles } from '../tools/wiki/check';
import { AUDIENCES, CONTEXTS, PAGE_TYPES } from '../tools/wiki/manifest';

const ROOT = resolve('.');
const BASE = resolve('tests/fixtures/wiki/base');
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
const preview = (wikiDir = BASE) => repositoryDocs(ROOT, { wikiDir });
const results = (set: DocsSet, query: string, extra: Record<string, unknown> = {}) => {
  const r = searchDocs(set, { query, ...extra });
  return 'note' in r ? [] : r.results;
};
const bundleOpts = (outDir: string, wikiDir = BASE) => ({
  root: ROOT,
  wikiDir,
  outDir,
  productVersion: '4.5.0',
  productCommit: 'a'.repeat(40),
  docRevision: 'a'.repeat(40),
  buildId: '123',
});
/** A bundle's JSON file changed by `edit`, its sha256 in the bundle's manifest made to agree. */
function rewrite(dir: string, path: string, edit: (o: Record<string, unknown>) => Record<string, unknown>) {
  const text = JSON.stringify(edit(JSON.parse(readFileSync(join(dir, path), 'utf8'))));
  writeFileSync(join(dir, path), text);
  const mfile = join(dir, 'bundle-manifest.json');
  const m = JSON.parse(readFileSync(mfile, 'utf8')) as { files: { path: string; sha256: string }[] };
  m.files.find((f) => f.path === path)!.sha256 = createHash('sha256').update(text).digest('hex');
  writeFileSync(mfile, JSON.stringify(m));
}
/** A package root as an install leaves it: its package.json, its bundle. */
function packageRoot(wikiDir = BASE): string {
  const root = tmp('docs-package-');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'quest-n-click', version: '4.5.0' }));
  writeBundle(bundleOpts(join(root, 'docs-bundle'), wikiDir));
  return root;
}
/** A copy of the fixture wiki with a legacy order: ENGINE a section, a whole page, then the rest of the first page. */
function legacyWiki(): string {
  const dir = tmp('docs-legacy-wiki-');
  cpSync(BASE, dir, { recursive: true });
  writeFileSync(
    join(dir, 'legacy.json'),
    JSON.stringify({
      format: 'quest-n-click-docs-legacy',
      version: 1,
      dedup: 'page-covers-sections',
      pages: { ENGINE: ['create.rooms#checking', 'create.exits', 'create.rooms', 'studio.notes'] },
    }),
  );
  return dir;
}
const backendOf = (root: string): ToolBackend =>
  ({
    readDoc: async (name: string) => legacyDoc(root, name),
    docs: async () => resolveDocs(root),
  }) as unknown as ToolBackend;

describe('the loader', () => {
  it('reads the draft and ready pages of a repository wiki, never a planned or generated one', () => {
    const set = preview();
    expect(set.index.pages.map((p) => [p.id, p.state])).toEqual([
      ['create.rooms', 'ready'],
      ['create.exits', 'ready'],
      ['studio.notes', 'draft'],
      ['team.write-refused-423', 'ready'],
    ]);
    expect(set.provenance).toMatchObject({ source: 'repository', productVersion: expect.any(String) });
    expect(set.provenance.label).toMatch(/^repository preview/);
    expect(set.index.pages[0]!.langs.en!.sections.map((s) => s.id)).toEqual(['', 'walkable-zones', 'checking']);
    expect(Object.keys(set.pages).sort()).toContain('fr/studio.notes');
  });

  it('cuts a page at its anchors, never inside fenced code', () => {
    const s = splitSections('# T\n\nlead\n\n```md\n<a name="no"></a>\n```\n\n<a name="one"></a>\n\n## One\n\nbody\n');
    expect(s.map((x) => [x.id, x.title])).toEqual([
      ['', 'T'],
      ['one', 'One'],
    ]);
    expect(s[0]!.text).toContain('<a name="no"></a>');
  });

  it('reads a bundle: the ready pages only, its identity, no publication state', () => {
    const set = resolveDocs(packageRoot());
    expect(set.index.pages.map((p) => p.id)).toEqual(['create.rooms', 'create.exits', 'team.write-refused-423']);
    expect(set.provenance).toEqual({
      source: 'bundle',
      productVersion: '4.5.0',
      productCommit: 'a'.repeat(40),
      docRevision: 'a'.repeat(40),
      buildId: '123',
      label: expect.stringContaining('never in the bundle'),
    });
    expect(JSON.stringify(set.provenance)).not.toMatch(/"(published|candidate|preview)"/);
  });

  it('refuses an unknown major version of the index or of the bundle manifest, plainly', () => {
    expect(formatProblem({ format: 'quest-n-click-docs-index', version: 1 }, 'quest-n-click-docs-index', 'x')).toBe(
      undefined,
    );
    expect(formatProblem({ format: 'quest-n-click-docs-index', version: 2 }, 'quest-n-click-docs-index', 'x')).toMatch(
      /format version 2; this engine reads version 1 only/,
    );
    expect(formatProblem({ format: 'other', version: 1 }, 'quest-n-click-docs-index', 'x')).toMatch(/not a/);
    const root = packageRoot();
    rewrite(join(root, 'docs-bundle'), 'index.json', (i) => ({ ...i, version: 2 }));
    expect(() => bundleDocs(join(root, 'docs-bundle'))).toThrow(/index\.json is format version 2/);
  });

  it('checks a bundle before reading it: a tampered file, a path out of the bundle, refused by name', () => {
    const tampered = packageRoot();
    writeFileSync(join(tampered, 'docs-bundle', 'md', 'en', 'create.rooms.md'), 'changed');
    expect(() => resolveDocs(tampered)).toThrow(/md\/en\/create\.rooms\.md does not match its sha256/);
    const legacy = packageRoot();
    writeFileSync(join(legacy, 'docs-bundle', 'legacy', 'ENGINE.md'), 'changed');
    expect(() => legacyDoc(legacy, 'ENGINE')).toThrow(/legacy\/ENGINE\.md does not match its sha256/);
    // An index naming a file outside md/<lang>/<id>.md, even with its hashes made to agree.
    const hostile = packageRoot();
    rewrite(join(hostile, 'docs-bundle'), 'index.json', (i) => {
      (i.pages as { langs: { en: { file: string } } }[])[0]!.langs.en.file = '../../package.json';
      return i;
    });
    expect(() => resolveDocs(hostile)).toThrow(/create\.rooms \(en\) names the file "\.\.\/\.\.\/package\.json"/);
    const listedOut = packageRoot();
    const m = JSON.parse(readFileSync(join(listedOut, 'docs-bundle', 'bundle-manifest.json'), 'utf8'));
    m.files.push({ path: '../package.json', sha256: 'x', bytes: 1 });
    writeFileSync(join(listedOut, 'docs-bundle', 'bundle-manifest.json'), JSON.stringify(m));
    expect(() => resolveDocs(listedOut)).toThrow(/\.\.\/package\.json: not a path a documentation bundle holds/);
  });

  it("names the place a bundle's promotion is checked, never a state of its own", () => {
    expect(PUBLICATION_URL).toBe('https://raw.githubusercontent.com/wiki/Quest-n-Click/quest-n-click/publication.json');
    expect(resolveDocs(packageRoot()).provenance.label).toContain(PUBLICATION_URL);
  });
});

describe('search_docs', () => {
  const set = preview();

  it('finds by question, title, alias and identifier, accents and case aside, best first', () => {
    expect(results(set, 'POURQUOI mon enregistrement est refuse avec 423')[0]).toMatchObject({
      ref: 'team.write-refused-423#symptom',
      lang: 'fr',
      reason: 'question',
      status: 'current',
      type: 'troubleshooting',
    });
    expect(results(set, '423')[0]).toMatchObject({ id: 'team.write-refused-423', reason: 'title' });
    expect(results(set, 'scene')[0]).toMatchObject({ id: 'create.rooms', reason: 'alias' });
    expect(results(set, 'walkTo')[0]).toMatchObject({ id: 'create.rooms', reason: 'identifier' });
    // A plural meets its singular; a heading weighs more than a body.
    const zones = results(set, 'zone');
    expect(zones.map((r) => [r.ref, r.reason])).toEqual([
      ['create.rooms#walkable-zones', 'section'],
      ['create.exits#doors', 'body'],
    ]);
    expect(zones[0]!.score).toBeGreaterThan(zones[1]!.score);
    expect(zones[0]!.snippet).toContain('**zones**');
    expect(zones[0]!.snippet).not.toContain('](');
  });

  it('follows the glossary into the other language: « verrou » finds the 423 page, "lock" too', () => {
    expect(results(set, 'verrou')[0]).toMatchObject({ id: 'team.write-refused-423', reason: 'alias' });
    expect(results(set, 'lock', { lang: 'en' })[0]).toMatchObject({ id: 'team.write-refused-423', lang: 'en' });
  });

  it('answers an explicit empty result under the threshold, never weak results', () => {
    const r = searchDocs(set, { query: 'banana smoothie' });
    expect(r).toMatchObject({ results: [], note: 'no confident match', suggestions: [] });
  });

  it('filters by language, type, audience, context and state of the pages', () => {
    expect(results(set, 'zone', { lang: 'fr' }).every((r) => r.lang === 'fr')).toBe(true);
    expect(results(set, '423', { type: 'howto' })).toEqual([]);
    expect(listDocs(set, { state: 'draft' }).pages.map((p) => p.id)).toEqual(['studio.notes']);
    expect(listDocs(set, { lang: 'fr', type: 'troubleshooting' }).pages).toMatchObject([
      { id: 'team.write-refused-423', title: 'Écriture refusée : pan verrouillé (423)', langs: ['en', 'fr'] },
    ]);
  });

  it('leaves out a page that does not apply to a version, or marks it with includeArchived', () => {
    expect(results(set, '423', { version: '4.4.0' })).toEqual([]);
    expect(results(set, '423', { version: '4.5.0' })[0]).toMatchObject({ id: 'team.write-refused-423' });
    expect(results(set, '423', { version: '4.4.0', includeArchived: true })[0]).toMatchObject({
      id: 'team.write-refused-423',
      notApplicable: true,
    });
  });

  it('pages its results with a cursor bound to the request and the revision', () => {
    const first = searchDocs(set, { query: 'zone', limit: 1 });
    if ('note' in first) throw new Error('no result');
    expect(first.results.map((r) => r.ref)).toEqual(['create.rooms#walkable-zones']);
    expect(first.total).toBe(2);
    const second = searchDocs(set, { query: 'zone', limit: 1, cursor: first.cursor });
    if ('note' in second) throw new Error('no result');
    expect(second.results.map((r) => r.ref)).toEqual(['create.exits#doors']);
    expect(second.cursor).toBeUndefined();
    expect(() => searchDocs(set, { query: 'zones door', limit: 1, cursor: first.cursor })).toThrow(/^stale_cursor/);
    const changed = { ...set, provenance: { ...set.provenance, docRevision: 'b'.repeat(40) } };
    expect(() => searchDocs(changed, { query: 'zone', limit: 1, cursor: first.cursor })).toThrow(/^stale_cursor/);
  });

  it('is deterministic: the same request, the same answer', () => {
    expect(searchDocs(preview(), { query: 'zone note studio 423' })).toEqual(
      searchDocs(preview(), { query: 'zone note studio 423' }),
    );
  });
});

describe('read_doc by id', () => {
  const set = preview();

  it('reads a section in a language, the provenance in the text and in the structured content', () => {
    const r = readDocById(set, { id: 'team.write-refused-423', section: 'symptom', lang: 'fr' });
    expect(r.text.split('\n')[0]).toMatch(
      /^> quest'n'click documentation · team\.write-refused-423#symptom \(fr, ready\)/,
    );
    expect(r.text).toContain("L'enregistrement est refusé avec 423.");
    expect(r.structured).toMatchObject({ ref: 'team.write-refused-423#symptom', lang: 'fr', state: 'ready' });
    expect(r.structured.provenance).toEqual(set.provenance);
    expect(readDocById(set, { id: 'studio.notes' }).text).toMatch(/\(en, draft: not reviewed yet\)/);
  });

  it("gives a bundle's page the website's latest page and its release's archive, no versioned page (§4.5.4, D52)", () => {
    expect(readDocById(set, { id: 'team.write-refused-423', section: 'symptom' }).structured).not.toHaveProperty('url');
    const r = readDocById(resolveDocs(packageRoot()), { id: 'team.write-refused-423', section: 'symptom', lang: 'fr' });
    expect(r.structured.url).toEqual({
      versioned: null,
      versionedNote:
        "no versioned page online: the documentation of 4.5.0 is its release's archive, quest-n-click-docs-4.5.0.tar.gz (https://github.com/Quest-n-Click/quest-n-click/releases/tag/v4.5.0)",
      current: 'https://quest-n-click.cleverapps.io/fr/docs/team.write-refused-423#symptom',
      currentLabel: 'latest documentation on the project website, not necessarily this version',
    });
    // A local or dirty build: the same, nothing online is this build's.
    const local = tmp('docs-package-local-');
    writeFileSync(join(local, 'package.json'), JSON.stringify({ name: 'quest-n-click', version: '4.5.0' }));
    writeBundle({ ...bundleOpts(join(local, 'docs-bundle')), buildId: 'local-a7' });
    const l = readDocById(resolveDocs(local), { id: 'team.write-refused-423' }).structured.url!;
    expect(l.versioned).toBeNull();
    expect(l.current).toBe('https://quest-n-click.cleverapps.io/docs/team.write-refused-423');
  });

  it('gives maxChars at a time and a cursor for the rest; a cursor of another request is stale', () => {
    const whole = readDocById(set, { id: 'create.rooms' }).structured.range.total;
    let cursor: string | undefined;
    let read = '';
    let rounds = 0;
    do {
      const r = readDocById(set, { id: 'create.rooms', maxChars: 120, cursor });
      read += r.text
        .split('\n')
        .slice(2)
        .join('\n')
        .replace(/\n\n> characters [\s\S]*$/, '');
      cursor = r.structured.cursor;
      rounds++;
    } while (cursor && rounds < 50);
    expect(rounds).toBeGreaterThan(2);
    expect(read).toBe(readFileSync(join(BASE, 'en', 'create.rooms.md'), 'utf8'));
    expect(read.length).toBe(whole);
    const c = readDocById(set, { id: 'create.rooms', maxChars: 120 }).structured.cursor!;
    expect(() => readDocById(set, { id: 'create.rooms', maxChars: 120, lang: 'fr', cursor: c })).toThrow(
      /^stale_cursor/,
    );
    expect(() => readDocById(set, { id: 'create.rooms', section: 'checking', maxChars: 120, cursor: c })).toThrow(
      /^stale_cursor/,
    );
    expect(() => readDocById(set, { id: 'create.rooms', cursor: 'nonsense' })).toThrow(/^stale_cursor/);
  });

  it('names what is there when a page, a language or a section is not', () => {
    expect(() => readDocById(set, { id: 'create.dsl' })).toThrow(/no page "create\.dsl".*planned page has no text/);
    expect(() => readDocById(set, { id: 'create.rooms', section: 'nope' })).toThrow(/walkable-zones, checking/);
  });
});

describe('read_doc, the tool', () => {
  it("offers the manifest's own audiences, contexts and types as filters (the Studio page cannot import it)", () => {
    for (const name of ['search_docs', 'list_docs']) {
      const p = (jsonSchema(TOOLS.find((t) => t.name === name)!) as { properties: Record<string, { enum?: string[] }> })
        .properties;
      expect(p.audience!.enum, name).toEqual([...AUDIENCES]);
      expect(p.context!.enum, name).toEqual([...CONTEXTS]);
      expect(p.type!.enum, name).toEqual([...PAGE_TYPES]);
    }
  });

  it('takes exactly one of name and id', async () => {
    const b = backendOf(packageRoot());
    for (const args of [{}, { name: 'CONTENT_GUIDE', id: 'create.rooms' }]) {
      const r = await callTool('read_doc', args, b);
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toBe('Error: give either name (one of the 8 legacy pages) or id, not both');
    }
  });

  it("name: the other arguments ignored, as 4.4.0's schema stripped them; the page whole", async () => {
    const root = packageRoot(legacyWiki());
    const b = backendOf(root);
    const engine = legacyDoc(root, 'ENGINE');
    expect(engine).toContain('## Doors');
    for (const extra of [{ lang: 'fr' }, { maxChars: 10 }, { section: 'x' }, { cursor: 'c1.x' }]) {
      const r = await callTool('read_doc', { name: 'ENGINE', ...extra }, b);
      expect(r, JSON.stringify(extra)).toEqual({ content: [{ type: 'text', text: engine }] });
    }
  });

  it("name: one text block, the whole page (the bundle's legacy page in a package), and no structured content", async () => {
    const root = packageRoot(legacyWiki());
    for (const name of DOCS) {
      const r = await callTool('read_doc', { name }, backendOf(root));
      expect(r.isError).toBeFalsy();
      expect(r.content).toHaveLength(1);
      expect(r.content[0]!.type).toBe('text');
      expect(r.content[0]!.text).toBe(readFileSync(join(root, 'docs-bundle', 'legacy', `${name}.md`), 'utf8'));
      expect(r.structuredContent).toBeUndefined();
    }
  });

  it('id: read through the loader; a stale cursor is a tool error naming stale_cursor', async () => {
    const b = backendOf(packageRoot());
    const r = await callTool('read_doc', { id: 'create.rooms', section: 'walkable-zones', maxChars: 50 }, b);
    expect(r.content[0]!.text).toMatch(/^> quest'n'click documentation · create\.rooms#walkable-zones \(en, ready\)/);
    expect(r.content[0]!.text).toContain(
      "quest'n'click 4.5.0 (commit aaaaaaaaaaaa, doc revision aaaaaaaaaaaa, build 123)",
    );
    const cursor = (r.structuredContent as { cursor: string }).cursor;
    const stale = await callTool('read_doc', { id: 'create.exits', maxChars: 50, cursor }, b);
    expect(stale).toMatchObject({ isError: true, structuredContent: { error: 'stale_cursor' } });
    const search = await callTool('search_docs', { query: 'door', limit: 1 }, b);
    expect(search.structuredContent).toMatchObject({ results: [{ id: 'create.exits' }] });
    const list = await callTool('list_docs', {}, b);
    expect((list.structuredContent as { total: number }).total).toBe(3);
  });

  it('a client that shows the structured content when there is one loses nothing', async () => {
    const b = backendOf(packageRoot());
    // What such a client shows: the structured content's text when it has one, otherwise the text blocks.
    const shown = (r: { content: { text: string }[]; structuredContent?: Record<string, unknown> }) =>
      r.structuredContent ? String(r.structuredContent.text) : r.content.map((c) => c.text).join('');
    for (const [tool, args] of [
      ['read_doc', { name: 'CONTENT_GUIDE' }],
      ['read_doc', { id: 'create.rooms', section: 'checking' }],
      ['read_doc', { id: 'create.rooms', maxChars: 40 }],
      ['search_docs', { query: 'door' }],
      ['search_docs', { query: 'banana' }],
      ['list_docs', {}],
      ['read_doc', { id: 'create.rooms', cursor: 'c1.forged' }],
    ] as const) {
      const r = await callTool(tool, args, b);
      expect(shown(r), `${tool} ${JSON.stringify(args)}`).toBe(r.content[0]!.text);
    }
    const byId = await callTool('read_doc', { id: 'create.rooms', section: 'checking' }, b);
    expect(byId.structuredContent).toMatchObject({ provenance: { source: 'bundle' }, ref: 'create.rooms#checking' });
  });

  it("in the repository, name reads the concatenation of wiki/'s pages, never docs/en's transition pages", () => {
    const set = repositoryDocs(ROOT);
    for (const name of DOCS) {
      const text = legacyDoc(ROOT, name);
      expect(text).toBe(legacyOfSet(set, name));
      expect(text, name).not.toContain('quest-n-click transition page');
      expect(Buffer.byteLength(text), name).toBeLessThanOrEqual(legacyBudget(name)!);
      expect(text.length, name).toBeGreaterThan(1000);
    }
  });
});

describe('the legacy concatenation (C2)', () => {
  const pages: Record<string, string> = {
    'p.a':
      '# A\n\nLead of A.\n\n<a name="one"></a>\n\n## One\n\nFirst of A.\n\n<a name="two"></a>\n\n## Two\n\nSecond of A.\n',
    'p.b': '# B\n\n<a name="x"></a>\n\n## X\n\nOf B.\n',
  };
  const pageOf = (id: string) => pages[id];

  it('gives each section once, in the legacy order, a whole page only for its parts not given yet', () => {
    expect(legacyConcatenation(['p.a#two', 'p.b', 'p.a', 'p.a#one'], pageOf)).toBe(
      '## Two\n\nSecond of A.\n\n# B\n\n## X\n\nOf B.\n\n# A\n\nLead of A.\n\n## One\n\nFirst of A.\n',
    );
  });

  it('names a page the set does not hold as coming, once', () => {
    expect(legacyConcatenation(['p.none#x', 'p.none', 'p.b#x'], pageOf)).toBe(
      '(p.none: coming in a later documentation)\n\n## X\n\nOf B.\n',
    );
  });

  it('keeps within its bound: the longest sections by heading, first paragraph and the read for the rest', () => {
    const long = { 'p.l': `# L\n\n<a name="big"></a>\n\n## Big\n\nFirst.\n\n${'More. '.repeat(100)}\n` };
    const of = (id: string) => ({ ...pages, ...long })[id];
    const whole = legacyConcatenation(['p.b', 'p.l'], of);
    const bounded = legacyConcatenation(['p.b', 'p.l'], of, 200);
    expect(Buffer.byteLength(whole)).toBeGreaterThan(200);
    expect(bounded).toBe(
      '# B\n\n## X\n\nOf B.\n\n# L\n\n## Big\n\nFirst.\n\n(The rest of this section: `read_doc {"id":"p.l","section":"big"}`.)\n',
    );
    // Tighter still: its heading and the read alone.
    expect(legacyConcatenation(['p.b', 'p.l'], of, 100)).toBe(
      '# B\n\n## X\n\nOf B.\n\n# L\n\n## Big\n\n(This section: `read_doc {"id":"p.l","section":"big"}`.)\n',
    );
    // Within its bound, nothing changes.
    expect(legacyConcatenation(['p.b', 'p.l'], of, 100000)).toBe(whole);
  });
});

describe('the bundle', () => {
  it('is reproducible: two builds, the same bytes', () => {
    const a = tmp('bundle-a-');
    const b = tmp('bundle-b-');
    const ma = writeBundle(bundleOpts(a));
    writeBundle(bundleOpts(b));
    for (const f of ma.files) expect(readFileSync(join(b, f.path)).equals(readFileSync(join(a, f.path)))).toBe(true);
    expect(readFileSync(join(a, 'bundle-manifest.json'), 'utf8')).toBe(
      readFileSync(join(b, 'bundle-manifest.json'), 'utf8'),
    );
  });

  it('holds the index, the ready pages in md/<lang>/, the legacy pages, the images, each hashed', () => {
    const out = tmp('bundle-');
    const m = writeBundle(bundleOpts(out, legacyWiki()));
    expect(m.files.map((f) => f.path)).toEqual([
      'assets/room.png',
      'index.json',
      ...DOCS.map((n) => `legacy/${n}.md`).sort(),
      'md/en/create.exits.md',
      'md/en/create.rooms.md',
      'md/en/team.write-refused-423.md',
      'md/fr/create.exits.md',
      'md/fr/create.rooms.md',
      'md/fr/team.write-refused-423.md',
    ]);
    expect(JSON.stringify(m)).not.toMatch(/published|preview|\d{4}-\d\d-\d\dT/);
    expect(bundleProblems(out)).toEqual([]);
    // A legacy page: the bundled English pages in the legacy order, a draft named as coming, links made for legacy/.
    const engine = readFileSync(join(out, 'legacy', 'ENGINE.md'), 'utf8');
    expect(engine.indexOf('## Checking')).toBeLessThan(engine.indexOf('# Exits'));
    expect(engine.indexOf('# Exits')).toBeLessThan(engine.indexOf('## Walkable zones'));
    expect(engine.match(/## Checking/g)).toHaveLength(1);
    expect(engine).toContain('(studio.notes: coming in a later documentation)');
    expect(engine).toContain('[a door](../md/en/create.exits.md#doors)');
    expect(engine).toContain('![A room](../assets/room.png "The hall")');
    expect(engine).not.toContain('<a name=');
    expect(readFileSync(join(out, 'legacy', 'TOOLS.md'), 'utf8')).toBe('\n');
    // Links rewritten for a local reading: pages beside it, the code at its commit, an unbundled page as text.
    const rooms = readFileSync(join(out, 'md', 'en', 'create.rooms.md'), 'utf8');
    expect(rooms).toContain('[a door](../en/create.exits.md#doors)');
    expect(rooms).toContain(
      `(https://github.com/Quest-n-Click/quest-n-click/blob/${'a'.repeat(40)}/src/engine/core/save.ts#L1)`,
    );
    expect(rooms).toContain('the DSL (coming)');
    expect(rooms).toContain('![A room](../../assets/room.png "The hall")');
    writeFileSync(join(out, 'md', 'en', 'create.rooms.md'), 'changed');
    expect(bundleProblems(out)).toEqual(["md/en/create.rooms.md: its sha256 is not the manifest's"]);
  });

  it('never carries a draft, and refuses to empty a folder that holds something else', () => {
    const out = tmp('bundle-');
    writeBundle(bundleOpts(out));
    expect(readFileSync(join(out, 'index.json'), 'utf8')).not.toContain('studio.notes');
    const other = tmp('bundle-other-');
    writeFileSync(join(other, 'keep.txt'), 'mine');
    expect(() => writeBundle(bundleOpts(other))).toThrow(/holds no previous bundle/);
  });

  it('is written only where the repository tracks nothing', () => {
    const tracked = trackedFiles();
    expect(bundleOutProblem('.cache/pack/quest-n-click/docs-bundle', tracked)).toBeUndefined();
    expect(bundleOutProblem('pack/quest-n-click/docs-bundle', tracked)).toBeUndefined();
    expect(bundleOutProblem(join(tmpdir(), 'x'), tracked)).toBeUndefined();
    expect(bundleOutProblem('src/docs-bundle', tracked)).toMatch(/tracks/);
    expect(bundleOutProblem('wiki', tracked)).toMatch(/tracks/);
    expect(bundleOutProblem('.', tracked)).toMatch(/repository itself/);
  });

  it("of the repository's own wiki: its ready pages, its index, the eight legacy pages within their bound", () => {
    const out = tmp('bundle-repo-');
    const m = writeBundle({ ...bundleOpts(out, join(ROOT, 'wiki')), docRevision: 'HEAD' });
    expect(m.wikiTree).toMatch(/^[0-9a-f]{40}$/);
    const set = bundleDocs(out);
    expect(set.index.pages.every((p) => p.state === 'ready')).toBe(true);
    expect(Object.keys(set.index.legacy).sort()).toEqual([...DOCS].sort());
    const root = tmp('bundle-repo-package-');
    writeFileSync(join(root, 'package.json'), '{}');
    cpSync(out, join(root, 'docs-bundle'), { recursive: true });
    for (const name of DOCS) {
      const text = legacyDoc(root, name);
      expect(Buffer.byteLength(text), name).toBeLessThanOrEqual(legacyBudget(name)!);
      // The same sections as the repository's, only the links differ (made for the bundle), so the bound may give
      // other sections by their first paragraph: their `#` and `##` headings stay.
      // Headings outside fenced code: a shell comment (`# in the engine repository`) inside a block is not one, and a
      // section given by its first paragraph alone drops its blocks.
      const headings = (t: string) => {
        let fence = false;
        return t.split('\n').filter((l) => {
          if (/^\s*(```|~~~)/.test(l)) fence = !fence;
          return !fence && /^##?\s/.test(l);
        });
      };
      expect(headings(text), name).toEqual(headings(legacyDoc(ROOT, name)));
    }
  });
});

describe('a wiki copy with a page past its version', () => {
  it('marks appliesUntil inclusive', () => {
    const dir = tmp('wiki-versions-');
    cpSync(BASE, dir, { recursive: true });
    const file = join(dir, 'manifest.json');
    const m = JSON.parse(readFileSync(file, 'utf8')) as { pages: { id: string; versions?: object }[] };
    m.pages.find((p) => p.id === 'team.write-refused-423')!.versions = {
      appliesFrom: '4.5.0',
      appliesUntil: '4.6.0',
    };
    writeFileSync(file, JSON.stringify(m));
    mkdirSync(join(dir, 'images'), { recursive: true });
    const set = preview(dir);
    expect(results(set, '423', { version: '4.6.0' })).toHaveLength(1);
    expect(results(set, '423', { version: '4.6.1' })).toEqual([]);
    expect(results(set, '423', { version: '4.6.0-rc.1' })).toHaveLength(1);
  });
});

/**
 * The fixture wiki with plan §13 D3's neighbour and counter-example: the team Studio's 409 (a stale base revision,
 * context studio-hosted) and the Bridge's 409 (a signal already received, context bridge). Their pages' text names
 * their service, so an excerpt says which 409 it is.
 */
function wiki409(): string {
  const dir = tmp('wiki-409-');
  cpSync(BASE, dir, { recursive: true });
  const file = join(dir, 'manifest.json');
  const m = JSON.parse(readFileSync(file, 'utf8')) as { pages: Record<string, unknown>[] };
  const page = (id: string, domain: string, context: string, urls: [string, string], titles: [string, string]) => ({
    id,
    domain,
    type: 'troubleshooting',
    audience: ['author'],
    context: [context],
    title: { en: titles[0], fr: titles[1] },
    url: { en: urls[0], fr: urls[1] },
    state: 'ready',
    versions: { appliesFrom: '4.5.0' },
    sources: ['package.json'],
    replaces: [],
    questions: { en: [`Why ${titles[0]}?`], fr: [`Pourquoi ${titles[1]} ?`] },
    aliases: { en: [], fr: [] },
    identifiers: ['409'],
    related: [],
    prerequisites: [],
  });
  m.pages.push(
    page(
      'team.write-refused-409',
      'team',
      'studio-hosted',
      ['EN-Team-Write-Refused-409', 'FR-Equipe-Ecriture-Refusee-409'],
      ['Studio write refused: stale base revision (409)', 'Studio : écriture refusée, révision de base dépassée (409)'],
    ),
    page(
      'bridge.signal-duplicate-409',
      'bridge',
      'bridge',
      ['EN-Bridge-Signal-Duplicate-409', 'FR-Bridge-Signal-Doublon-409'],
      ['Bridge signal refused: already received (409)', 'Bridge : signal refusé, déjà reçu (409)'],
    ),
  );
  writeFileSync(file, JSON.stringify(m));
  const body = (title: string, symptom: string, text: string) =>
    `# ${title}\n\n<a name="symptom"></a>\n\n## ${symptom}\n\n${text}\n`;
  writeFileSync(
    join(dir, 'en', 'team.write-refused-409.md'),
    body(
      'Studio write refused: stale base revision (409)',
      'Symptom',
      'The team Studio answers 409: someone wrote first.',
    ),
  );
  writeFileSync(
    join(dir, 'fr', 'team.write-refused-409.md'),
    body('Studio : écriture refusée (409)', 'Symptôme', "Le Studio d'équipe répond 409 : quelqu'un a écrit avant."),
  );
  writeFileSync(
    join(dir, 'en', 'bridge.signal-duplicate-409.md'),
    body('Bridge signal refused (409)', 'Symptom', 'The Bridge answers 409 for a signal it already received.'),
  );
  writeFileSync(
    join(dir, 'fr', 'bridge.signal-duplicate-409.md'),
    `${body('Bridge : signal refusé (409)', 'Symptôme', 'Le Bridge répond 409 pour un signal déjà reçu.')}
<a name="games"></a>

## Au cœur des jeux et de leurs niveaux

Chaque jeu déclare ses signaux.
`,
  );
  return dir;
}

describe('plan §13 D3, a neighbour and a counter-example', () => {
  const set = preview(wiki409());

  it('"423" puts the 423 page first in both languages', () => {
    for (const lang of ['en', 'fr'] as const)
      expect(results(set, '423', { lang })[0]!.id).toBe('team.write-refused-423');
  });

  it('"409" with the hosted Studio\'s context puts the Studio\'s 409 first', () => {
    expect(results(set, '409', { context: 'studio-hosted' }).map((r) => r.id)).toEqual(['team.write-refused-409']);
  });

  it('"409" without a context shows both, each excerpt naming its service', () => {
    const r = results(set, '409');
    expect(r.map((x) => x.id).sort()).toEqual(['bridge.signal-duplicate-409', 'team.write-refused-409']);
    expect(r.find((x) => x.id === 'team.write-refused-409')!.snippet).toMatch(/Studio/);
    expect(r.find((x) => x.id === 'bridge.signal-duplicate-409')!.snippet).toMatch(/Bridge/);
  });

  it('« conflit de verrou » finds the 423 page through the glossary (verrou → bail → lease)', () => {
    expect(results(set, 'conflit de verrou')[0]).toMatchObject({ id: 'team.write-refused-423', reason: 'alias' });
  });

  it('folds œ and æ, and sets a French plural in x aside', () => {
    expect(results(set, 'coeur')[0]?.id).toBe('bridge.signal-duplicate-409');
    expect(results(set, 'jeu niveau')[0]?.id).toBe('bridge.signal-duplicate-409');
  });
});

/**
 * wiki409() and two pages that span several contexts: an error register (a reference page listing 409 for the Studio
 * and the Bridge) and a layout page with a section per place, "A created project" and "The engine repository".
 */
function wikiContexts(): string {
  const dir = wiki409();
  const file = join(dir, 'manifest.json');
  const m = JSON.parse(readFileSync(file, 'utf8')) as { pages: Record<string, unknown>[] };
  const page = (
    id: string,
    type: string,
    context: string[],
    titles: [string, string],
    urls: [string, string],
    extra = {},
  ) => ({
    id,
    domain: id.split('.')[0],
    type,
    audience: ['author'],
    context,
    title: { en: titles[0], fr: titles[1] },
    url: { en: urls[0], fr: urls[1] },
    state: 'ready',
    versions: { appliesFrom: '4.5.0' },
    sources: ['package.json'],
    replaces: [],
    questions: { en: [], fr: [] },
    aliases: { en: [], fr: [] },
    identifiers: [],
    related: [],
    prerequisites: [],
    ...extra,
  });
  m.pages.push(
    page(
      'reference.error-codes',
      'reference',
      ['studio-hosted', 'bridge'],
      ['Error codes', "Codes d'erreur"],
      ['EN-Reference-Error-Codes', 'FR-Reference-Codes-Erreur'],
      {
        identifiers: ['409'],
      },
    ),
    page(
      'create.project-layout',
      'reference',
      ['engine-repo', 'created-project'],
      ['Layout', 'Organisation'],
      ['EN-Create-Layout', 'FR-Creer-Organisation'],
      {
        aliases: { en: ['Hosted backup', 'backup'], fr: ['sauvegarde', 'sauvegarde hébergée'] },
      },
    ),
  );
  writeFileSync(file, JSON.stringify(m));
  // A symptom page says "error" as a reader does.
  for (const id of ['team.write-refused-409', 'bridge.signal-duplicate-409'])
    writeFileSync(
      join(dir, 'en', `${id}.md`),
      `${readFileSync(join(dir, 'en', `${id}.md`), 'utf8')}\nThis error is a 409.\n`,
    );
  const register = '# Error codes\n\n<a name="codes"></a>\n\n## 409\n\nThe Studio and the Bridge answer 409.\n';
  writeFileSync(join(dir, 'en', 'reference.error-codes.md'), register);
  writeFileSync(join(dir, 'fr', 'reference.error-codes.md'), register.replace('Error codes', "Codes d'erreur"));
  const layout = (a: string, b: string) =>
    `# Layout\n\n<a name="created-project"></a>\n\n## ${a}\n\nThe widget opens the game.\n\n<a name="engine-repository"></a>\n\n## ${b}\n\nThe widget opens the current game.\n`;
  writeFileSync(join(dir, 'en', 'create.project-layout.md'), layout('A created project', 'The engine repository'));
  writeFileSync(join(dir, 'fr', 'create.project-layout.md'), layout('Un projet créé', 'Le dépôt du moteur'));
  return dir;
}

describe('the search with a context: the page or the section of that context first', () => {
  const set = preview(wikiContexts());

  it('puts a troubleshooting page above the error register for a status code asked within a context', () => {
    expect(results(set, 'Error 409', { context: 'studio-hosted', lang: 'en' })[0]!.id).toBe('team.write-refused-409');
    expect(results(set, 'Error 409', { context: 'bridge', lang: 'en' })[0]!.id).toBe('bridge.signal-duplicate-409');
    // Without a context the register keeps its score: it names every service the code belongs to.
    expect(results(set, 'Error 409', { lang: 'en' }).map((r) => r.id)).toContain('reference.error-codes');
  });

  it("answers with the section headed by the context's name, in both languages", () => {
    for (const lang of ['en', 'fr'] as const) {
      expect(results(set, 'widget', { lang, context: 'engine-repo' })[0]!.ref).toBe(
        'create.project-layout#engine-repository',
      );
      expect(results(set, 'widget', { lang, context: 'created-project' })[0]!.ref).toBe(
        'create.project-layout#created-project',
      );
    }
  });

  it('shows, for a page-level match, the field that holds the most words found', () => {
    const r = results(set, 'hosted backup', { lang: 'en' }).find((x) => x.id === 'create.project-layout')!;
    expect(r).toMatchObject({ reason: 'alias' });
    expect(r.snippet).toContain('**Hosted** **backup**');
  });

  it('sets contractions and possessives aside: "don\'t" and "their" weigh nothing', () => {
    expect(results(set, "Why don't their widgets open?", { lang: 'en' })[0]?.id).toBe('create.project-layout');
  });
});

describe("the search of the repository's wiki, ordinary symptoms (the 4.5.1 audit, F10)", () => {
  const set = repositoryDocs(ROOT);
  const first = (query: string, lang: 'en' | 'fr', context?: string) =>
    results(set, query, { lang, ...(context ? { context } : {}) })[0]?.ref;

  it('puts « pas de son » and "no sound" on the players\' troubleshooting first, with or without a context', () => {
    for (const context of [undefined, 'player']) {
      expect(first('pas de son', 'fr', context)).toBe('play.troubleshooting#no-sound');
      expect(first('no sound', 'en', context)).toBe('play.troubleshooting#no-sound');
      expect(first('aucun son', 'fr', context)).toBe('play.troubleshooting#no-sound');
      expect(first("je n'entends rien", 'fr', context)).toBe('play.troubleshooting#no-sound');
    }
    // The symptom inside a sentence still meets the section that names it.
    expect(first("le jeu n'a pas de son", 'fr')).toBe('play.troubleshooting#no-sound');
    expect(first('the game has no sound', 'en')).toBe('play.troubleshooting#no-sound');
  });

  it('reads « son » as the noun after a determiner, and sets the possessive aside', () => {
    const ids = (q: string) => results(set, q, { lang: 'fr' }).map((r) => r.ref);
    expect(ids('vérifier son jeu avant de le partager')).toEqual(ids('vérifier jeu avant de le partager'));
    expect(ids('le joueur perd son inventaire')).toEqual(ids('le joueur perd inventaire'));
    expect(ids('pas de son')).not.toEqual(ids('pas de'));
  });
});

describe('the search, at its edges', () => {
  it('counts an identifier in capitals only when typed exactly, its own section first, its description in the excerpt (A7, D2)', () => {
    const dir = tmp('wiki-screaming-');
    cpSync(BASE, dir, { recursive: true });
    const file = join(dir, 'manifest.json');
    const m = JSON.parse(readFileSync(file, 'utf8')) as { pages: { id: string; identifiers: string[] }[] };
    m.pages.find((p) => p.id === 'studio.notes')!.identifiers = [
      'STUDIO',
      'STUDIO_SESSION_KEY',
      'PATH',
      'WORKER_PYTHON_PATH',
    ];
    writeFileSync(file, JSON.stringify(m));
    const page = join(dir, 'en', 'studio.notes.md');
    writeFileSync(
      page,
      `${readFileSync(page, 'utf8').replace('Write in the Notes tab.', 'Write in the Notes **tab**, never in `ops/**/*.yml`.')}
<a name="worker-python-path"></a>

### \`WORKER_PYTHON_PATH\`

Where the build hook installed the Python packages.

<a name="path"></a>

### \`PATH\`

The system's search path, passed to the children.

<a name="studio-session-key"></a>

### \`STUDIO_SESSION_KEY\`

The keys that seal the session cookies.
`,
    );
    const set = preview(dir);
    const exact = results(set, 'STUDIO_SESSION_KEY')[0]!;
    expect(exact).toMatchObject({ ref: 'studio.notes#studio-session-key', reason: 'identifier' });
    // The excerpt is the identifier's section: its name, then its description.
    expect(exact.snippet).toMatch(/that seal the .*cookies/);
    // One token shaped like an identifier names it in any case; the plain word does not.
    expect(results(set, 'studio_session_key')[0]).toMatchObject({ ref: 'studio.notes#studio-session-key' });
    expect(results(set, 'the studio').filter((r) => r.reason === 'identifier')).toEqual([]);
    // The section headed by exactly the identifier typed wins over one whose name contains it.
    expect(results(set, 'PATH')[0]).toMatchObject({ ref: 'studio.notes#path', reason: 'identifier' });
    expect(results(set, 'WORKER_PYTHON_PATH')[0]).toMatchObject({ ref: 'studio.notes#worker-python-path' });
    // Emphasis around words is dropped before marking; a glob in code keeps its stars.
    const bold = results(set, 'tab yml', { lang: 'en' }).find((r) => r.id === 'studio.notes')!;
    expect(bold.snippet).toContain('the Notes **tab**');
    expect(bold.snippet).not.toContain('****');
    expect(bold.snippet).toContain('`ops/**/*.yml`');
  });

  const set = preview();

  it('a rare word met once in a body only is not a confident match (score 2 under 3): a heading, a title or a repeat is needed', () => {
    // "polygon" is once in create.rooms' body, inside its LIMIT block; "zone", in a heading and repeated, is found.
    expect(searchDocs(set, { query: 'polygon' })).toMatchObject({ results: [], note: 'no confident match' });
    expect(results(set, 'zone')).not.toEqual([]);
  });

  it('refuses forged cursors as stale', () => {
    const first = searchDocs(set, { query: 'zone', limit: 1 });
    if ('note' in first) throw new Error('no result');
    const data = JSON.parse(Buffer.from(first.cursor!.slice(3), 'base64url').toString()) as Record<string, unknown>;
    const forge = (o: Record<string, unknown>) => `c1.${Buffer.from(JSON.stringify(o)).toString('base64url')}`;
    for (const c of [
      forge({ ...data, r: 'another-revision' }),
      forge({ ...data, q: '00000000' }),
      forge({ ...data, l: 'fr' }),
      forge({ ...data, o: -1 }),
      forge({ ...data, o: 1.5 }),
      'c1.not-base64-json',
      'c2.whatever',
    ])
      expect(() => searchDocs(set, { query: 'zone', limit: 1, cursor: c }), c).toThrow(/^stale_cursor/);
    const read = readDocById(set, { id: 'create.rooms', maxChars: 40 }).structured.cursor!;
    const r = JSON.parse(Buffer.from(read.slice(3), 'base64url').toString()) as Record<string, unknown>;
    expect(() => readDocById(set, { id: 'create.rooms', maxChars: 40, cursor: forge({ ...r, o: 1e9 }) })).toThrow(
      /^stale_cursor: this cursor points past the end/,
    );
  });

  it('orders versions as SemVer does, pre-releases numerically', () => {
    const sorted = [
      '4.5.0',
      '4.5.0-rc.10',
      '4.5.0-rc.2',
      '4.5.0-alpha',
      '4.5.0-rc.1',
      '4.4.9',
      '4.10.0',
      '4.5.0-rc',
    ].sort(compareVersions);
    expect(sorted).toEqual([
      '4.4.9',
      '4.5.0-alpha',
      '4.5.0-rc',
      '4.5.0-rc.1',
      '4.5.0-rc.2',
      '4.5.0-rc.10',
      '4.5.0',
      '4.10.0',
    ]);
    expect(compareVersions('4.5.0+build.1', '4.5.0')).toBe(0);
  });
});

describe('the bundle of a changed checkout', () => {
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' });
  /** A checkout with a committed wiki and docs/en (no longer a source of the bundle), and a commit. */
  function checkout(): { root: string; head: string } {
    const root = tmp('bundle-git-');
    cpSync(BASE, join(root, 'wiki'), { recursive: true });
    mkdirSync(join(root, 'docs', 'en'), { recursive: true });
    for (const n of DOCS) writeFileSync(join(root, 'docs', 'en', `${n}.md`), `# ${n}\n`);
    git(root, 'init', '-q');
    git(root, 'add', '.');
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x');
    return { root, head: git(root, 'rev-parse', 'HEAD').trim() };
  }

  it('lists what changed under wiki/, never docs/en, nothing on a clean checkout', () => {
    const { root } = checkout();
    expect(dirtySources(root, join(root, 'wiki'))).toEqual([]);
    writeFileSync(join(root, 'wiki', 'en', 'create.rooms.md'), 'changed\n');
    writeFileSync(join(root, 'docs', 'en', 'NEW.md'), 'new\n');
    expect(dirtySources(root, join(root, 'wiki'))).toEqual([' M wiki/en/create.rooms.md']);
  });

  it('says so in its identity when allowed: docRevision <sha>-dirty, wikiTree dirty', () => {
    const { root, head } = checkout();
    const clean = writeBundle({ ...bundleOpts(tmp('b-'), join(root, 'wiki')), root, docRevision: head });
    expect(clean.docRevision).toBe(head);
    expect(clean.wikiTree).toMatch(/^[0-9a-f]{40}$/);
    const dirty = writeBundle({ ...bundleOpts(tmp('b-'), join(root, 'wiki')), root, docRevision: head, dirty: true });
    expect(dirty).toMatchObject({ docRevision: `${head}-dirty`, wikiTree: 'dirty' });
  });

  it('`wiki -- bundle` refuses a changed checkout without --allow-dirty', () => {
    // Two bundles of the repository's wiki, each after its check: seconds alone, more under a full parallel run.
    // The repository's own wiki: refused when its sources differ from HEAD, unless --allow-dirty.
    const dirty = dirtySources(ROOT, join(ROOT, 'wiki')).length > 0;
    const out = join(tmp('bundle-cli-'), 'docs-bundle');
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(m));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(main(['bundle', '--out', out])).toBe(dirty ? 1 : 0);
      if (dirty) expect(errors.join('\n')).toMatch(/--allow-dirty/);
      expect(main(['bundle', '--out', out, '--allow-dirty'])).toBe(0);
      const m = JSON.parse(readFileSync(join(out, 'bundle-manifest.json'), 'utf8')) as { docRevision: string };
      expect(m.docRevision.endsWith('-dirty')).toBe(dirty);
    } finally {
      spy.mockRestore();
      log.mockRestore();
    }
    expect(existsSync(out)).toBe(true);
  }, 60000);
});
