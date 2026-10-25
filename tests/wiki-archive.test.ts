// The documentation archive (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.4, phase A5b), on the fixture wiki
// (tests/fixtures/wiki/base): self-contained (the bundle, `html/`, `wiki/`, `bundle-manifest.json`), reproducible (two
// builds, the same bytes; the gzip header has no time and a fixed system byte), named by its identity, no publication
// state inside; its HTML links by output (§4.5.6: pages relative, so `/docs/<v>/r<n>/<lang>/<id>.html#<anchor>`
// once copied; code at `blob/<productCommit>/`), its anchors the source's `<a name>` ids, every character escaped, an
// unsafe link without its target; a tampered archive refused.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { writeTarGz } from '../tools/field/tar';
import { main } from '../tools/wiki';
import { type ArchiveOptions, archiveName, buildArchive, readArchive } from '../tools/wiki/archive';
import { searchDocs, type DocsSet } from '../tools/wiki/docs';
import { displayState, type PageIdentity, type PublicationView } from '../tools/wiki/display';
import { inline, renderMarkdown, safeHref } from '../tools/wiki/html';
import { readManifest } from '../tools/wiki/manifest';

const BASE = resolve('tests/fixtures/wiki/base');
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const options = (o: Partial<ArchiveOptions> = {}): ArchiveOptions => ({
  root: resolve('.'),
  wikiDir: BASE,
  manifest: readManifest(BASE).manifest!,
  productVersion: '4.5.0',
  productCommit: 'c'.repeat(40),
  docRevision: 'd'.repeat(40),
  revision: 'r1',
  buildId: '123',
  identifiers: [],
  ...o,
});
const files0 = () => readArchive(buildArchive(options()).bytes).files;
const text = (files: Map<string, Buffer>, path: string) => {
  const b = files.get(path);
  if (!b) throw new Error(`${path} is not in the archive`);
  return b.toString('utf8');
};

