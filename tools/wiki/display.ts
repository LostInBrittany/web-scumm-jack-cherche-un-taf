// What a page of the archive tells its reader about itself (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.1): the
// archive never says it is published; `publication.json` does, and this decides, from it, what one page is. The page
// is matched on everything it knows of itself, the version and revision and also its doc revision and build: an rc's
// archive says "4.5.0 r1" like the final's (the candidate builds from package.json), so version and revision alone
// would call an rc page "published and current" once 4.5.0 ships. Plain data, no DOM: html-search.ts shows it.

export interface PageIdentity {
  version: string;
  revision: string;
  docRevision: string;
  buildId?: string;
}
interface Recorded {
  docRevision: string;
  buildId?: string;
}
export interface PublicationView {
  latest: ({ version: string; revision: string } & Recorded) | null;
  versions: Record<string, { approved: string; revisions: Record<string, Recorded> }>;
}
export type DisplayState =
  | { kind: 'current' }
  | { kind: 'published'; latest: string }
  | { kind: 'superseded'; approved: string }
  | { kind: 'unpublished' };

const same = (a: Recorded | undefined, b: PageIdentity) =>
  Boolean(a) && a!.docRevision === b.docRevision && (a!.buildId ?? '') === (b.buildId ?? '');

export function displayState(p: PublicationView, page: PageIdentity): DisplayState {
  const entry = p.versions?.[page.version];
  // Not this build (an rc, a candidate, a preview, another revision's bytes): never called published.
  if (!same(entry?.revisions[page.revision], page)) return { kind: 'unpublished' };
  const latest = p.latest;
  if (latest && latest.version === page.version && latest.revision === page.revision && same(latest, page))
    return { kind: 'current' };
  if (entry!.approved === page.revision)
    return { kind: 'published', latest: latest ? `${latest.version} ${latest.revision}` : '' };
  return { kind: 'superseded', approved: entry!.approved };
}
