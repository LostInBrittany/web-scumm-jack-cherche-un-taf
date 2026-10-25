// The links of every output the wiki builds (4.5.1, the maintainer's wiki audit of 24 Oct 2026, findings F01–F03):
// the scanner that rewrites links for the build and reads them for the check must see a link whose label is written as
// code (`[`src/x.ts`](../../src/x.ts)`), and the outputs themselves are read back by a second, independent reader, so
// a blind spot shared by the build and the check cannot pass unseen. The published 4.4.0 r1 wiki kept 2,472 repository
// links relative (a 404 on GitHub) and 84 page links as `<id>.md` (GitHub sends them to Home with a 200): each of those
// 2,556 occurrences, recorded by the audit, must now reach its file at the product commit or its page and section.
import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildArchive, readArchive } from '../tools/wiki/archive';
import { readManifest } from '../tools/wiki/manifest';
import { mapPage, parsePage } from '../tools/wiki/page';

const REPO = 'https://github.com/Quest-n-Click/quest-n-click';
const COMMIT = 'c'.repeat(40);

/** What the build's scanner hands `replace`: the targets of the links of a text, in order. */
const targets = (markdown: string): string[] => {
  const seen: string[] = [];
  mapPage(
    markdown,
    (l) => {
      seen.push(l.target);
      return undefined;
    },
    () => '',
  );
  return seen;
};

describe('the link scanner reads a label written as code (F03)', () => {
  // The audit's probe (parser-probe.json): the second and third were not seen at all.
  it.each([
    ['[source](../../src/studio/music.ts)', ['../../src/studio/music.ts']],
    ['[`src/studio/music.ts`](../../src/studio/music.ts)', ['../../src/studio/music.ts']],
    [
      '[`STUDIO_SESSION_KEY`](reference.environment-variables.md#studio-session-key)',
      ['reference.environment-variables.md#studio-session-key'],
    ],
    // A mixed label: text, code and emphasis.
    ['see [the `save.ts` *module*](../../src/engine/core/save.ts) first', ['../../src/engine/core/save.ts']],
    // A code span holding a bracket does not close the label.
    ['[`a]b`](../../src/a.ts)', ['../../src/a.ts']],
    // A clickable image: the image first, then the outer link.
    ['[![`shot`](../images/a.png)](../../src/a.ts)', ['../images/a.png', '../../src/a.ts']],
    // Two links on a line, one of them with code.
    ['[`x`](a.md) and [y](b.md)', ['a.md', 'b.md']],
    // A label breaking across a line of its paragraph.
    ['a [label with `code`\nacross a line](../../src/a.ts) here', ['../../src/a.ts']],
  ])('%s', (input, want) => {
    expect(targets(input)).toEqual(want);
  });

  it.each([
    // A link written inside a code span is an example, not a link.
    '`[a](b.md)`',
    '``[`a`](b.md)``',
    // A code span opened in the label and closed after the bracket wins over the link (CommonMark precedence).
    '[a `b](c.md)` d',
    // An escaped bracket opens nothing.
    '\\[a](b.md)',
  ])('%s is not a link', (input) => {
    expect(targets(input)).toEqual([]);
  });

  it('the check reads the same links: a repository file and a page behind a code label', () => {
    const page = parsePage(
      [
        '<a name="a"></a>',
        '## A',
        '',
        'Read [`src/engine/core/save.ts`](../../src/engine/core/save.ts) and [`STUDIO_DATABASE_URL`](reference.environment-variables.md#studio-database-url).',
      ].join('\n'),
      'en',
    );
    expect(page.repoLinks.map((l) => l.path)).toEqual(['src/engine/core/save.ts']);
    expect(page.links).toEqual([{ id: 'reference.environment-variables', anchor: 'studio-database-url', line: 4 }]);
  });

  it('the check refuses a bad target behind a code label, as it does behind a plain one', () => {
    const page = parsePage('<a name="a"></a>\n## A\n\n[`x`](src/x.ts)', 'en');
    expect(page.problems.join('\n')).toMatch(/resolves to wiki\/en\/src\/x\.ts/);
  });
});

/**
 * The independent reader (the audit's): every `[label](target)` or `![label](target)` outside fenced code whose start
 * is not inside a code span. A regular expression, not the project's scanner, so the two cannot share a blind spot.
 */
function independentLinks(markdown: string): { label: string; target: string }[] {
  const insideCode = (s: string, pos: number) => {
    for (let i = 0; i < s.length; ) {
      if (s[i] !== '`') {
        i++;
        continue;
      }
      let k = 1;
      while (s[i + k] === '`') k++;
      let end = -1;
      for (let j = i + k; j < s.length; ) {
        if (s[j] !== '`') {
          j++;
          continue;
        }
        let n = 1;
        while (s[j + n] === '`') n++;
        if (n === k) {
          end = j;
          break;
        }
        j += n;
      }
      if (end < 0) {
        i += k;
        continue;
      }
      if (pos >= i && pos < end + k) return true;
      i = end + k;
    }
    return false;
  };
  const out: { label: string; target: string }[] = [];
  let fence: string | undefined;
  for (const line of markdown.split('\n')) {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = undefined;
      continue;
    }
    if (mark) {
      fence = mark;
      continue;
    }
    for (const m of line.matchAll(/!?\[((?:[^\][]|\[[^\]]*\]\([^)]*\))+)\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g))
      if (!insideCode(line, m.index)) out.push({ label: m[1]!, target: m[2]! });
  }
  return out;
}