describe('the archive', () => {
  const built = buildArchive(options());
  const { files, manifest } = readArchive(built.bytes);

  it('is named by its identity: r1 bare, a fix with its revision, a preview said', () => {
    expect(built.name).toBe('quest-n-click-docs-4.5.0.tar.gz');
    expect(archiveName('4.5.0', 'r2')).toBe('quest-n-click-docs-4.5.0-r2.tar.gz');
    expect(archiveName('4.5.0', 'r1', true)).toBe('quest-n-click-docs-4.5.0-preview.tar.gz');
    expect(() => buildArchive(options({ revision: 'r0' }))).toThrow(/r1, r2/);
  });

  it('is self-contained: the bundle, the site, the wiki and a manifest of every file', () => {
    for (const f of [
      'index.json',
      'md/en/create.rooms.md',
      'legacy/CONTENT_GUIDE.md',
      'assets/room.png',
      'html/index.html',
      'html/en/create.rooms.html',
      'html/fr/create.rooms.html',
      'html/en/index.by-task.html',
      'html/assets/room.png',
      'html/style.css',
      'html/search.js',
      'html/search-index.json',
      'html/sitemap.xml',
      'html/llms.txt',
      'wiki/Home.md',
      'wiki/_Footer.md',
      'wiki/en/EN-Create-Rooms.md',
      'wiki/images/room.png',
      'bundle-manifest.json',
    ])
      expect(files.has(f), f).toBe(true);
    // A draft is never in a release archive: neither its page nor its site.
    expect([...files.keys()].some((f) => f.includes('studio.notes'))).toBe(false);
    expect(manifest.files.map((f) => f.path)).toEqual(
      [...files.keys()].filter((f) => f !== 'bundle-manifest.json').sort(),
    );
  });

  it('carries its identity only: product, commit, doc revision and its number, build; never a publication state', () => {
    const m = JSON.parse(text(files, 'bundle-manifest.json')) as Record<string, unknown>;
    expect(m).toMatchObject({
      format: 'quest-n-click-docs-bundle',
      version: 1,
      productVersion: '4.5.0',
      productCommit: 'c'.repeat(40),
      docRevision: 'd'.repeat(40),
      docRevisionNumber: 'r1',
      buildId: '123',
    });
    expect(Object.keys(m)).not.toContain('published');
    expect(Object.keys(m)).not.toContain('state');
    expect(text(files, 'html/en/create.rooms.html')).toContain(
      'Whether it is published, and which one is current, is recorded at <a href="https://raw.githubusercontent.com/wiki/Quest-n-Click/quest-n-click/publication.json">',
    );
  });

  it('is reproducible: the same options give the same bytes; another build id other bytes', () => {
    expect(buildArchive(options()).bytes.equals(built.bytes)).toBe(true);
    expect(buildArchive(options({ buildId: '124' })).bytes.equals(built.bytes)).toBe(false);
    // The gzip header: no time, the system byte fixed (the same bytes on every system).
    expect(built.bytes.readUInt32LE(4)).toBe(0);
    expect(built.bytes[9]).toBe(255);
    expect(gunzipSync(built.bytes).length % 512).toBe(0);
  });

  it('links by output (§4.5.6): pages relative to the permalink, the twin language, the code at the product commit', () => {
    const html = text(files, 'html/en/create.rooms.html');
    expect(html).toContain('<a href="create.exits.html#doors">a door</a>');
    expect(html).toContain('<a href="../fr/create.rooms.html">Français</a>');
    expect(html).toContain(
      `href="https://github.com/Quest-n-Click/quest-n-click/blob/${'c'.repeat(40)}/src/engine/core/save.ts#L1"`,
    );
    expect(html).toContain('<img src="../assets/room.png" alt="A room" title="The hall" loading="lazy">');
    expect(html).toContain('<link rel="canonical" href="https://quest-n-click.cleverapps.io/docs/create.rooms">');
    // A page not published keeps its text and says it is coming.
    expect(html).toContain('the DSL (coming)');
    // The anchors are the source's ids, in every output.
    expect(html).toContain('<h2 id="walkable-zones">Walkable zones</h2>');
    expect(text(files, 'html/fr/create.rooms.html')).toContain('id="walkable-zones"');
    expect(text(files, 'html/sitemap.xml')).toContain(
      '<loc>https://quest-n-click.cleverapps.io/fr/docs/create.exits</loc>',
    );
    expect(text(files, 'html/llms.txt')).toContain('https://quest-n-click.cleverapps.io/docs/create.rooms');
    // The wiki's own links: public URLs, the footer says current and where the permalinks are.
    expect(text(files, 'wiki/en/EN-Create-Rooms.md')).toContain('[a door](EN-Create-Exits#doors)');
    expect(text(files, 'wiki/_Footer.md')).toContain("quest'n'click 4.5.0 r1");
  });

  it("a revision says its number; its links online name the website's latest page, no versioned one (D52)", () => {
    const r2 = readArchive(buildArchive(options({ revision: 'r2' })).bytes);
    expect(r2.manifest.docRevisionNumber).toBe('r2');
    expect(text(r2.files, 'html/sitemap.xml')).toContain(
      '<loc>https://quest-n-click.cleverapps.io/docs/create.rooms</loc>',
    );
    expect(text(r2.files, 'html/sitemap.xml')).not.toMatch(/\/docs\/4\.5\.0\//);
    expect(text(r2.files, 'html/en/create.rooms.html')).toContain("quest'n'click 4.5.0 · r2");
  });

  it('a preview holds the drafts under its banner, has no permalink, and says so in its manifest', () => {
    const p = readArchive(buildArchive(options({ preview: true })).bytes);
    expect(p.manifest.preview).toBe(true);
    const notes = text(p.files, 'html/fr/studio.notes.html');
    expect(notes).toContain('Aperçu de la documentation de la 4.5.0');
    expect(notes).toContain('href="https://github.com/Quest-n-Click/quest-n-click/blob/v4.4.0/docs/"');
    expect(notes).not.toContain('rel="canonical"');
  });

  it('searches as search_docs does: the same index, the same answers', () => {
    const set = JSON.parse(text(files, 'html/search-index.json')) as DocsSet;
    const r = searchDocs(set, { query: '423' });
    expect('note' in r ? [] : r.results.map((x) => x.id)).toContain('team.write-refused-423');
    // The script is the bundled search, with no path of this machine in it.
    const js = text(files, 'html/search.js');
    expect(js.length).toBeGreaterThan(1000);
    expect(js).not.toContain(resolve('.'));
  });

  it('refuses an archive whose files do not match its manifest', () => {
    const changed = new Map(files);
    changed.set('html/en/create.rooms.html', Buffer.from('changed'));
    expect(() => readArchive(writeTarGz(changed))).toThrow(/create\.rooms\.html: its sha256/);
    const extra = new Map(files);
    extra.set('html/extra.html', Buffer.from('x'));
    expect(() => readArchive(writeTarGz(extra))).toThrow(/not in bundle-manifest\.json/);
    const missing = new Map(files);
    missing.delete('wiki/Home.md');
    expect(() => readArchive(writeTarGz(missing))).toThrow(/wiki\/Home\.md: listed/);
  });

  it('`wiki -- archive --test-report --candidate` renders a guarantee "executed on <sha>" under the rules of check --publish (A7)', () => {
    const out = mkdtempSync(join(tmpdir(), 'archive-report-'));
    temps.push(out);
    const root = resolve('.');
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const report = (dir: string, run: string, status = 'passed') => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'vitest.json'),
        JSON.stringify({
          testResults: [
            {
              name: join(root, 'tests/studio-backup.test.ts'),
              assertionResults: [
                {
                  ancestorTitles: ["the Studio Server's backup"],
                  title: 'refuses a backup altered, a project not empty, a blob missing, another schema',
                  status,
                },
              ],
            },
          ],
        }),
      );
      writeFileSync(
        join(dir, 'commit.json'),
        JSON.stringify({ format: 'quest-n-click-test-report', version: 1, commit, root, run }),
      );
      return join(dir, 'vitest.json');
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const drill = (file: string) => {
      const html = readArchive(readFileSync(file)).files.get('html/en/clever.restore-drill.html')!.toString('utf8');
      return /<code>restore-empty-db-only<\/code> · ([^\n]*)/.exec(html)?.[1]?.replace(/<[^>]+>/g, '');
    };
    try {
      const name = 'quest-n-click-docs-4.5.0.tar.gz';
      const args = (dir: string, more: string[]) => [
        'archive',
        '--out',
        join(out, dir, name),
        '--allow-dirty',
        '--product-version',
        '4.5.0',
        '--build-id',
        '7',
        ...more,
      ];
      expect(main(args('a', ['--candidate', '7', '--test-report', report(join(out, 'r7'), '7')]))).toBe(0);
      expect(drill(join(out, 'a', name))).toMatch(new RegExp(`^referenced · executed on ${commit.slice(0, 12)}`));
      // The same inputs, the same bytes: the report is an input, not a clock.
      expect(main(args('b', ['--candidate', '7', '--test-report', report(join(out, 'r7'), '7')]))).toBe(0);
      expect(readFileSync(join(out, 'a', name)).equals(readFileSync(join(out, 'b', name)))).toBe(true);
      // Without a report, referenced only; a report of another run, or a test not passed, executes nothing.
      expect(main(args('c', []))).toBe(0);
      expect(drill(join(out, 'c', name))).toMatch(/^referenced(?! · executed)/);
      expect(main(args('d', ['--candidate', '8', '--test-report', report(join(out, 'r7b'), '7')]))).toBe(1);
      expect(err.mock.calls.flat().join('\n')).toMatch(/names the run 7, not the candidate 8/);
      expect(main(args('e', ['--candidate', '7', '--test-report', report(join(out, 'rs'), '7', 'skipped')]))).toBe(0);
      expect(drill(join(out, 'e', name))).toMatch(/^referenced(?! · executed)/);
      expect(main(args('f', ['--test-report', report(join(out, 'r7c'), '7')]))).toBe(2);
    } finally {
      err.mockRestore();
      log.mockRestore();
    }
    // Five archives of the whole wiki (210 pages in two languages): minutes under coverage's instrumentation.
  }, 600_000);

  it('`wiki -- archive` refuses a file name its identity does not give', () => {
    const out = mkdtempSync(join(tmpdir(), 'archive-cli-'));
    temps.push(out);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(
        main([
          'archive',
          `--wiki=${BASE}`,
          '--out',
          join(out, 'docs.tar.gz'),
          '--allow-dirty',
          '--product-version',
          '4.5.0',
        ]),
      ).toBe(1);
      expect(err.mock.calls.flat().join('\n')).toMatch(/named quest-n-click-docs-4\.5\.0\.tar\.gz/);
      expect(main(['archive', '--out', join(out, 'x.tar.gz'), '--revision', 'two'])).toBe(2);
    } finally {
      err.mockRestore();
    }
  });
});

