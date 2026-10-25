// `npm run wiki -- archive --out <file>` (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.4; ADR 0030): the documentation
// archive a release attaches, `quest-n-click-docs-<v>.tar.gz` (revision r1) or `quest-n-click-docs-<v>-r<n>.tar.gz`
// (a fix, published as the release `docs-v<v>-r<n>`). Self-contained, so Pages copies it and never renders it again:
//   - the bundle (tools/wiki/bundle.ts): `index.json`, `md/<lang>/`, `legacy/`, `assets/`;
//   - `html/`: the final site of this revision, one page per page and language (tools/wiki/html.ts), its stylesheet,
//     its images under `html/assets/`, `search-index.json` and `search.js` (the very `search_docs` of
//     tools/wiki/docs.ts, bundled by esbuild), `sitemap.xml` and `llms.txt` with the permalinks
//     `<Pages>/docs/<v>/r<n>/<lang>/<id>.html`, and `index.html`. Links between pages are relative
//     (`<id>.html#<anchor>`, `../fr/<id>.html`), so they resolve to the permalink under `/docs/<v>/r<n>/` and from a disk
//     alike; links to the code point at `blob/<productCommit>/…`, proofs at the commit their measure names;
//   - `wiki/`: the GitHub wiki's folder (tools/wiki/build.ts), which a publication pushes as it is: promoting the
//     release rebuilds nothing;
//   - `bundle-manifest.json`: the identity (product version and commit, doc revision and its number, the build) and the
//     sha256 of every other file. No publication state (§4.5.1).
// Reproducible: the files in a fixed order, a tar with no owner, time 0 and mode 0644 (tools/field/tar.ts), a gzip
// header with no time and a fixed system byte. The same sources and options give the same bytes; the candidate builds
// it twice and compares them.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTarGz, writeTarGz } from '../field/tar';
import { type BuildOptions, composePages, htmlStyle, type LinkStyle, wikiFiles } from './build';
import { siteDocs } from './site';
import { bundleContents } from './bundle';
import type { DocsSet } from './docs';
import { type BundleManifest, indexWiki, PUBLICATION_URL, sha256 } from './docs-load';
import { formatJson } from './json';
import { LANGS, type Manifest } from './manifest';
import { htmlPage, renderMarkdown, STYLE_CSS } from './html';

/** A doc revision's number: `r1`, `r2`… */
export const REVISION = /^r[1-9]\d*$/;
/** The archive's bounds when it is read back (Pages reads every release's): far above any real archive. */
const READ_BUDGET = {
  maxArchiveBytes: 256 * 1024 * 1024,
  maxFileBytes: 64 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxEntries: 50_000,
};

/** The archive's file name: `quest-n-click-docs-<v>.tar.gz` for r1, `-r<n>` after it for a fix, `-preview` for a preview. */
export const archiveName = (version: string, revision: string, preview = false) =>
  `quest-n-click-docs-${version}${preview ? '-preview' : revision === 'r1' ? '' : `-${revision}`}.tar.gz`;

export interface ArchiveOptions {
  root: string;
  wikiDir: string;
  manifest: Manifest;
  productVersion: string;
  productCommit: string;
  docRevision: string;
  /** `r1`, `r2`… */
  revision: string;
  buildId?: string;
  dirty?: boolean;
  /** The bootstrap's preview (§4.5.3): drafts in the site and the wiki, under a banner. */
  preview?: boolean;
  statuses?: BuildOptions['statuses'];
  claims?: BuildOptions['claims'];
  identifiers?: BuildOptions['identifiers'];
}

