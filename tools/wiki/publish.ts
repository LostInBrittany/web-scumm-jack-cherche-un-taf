// What `wiki -- check --publish` adds about the source set (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.2 and
// §4.5.3, phase A5): published documentation names exactly one published product. The documentation's revision
// (`--doc-ref`, HEAD by default) descends from the product's (`--product-ref`, a tag or a SHA), and what it changed
// since is documentation only: `wiki/<lang>/*.md`, `wiki/manifest.json`, `wiki/translations.json`,
// `wiki/reviews.json` and images under `wiki/images/`, no code and no generator; both sides of a rename are judged.
// The bootstrap's one exception, a `preview` publication of an unreleased 4.5.0, is refused once a release tag
// `v4.5.0` or later exists, locally or on origin, and refused too when neither can be read: it fails closed.
import { execFileSync } from 'node:child_process';
import { compareVersions } from './docs';
import { SEMVER } from './page';

/**
 * The paths a documentation revision may change after its product's commit (§4.5.2): the pages, the manifest, the
 * translation and review records, and images (by their extension: an image folder is not a place for code).
 */
const DOC_ONLY =
  /^wiki\/((en|fr)\/[^/]+\.md|manifest\.json|translations\.json|reviews\.json|images\/.+\.(png|jpe?g|webp|gif|svg|avif))$/i;
/** The release from which a `preview` publication is refused (§4.5.3). */
const BOOTSTRAP_UNTIL = '4.5.0';

const git = (root: string, args: string[]) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();

/** The full SHA of a ref's commit, or undefined when git does not know it. */
export function commitOf(root: string, ref: string): string | undefined {
  try {
    return git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) || undefined;
  } catch {
    return undefined;
  }
}

/** The product's version at a commit: its `package.json`'s. */
export function versionAt(root: string, commit: string): string | undefined {
  try {
    const v = (JSON.parse(git(root, ['show', `${commit}:package.json`])) as { version?: unknown }).version;
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The source-set rule: the doc revision descends from the product's commit, and the files changed between them are
 * documentation only. Returns the problems, each a sentence.
 */
export function sourceSetProblems(root: string, product: string, doc: string): string[] {
  if (product === doc) return [];
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', product, doc], { cwd: root, stdio: 'ignore' });
  } catch {
    return [`the doc revision ${doc.slice(0, 12)} does not descend from the product commit ${product.slice(0, 12)}`];
  }
  // Every path of every entry, renames and copies split (--no-renames), so a file moved from the code into wiki/ shows
  // as the code file it removes as well as the page it adds.
  const changed = git(root, ['diff', '--no-renames', '--name-status', product, doc])
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => l.split('\t').slice(1));
  const outside = [...new Set(changed.filter((f) => !DOC_ONLY.test(f)))];
  return outside.length
    ? [
        `the doc revision changes ${outside.length} file(s) outside the documentation since the product commit (only wiki/<lang>/*.md, wiki/manifest.json, wiki/translations.json, wiki/reviews.json and images under wiki/images/ may change): ${outside.slice(0, 10).join(', ')}${outside.length > 10 ? '…' : ''}`,
      ]
    : [];
}

const releasesIn = (names: readonly string[]) =>
  names
    .map((t) =>
      t
        .trim()
        .replace(/^refs\/tags\//, '')
        .replace(/\^\{\}$/, ''),
    )
    .filter((t) => t.startsWith('v'))
    .map((t) => t.slice(1))
    .filter((v) => SEMVER.test(v) && !v.includes('-'));

/**
 * The release tags this check can see, and whether it can trust that list: the remote's (`git ls-remote --tags
 * origin 'v*'`) when it answers; otherwise the local ones, trusted only in a full clone that holds at least one
 * release tag (a shallow clone or one without tags proves nothing about what was released).
 */
function releaseTags(root: string): { tags: string[]; trusted: boolean; why?: string } {
  let local: string[] = [];
  let localWhy: string | undefined;
  try {
    local = releasesIn(git(root, ['tag', '-l', 'v*']).split('\n'));
    if (git(root, ['rev-parse', '--is-shallow-repository']) === 'true') localWhy = 'the clone is shallow';
    else if (!local.length) localWhy = 'the clone holds no release tag';
  } catch (e) {
    localWhy = `git tag failed (${(e as Error).message.split('\n')[0]})`;
  }
  let remote: string[] | undefined;
  let remoteWhy: string | undefined;
  try {
    remote = releasesIn(
      git(root, ['ls-remote', '--tags', 'origin', 'v*'])
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split('\t')[1] ?? ''),
    );
  } catch (e) {
    remoteWhy = `origin did not answer (${(e as Error).message.split('\n')[0]})`;
  }
  const tags = [...new Set([...local, ...(remote ?? [])])].sort(compareVersions);
  if (remote) return { tags, trusted: true };
  if (!localWhy) return { tags, trusted: true };
  return { tags, trusted: false, why: `${remoteWhy}, and ${localWhy}` };
}

/**
 * Why a `preview` publication is refused: a release at or after 4.5.0 exists (the bootstrap happens once), or the
 * release tags cannot be read (it fails closed). docs-publish checks out with `fetch-depth: 0` and fetches the tags.
 */
export function previewProblem(root: string): string | undefined {
  const { tags, trusted, why } = releaseTags(root);
  const after = tags.filter((v) => compareVersions(v, BOOTSTRAP_UNTIL) >= 0);
  if (after.length)
    return `--state preview is the bootstrap's one exception (§4.5.3), refused once a release ${BOOTSTRAP_UNTIL} or later exists: v${after.at(-1)} does`;
  if (!trusted)
    return `--state preview is refused: the release tags cannot be read (${why}); fetch them (fetch-depth: 0, tags) so the check can tell whether ${BOOTSTRAP_UNTIL} is released`;
  return undefined;
}
