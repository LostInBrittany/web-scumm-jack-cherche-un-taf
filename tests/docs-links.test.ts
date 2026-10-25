// Every relative link in the READMEs, the wiki's pages (wiki/en, wiki/fr: the documentation since 4.5.0) and the
// transition pages left in docs/en and docs/fr points at a file that exists (4.1.7): a moved page or a renamed image
// breaks nothing silently. External links are not fetched; anchors are not checked here (`npm run wiki -- check`
// checks the wiki's, tests/wiki-transition.test.ts the transition pages').
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pages = [
  'README.md',
  'README.fr.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  ...['wiki/en', 'wiki/fr', 'docs/en', 'docs/fr'].flatMap((d) => readdirSync(d).map((f) => `${d}/${f}`)),
];

/** The targets of `[text](target)` and `<img src="target">`, without their anchor. */
const links = (md: string): string[] =>
  [...md.matchAll(/\]\(([^)\s]+)\)|src="([^"]+)"/g)]
    .map((m) => (m[1] ?? m[2])!)
    .filter((t) => !/^(https?:|mailto:|#|data:)/.test(t))
    .map((t) => t.split('#')[0]!)
    .filter(Boolean);

describe('the documentation links to files that exist', () => {
  for (const page of pages)
    it(page, () => {
      const missing = links(readFileSync(page, 'utf8')).filter((t) => !existsSync(resolve(dirname(page), t)));
      expect(missing).toEqual([]);
    });
});