describe('every output of the real wiki links to what exists (F01, F02)', () => {
  let files: Map<string, Buffer>;
  const manifest = readManifest(resolve('wiki')).manifest!;
  beforeAll(() => {
    const built = buildArchive({
      root: resolve('.'),
      wikiDir: resolve('wiki'),
      manifest,
      productVersion: '4.5.1',
      productCommit: COMMIT,
      docRevision: 'd'.repeat(40),
      revision: 'r1',
      buildId: '1',
    });
    files = readArchive(built.bytes).files;
  }, 60_000);
  const text = (path: string) => files.get(path)!.toString('utf8');
  const under = (prefix: string, ext: string) =>
    [...files.keys()].filter((p) => p.startsWith(prefix) && p.endsWith(ext));
  const external = (t: string) => /^(https?:|mailto:)/.test(t);
  /** A relative target read from `from`, its anchor dropped: the archive path it reaches, or undefined above the root. */
  const reach = (from: string, target: string) => {
    const path = decodeURI(target.split('#')[0]!);
    const joined = posix.normalize(posix.join(posix.dirname(from), path));
    return joined.startsWith('..') ? undefined : joined;
  };

  it('the GitHub wiki: no relative repository path, no <id>.md page link; a page link names a published page', () => {
    const pages = new Set(under('wiki/', '.md').map((p) => posix.basename(p, '.md')));
    const images = new Set(under('wiki/images/', '').map((p) => p.slice('wiki/'.length)));
    const bad: string[] = [];
    for (const path of under('wiki/', '.md'))
      for (const { label, target } of independentLinks(text(path))) {
        if (external(target) || target.startsWith('#')) continue;
        const stem = target.split('#')[0]!;
        if (pages.has(stem) || images.has(stem)) continue;
        bad.push(`${path}: [${label}](${target})`);
      }
    expect(bad.slice(0, 20)).toEqual([]);
    expect(bad).toHaveLength(0);
  });

  it('the bundle (md/, legacy/): every relative target is a file of the archive', () => {
    const bad: string[] = [];
    for (const path of [...under('md/', '.md'), ...under('legacy/', '.md')])
      for (const { label, target } of independentLinks(text(path))) {
        if (target.startsWith('#')) continue;
        if (external(target)) continue;
        const to = reach(path, target);
        if (!to || !files.has(to)) bad.push(`${path}: [${label}](${target})`);
      }
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it('the HTML: every relative href and src is a file of the archive', () => {
    const bad: string[] = [];
    for (const path of under('html/', '.html'))
      for (const m of text(path).matchAll(/\s(?:href|src)="([^"]*)"/g)) {
        const target = m[1]!.replace(/&amp;/g, '&');
        if (!target || target.startsWith('#') || external(target)) continue;
        const to = reach(path, target);
        const file = to?.endsWith('/') ? `${to}index.html` : to;
        if (!file || !files.has(file)) bad.push(`${path}: ${target}`);
      }
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it('each of the 2,556 occurrences the audit recorded now reaches its file or its page and section', () => {
    const audit = JSON.parse(readFileSync(resolve('tests/fixtures/wiki/audit-2026-10-24-links.json'), 'utf8')) as {
      links: [string, string, string, string, number][];
    };
    expect(audit.links.reduce((n, l) => n + l[4], 0)).toBe(2556);
    const urlOf = new Map(
      manifest.pages.flatMap((p) => [[`en/${p.id}`, p.url.en] as const, [`fr/${p.id}`, p.url.fr] as const]),
    );
    const missing: string[] = [];
    for (const [type, page, label, destination] of audit.links) {
      const lang = page.startsWith('FR-') ? 'fr' : 'en';
      const hash = destination.indexOf('#');
      const anchor = hash < 0 ? '' : destination.slice(hash);
      const rel = hash < 0 ? destination : destination.slice(0, hash);
      let want: string;
      if (type === 'repo-relative-not-rewritten') {
        // A folder is linked without its trailing slash: GitHub sends `blob/<commit>/<folder>` to its tree.
        const path = posix.normalize(posix.join(`wiki/${lang}`, rel)).replace(/\/$/, '');
        want = `${REPO}/blob/${COMMIT}/${path}${anchor}`;
      } else {
        const id = rel.replace(/^\.\//, '').replace(/\.md$/, '');
        want = `${urlOf.get(`${lang}/${id}`)}${anchor}`;
      }
      const file = `wiki/${lang}/${page}.md`;
      const links = files.has(file) ? independentLinks(text(file)) : [];
      if (!links.some((l) => l.label === label && l.target === want)) missing.push(`${page}: [${label}] → ${want}`);
      if (links.some((l) => l.target === destination)) missing.push(`${page}: [${label}](${destination}) survives`);
    }
    expect(missing.slice(0, 20)).toEqual([]);
    expect(missing).toHaveLength(0);
  });
});