describe('what a page says it is (publication.json, §4.5.1)', () => {
  const rc: PageIdentity = { version: '4.5.0', revision: 'r1', docRevision: 'a'.repeat(40), buildId: '100' };
  const final: PageIdentity = { version: '4.5.0', revision: 'r1', docRevision: 'b'.repeat(40), buildId: '200' };
  const shipped: PublicationView = {
    latest: { version: '4.5.0', revision: 'r1', docRevision: final.docRevision, buildId: '200' },
    versions: { '4.5.0': { approved: 'r1', revisions: { r1: { docRevision: final.docRevision, buildId: '200' } } } },
  };

  it("an rc's page is never the published one once the final ships, though both say 4.5.0 r1", () => {
    expect(displayState(shipped, final)).toEqual({ kind: 'current' });
    expect(displayState(shipped, rc)).toEqual({ kind: 'unpublished' });
    // The same commit, another candidate run: still not the published build.
    expect(displayState(shipped, { ...final, buildId: '201' })).toEqual({ kind: 'unpublished' });
    expect(displayState({ latest: null, versions: {} }, rc)).toEqual({ kind: 'unpublished' });
  });

  it('a published revision that is no longer the latest, or no longer approved, says so', () => {
    const later: PublicationView = {
      latest: { version: '4.6.0', revision: 'r1', docRevision: 'c'.repeat(40) },
      versions: {
        ...shipped.versions,
        '4.6.0': { approved: 'r1', revisions: { r1: { docRevision: 'c'.repeat(40) } } },
      },
    };
    expect(displayState(later, final)).toEqual({ kind: 'published', latest: '4.6.0 r1' });
    const fixed: PublicationView = {
      latest: { version: '4.5.0', revision: 'r2', docRevision: 'e'.repeat(40) },
      versions: {
        '4.5.0': {
          approved: 'r2',
          revisions: { r1: { docRevision: final.docRevision, buildId: '200' }, r2: { docRevision: 'e'.repeat(40) } },
        },
      },
    };
    expect(displayState(fixed, final)).toEqual({ kind: 'superseded', approved: 'r2' });
  });

  it('every page carries what it is matched on: version, revision, doc revision, build', () => {
    const html = text(files0(), 'html/en/create.rooms.html');
    expect(html).toContain(
      `data-version="4.5.0" data-revision="r1" data-doc-revision="${'d'.repeat(40)}" data-build="123"`,
    );
  });
});

