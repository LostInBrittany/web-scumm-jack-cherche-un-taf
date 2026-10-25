// The archive's client-side search and publication state (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.5), bundled by
// `wiki -- archive` into `html/search.js` (tools/wiki/archive.ts): the very `searchDocs` of tools/wiki/docs.ts that
// MCP's `search_docs` runs, over `html/search-index.json` (the archive's index and pages), so a reader of the site and
// an agent get the same answers. It also reads `publication.json` and says what this revision is to a reader:
// published and current, published but not current (an alias names the current one), or not published (a candidate,
// a preview). The page's HTML says where that record is when this script cannot load it. Browser code only.
import { displayState, type PageIdentity, type PublicationView } from './display';
import { type DocsSet, searchDocs } from './docs';

const body = document.body;
const root = body.dataset.root ?? '';
const lang = body.dataset.lang === 'fr' ? 'fr' : 'en';
const fr = lang === 'fr';
let set: Promise<DocsSet> | undefined;
const load = () => {
  set ??= fetch(`${root}search-index.json`).then((r) => r.json() as Promise<DocsSet>);
  return set;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** A snippet's `**marks**` as `<mark>`, the rest escaped. */
const marked = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>');

async function search(query: string) {
  const results = document.getElementById('results');
  if (!results) return;
  if (!query.trim()) {
    results.innerHTML = '';
    return;
  }
  const out = searchDocs(await load(), { query, lang, limit: 8 });
  if ('note' in out) {
    results.innerHTML = `<p>${fr ? 'Aucune réponse sûre.' : 'No confident match.'}</p>`;
    return;
  }
  results.innerHTML = `<ol>${out.results
    .map(
      (r) =>
        `<li><a href="${root}${r.lang}/${r.id}.html${r.section ? `#${r.section}` : ''}">${esc(r.title)}${r.sectionTitle && r.section ? ` · ${esc(r.sectionTitle)}` : ''}</a><small>${marked(r.snippet)}</small></li>`,
    )
    .join('')}</ol>`;
}

const input = document.getElementById('docs-search') as HTMLInputElement | null;
let timer: ReturnType<typeof setTimeout> | undefined;
input?.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => void search(input.value), 150);
});
document.getElementById('docs-search-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  void search(input?.value ?? '');
});

/** What this revision is, from the publication record (§4.5.1): the archive itself never says it is published. */
async function state() {
  const el = document.getElementById('publication-state');
  const url = body.dataset.publication;
  const page: PageIdentity = {
    version: body.dataset.version ?? '',
    revision: body.dataset.revision ?? '',
    docRevision: body.dataset.docRevision ?? '',
    ...(body.dataset.build ? { buildId: body.dataset.build } : {}),
  };
  if (!el || !url) return;
  try {
    const p = (await (await fetch(url, { cache: 'no-cache' })).json()) as PublicationView;
    const s = displayState(p, page);
    const { version, revision } = page;
    el.textContent =
      s.kind === 'current'
        ? fr
          ? `Documentation publiée et courante : quest'n'click ${version} ${revision}.`
          : `Published and current documentation: quest'n'click ${version} ${revision}.`
        : s.kind === 'published'
          ? fr
            ? `Documentation publiée de la ${version} (${revision}). La courante est la ${s.latest}.`
            : `Published documentation of ${version} (${revision}). The current one is ${s.latest}.`
          : s.kind === 'superseded'
            ? fr
              ? `Révision ${revision} de la ${version} : la révision approuvée est la ${s.approved}.`
              : `Revision ${revision} of ${version}: the approved revision is ${s.approved}.`
            : fr
              ? `Non publiée : construite pour la ${version}, révision ${revision} (un candidat, une pré-version ou un aperçu).`
              : `Not published: built for ${version}, revision ${revision} (a candidate, a pre-release or a preview).`;
  } catch {
    // Offline or from a disk: the static sentence stays, with the record's address.
  }
}
void state();