/** `html/search.js`: the client search, bundled once per process (esbuild is a development dependency). */
let searchScript: Buffer | undefined;
function searchJs(): Buffer {
  if (searchScript) return searchScript;
  // Loaded when an archive is built, never at import: the engine's package ships tools/ without esbuild.
  const { buildSync } = createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
  const r = buildSync({
    entryPoints: [fileURLToPath(new URL('./html-search.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'iife',
    minify: true,
    target: 'es2020',
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'silent',
  });
  searchScript = Buffer.from(r.outputFiles[0]!.contents);
  return searchScript;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The site of the archive, `html/…`, by path. Its canonical links, sitemap and llms.txt name the website's latest
 * documentation (`siteDocs`, D52): the archive is a version kept offline, the website the one place online.
 */
function htmlFiles(o: ArchiveOptions): Map<string, Buffer> {
  const online = (lang: string, id?: string) => siteDocs(lang, id);
  const opts = { ...o, preview: o.preview ?? false, docRevisionNumber: o.revision };
  const files = new Map<string, Buffer>();
  const { pages, sidebars, images } = composePages(opts, htmlStyle);
  const identity = {
    productVersion: o.productVersion,
    revision: o.preview ? 'preview' : o.revision,
    docRevision: o.dirty ? `${o.docRevision}-dirty` : o.docRevision,
    ...(o.buildId ? { buildId: o.buildId } : {}),
    publication: PUBLICATION_URL,
  };
  const twin = (lang: string) => (lang === 'en' ? 'fr' : 'en');
  const written = new Set(pages.map((c) => `${c.lang}/${c.page.id}`));
  for (const c of pages) {
    const title = c.page.title[c.lang];
    files.set(
      `html/${c.lang}/${c.page.id}.html`,
      Buffer.from(
        htmlPage({
          lang: c.lang,
          title,
          body: renderMarkdown(c.markdown),
          nav: renderMarkdown(sidebars[c.lang]),
          root: '../',
          ...(o.preview ? {} : { canonical: online(c.lang, c.page.id) }),
          ...(written.has(`${twin(c.lang)}/${c.page.id}`) ? { twin: `../${twin(c.lang)}/${c.page.id}.html` } : {}),
          identity,
        }),
      ),
    );
  }
  for (const image of images) files.set(`html/assets/${image}`, readFileSync(resolve(o.wikiDir, 'images', image)));
  // The archive's home: both languages' sidebars, linked from the root.
  const rootStyle = (): LinkStyle => ({
    page: (p, l) => `${l}/${p.id}.html`,
    image: (path) => `assets/${path}`,
    home: 'index.html',
  });
  const atRoot = composePages(opts, rootStyle).sidebars;
  files.set(
    'html/index.html',
    Buffer.from(
      htmlPage({
        lang: 'en',
        title: 'Documentation · Documentation',
        body: `<h1>quest'n'click ${xml(o.productVersion)}</h1>\n${LANGS.map(
          (l) =>
            `<section lang="${l}">\n<h2>${l === 'fr' ? 'Français' : 'English'}</h2>\n${renderMarkdown(atRoot[l])}\n</section>`,
        ).join('\n')}`,
        nav: '',
        root: '',
        ...(o.preview ? {} : { canonical: online('en') }),
        identity,
      }),
    ),
  );
  files.set('html/style.css', Buffer.from(STYLE_CSS));
  files.set('html/search.js', searchJs());
  // The search's set: the pages this site shows, as the bundle's index reads them.
  const { index, pages: texts } = indexWiki(o.wikiDir, o.preview ? ['draft', 'ready'] : ['ready']);
  const set: DocsSet = {
    provenance: {
      source: 'bundle',
      productVersion: o.productVersion,
      productCommit: o.productCommit,
      docRevision: identity.docRevision,
      ...(o.buildId ? { buildId: o.buildId } : {}),
      label: `documentation of quest'n'click ${o.productVersion} ${identity.revision}`,
    },
    index,
    pages: texts,
  };
  files.set('html/search-index.json', Buffer.from(formatJson(set)));
  const urls = pages.map((c) => online(c.lang, c.page.id));
  files.set(
    'html/sitemap.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
        online('en'),
        online('fr'),
        ...urls,
      ]
        .map((u) => `<url><loc>${xml(u)}</loc></url>`)
        .join('\n')}\n</urlset>\n`,
    ),
  );
  const audiences = [...new Set(pages.flatMap((c) => c.page.audience))].sort();
  files.set(
    'html/llms.txt',
    Buffer.from(
      `# quest'n'click ${o.productVersion} documentation (${identity.revision})\n\n> Generated from wiki/ at ${identity.docRevision}. Search index: search-index.json (in this archive)\n${audiences
        .map(
          (a) =>
            `\n## ${a}\n\n${pages
              .filter((c) => c.page.audience.includes(a as never))
              .map((c) => `- [${c.page.title[c.lang]}](${online(c.lang, c.page.id)}): ${c.lang}, ${c.page.type}`)
              .join('\n')}\n`,
        )
        .join('')}`,
    ),
  );
  return files;
}

/** Builds the archive in memory: its name, its bytes and its manifest. */
export function buildArchive(o: ArchiveOptions): { name: string; bytes: Buffer; manifest: BundleManifest } {
  if (!REVISION.test(o.revision)) throw new Error(`--revision is r1, r2…: "${o.revision}"`);
  const bundle = bundleContents(o);
  const files = new Map(bundle.files);
  for (const [k, v] of htmlFiles(o)) files.set(k, v);
  const wiki = wikiFiles({
    wikiDir: o.wikiDir,
    manifest: o.manifest,
    preview: o.preview ?? false,
    productVersion: o.productVersion,
    docRevision: bundle.manifest.docRevision,
    productCommit: o.productCommit,
    docRevisionNumber: o.revision,
    ...(o.statuses ? { statuses: o.statuses } : {}),
    ...(o.claims ? { claims: o.claims } : {}),
    ...(o.identifiers ? { identifiers: o.identifiers } : {}),
  });
  for (const [k, v] of wiki) files.set(`wiki/${k}`, v);
  const paths = [...files.keys()].sort();
  const manifest: BundleManifest = {
    ...bundle.manifest,
    docRevisionNumber: o.revision,
    ...(o.preview ? { preview: true as const } : {}),
    files: paths.map((path) => ({ path, sha256: sha256(files.get(path)!), bytes: files.get(path)!.length })),
  };
  // Key order fixed: the identity, then the files.
  const { files: listed, ...identity } = manifest;
  files.set('bundle-manifest.json', Buffer.from(formatJson({ ...identity, files: listed })));
  const bytes = writeTarGz(files);
  // The gzip header's system byte depends on the zlib build: fixed, so the bytes are the same on every system.
  bytes[9] = 255;
  return { name: archiveName(o.productVersion, o.revision, o.preview), bytes, manifest };
}

/**
 * An archive read back and checked: every file listed by `bundle-manifest.json` with its sha256, and no other. Throws
 * saying what does not match: an archive that does not match its manifest is never half used.
 */
export function readArchive(bytes: Buffer): { files: Map<string, Buffer>; manifest: BundleManifest } {
  const files = readTarGz(bytes, READ_BUDGET);
  const raw = files.get('bundle-manifest.json');
  if (!raw) throw new Error('no bundle-manifest.json in the archive');
  const manifest = JSON.parse(raw.toString('utf8')) as BundleManifest;
  if (manifest.format !== 'quest-n-click-docs-bundle' || manifest.version !== 1)
    throw new Error('bundle-manifest.json is not a quest-n-click-docs-bundle of version 1');
  const listed = new Set<string>();
  for (const f of manifest.files) {
    const b = files.get(f.path);
    if (!b) throw new Error(`${f.path}: listed in bundle-manifest.json, missing from the archive`);
    if (sha256(b) !== f.sha256) throw new Error(`${f.path}: its sha256 is not bundle-manifest.json's`);
    listed.add(f.path);
  }
  for (const k of files.keys())
    if (k !== 'bundle-manifest.json' && !listed.has(k))
      throw new Error(`${k}: in the archive, not in bundle-manifest.json`);
  return { files, manifest };
}
