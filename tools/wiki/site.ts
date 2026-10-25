// The project's website (4.5.2, D52), https://quest-n-click.cleverapps.io (the repository Quest-n-Click/quest-n-click-site,
// on Clever Cloud): the latest documentation at `/docs/<page id>` (English) and `/fr/docs/<page id>`, the demo and the Studio's demo at `/demo/`.
// There is no versioned documentation online any more (GitHub Pages' `/docs/<v>/r<n>/` is abandoned): a version's
// documentation is its release's archive, `quest-n-click-docs-<v>.tar.gz`.

const SITE_URL = 'https://quest-n-click.cleverapps.io';

/**
 * A page of the website's latest documentation, or its index without an id: English unprefixed (`/docs/<id>`, the
 * site's canonical form; `/en/docs/…` redirects there), French under `/fr/docs/<id>`; `#<section>` when given.
 */
export const siteDocs = (lang: string, id?: string, section?: string) =>
  `${SITE_URL}${lang === 'en' ? '' : `/${lang}`}/docs${id ? `/${id}` : ''}${section ? `#${section}` : ''}`;