describe('the HTML renderer', () => {
  it('escapes every character a page holds, raw HTML included, the anchor line aside', () => {
    const html = renderMarkdown('<a name="x"></a>\n\n## A <b>bold</b> & "quoted" title\n\n<script>alert(1)</script>\n');
    expect(html).toBe(
      '<h2 id="x">A &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; title</h2>\n<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });

  it('drops a target that is not http(s), mailto, a fragment or a relative path', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref(' JaVaScRiPt:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,x')).toBeUndefined();
    expect(safeHref('//evil.example')).toBeUndefined();
    // A browser reads a backslash as a slash: `/\host` and `\\host` are other sites, `\x` is no relative path.
    for (const t of ['/\\evil.example', '\\\\evil.example', '\\evil.example', '/\\/evil.example', '\\/evil.example'])
      expect(safeHref(t), t).toBeUndefined();
    // In a page's Markdown, two backslashes are one: `/\\host` written in a page is read `/\host`, refused.
    expect(inline('[x](/\\\\evil.example)')).toBe('x');
    expect(safeHref('../fr/a.html#b')).toBe('../fr/a.html#b');
    expect(safeHref('/docs/4.5.0/')).toBe('/docs/4.5.0/');
    expect(inline('[click](javascript:alert(1))')).toBe('click');
    expect(inline('![x](data:image/png;base64,AA)')).toBe('x');
    expect(inline('[ok](https://example.com/a?b=1&c=2 "t")')).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2" title="t">ok</a>',
    );
  });

  it("renders a folded block as the wiki writes it: a page's qualification, a sidebar's domain", () => {
    expect(renderMarkdown('<details><summary>Audience, `context`</summary>\n\n> Audience: author\n\n</details>')).toBe(
      '<details><summary>Audience, <code>context</code></summary>\n<blockquote>\n<p>Audience: author</p>\n</blockquote>\n</details>',
    );
    // Only that shape: another tag on the line stays text.
    expect(renderMarkdown('<details open>')).toBe('<p>&lt;details open&gt;</p>');
  });

  it('renders the subset the pages use: code, emphasis, lists, tables, quotes, fences', () => {
    expect(inline('`a <b>` **bold** *em* snake_case_name \\*star')).toBe(
      '<code>a &lt;b&gt;</code> <strong>bold</strong> <em>em</em> snake_case_name *star',
    );
    expect(renderMarkdown('- one\n- two `x`\n\n1. first\n2. second')).toBe(
      '<ul>\n<li>one</li>\n<li>two <code>x</code></li>\n</ul>\n<ol>\n<li>first</li>\n<li>second</li>\n</ol>',
    );
    expect(renderMarkdown('| a | b |\n|---|:-:|\n| `x \\| y` | 2 |')).toBe(
      '<table>\n<thead><tr><th>a</th><th style="text-align:center">b</th></tr></thead>\n<tbody>\n<tr><td><code>x | y</code></td><td style="text-align:center">2</td></tr>\n</tbody>\n</table>',
    );
    expect(renderMarkdown('> **Limit** · `id`\n> A line.')).toBe(
      '<blockquote>\n<p><strong>Limit</strong> · <code>id</code>\nA line.</p>\n</blockquote>',
    );
    expect(renderMarkdown('```sh\nnpm run <x>\n```')).toBe(
      '<pre><code class="language-sh">npm run &lt;x&gt;\n</code></pre>',
    );
    expect(renderMarkdown('<!-- step: install -->\nText')).toBe('<p>Text</p>');
    expect(renderMarkdown('- item\n  continued\n\n  second paragraph\n- next')).toContain('<li><p>item\ncontinued</p>');
  });
});
