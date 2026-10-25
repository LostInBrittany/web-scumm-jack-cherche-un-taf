// Every npm script has a line in the wiki's `reference.npm-scripts` (wiki/en/reference.npm-scripts.md and
// wiki/fr/reference.npm-scripts.md since 4.5.0; docs/en|fr/TOOLS.md from 4.1.7): a script nobody documents is a script
// nobody can find.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scripts = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>);

describe('every npm script is documented', () => {
  for (const page of ['wiki/en/reference.npm-scripts.md', 'wiki/fr/reference.npm-scripts.md'])
    it(page, () => {
      const md = readFileSync(page, 'utf8');
      const missing = scripts.filter(
        (s) => !new RegExp(`(npm run (-s )?|npm |\`|, )${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\b|\`)`).test(md),
      );
      expect(missing).toEqual([]);
    });
});
