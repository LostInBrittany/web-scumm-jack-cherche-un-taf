#!/usr/bin/env node
// node tools/release/artifacts.mjs <command> … (4.1.20 PR 3, docs/dev/PLAN-4.1.20-LAST-MILE.md §8.4): the one manifest of
// what a release is made of. Each file says who makes it (a candidate job and the Actions artifact it uploads, or the
// release job), where it sits in the candidate's manifest (`candidate-release/…`), the name the release publishes it
// under, and the SBOM that describes it. candidate.yml, release.yml and `ship verify` are checked against it, so a file
// forgotten or made twice is a failing test, never two YAML files that drifted apart; PR 4's surfaces read it too.
//
//   release-files --tag=<vX.Y.Z> --candidate=<candidate.json>   the names the release publishes, one per line
//   check-release --tag=<vX.Y.Z> --candidate=<candidate.json> --dir=<dir>   those files, and no other, under --dir
//   project --tag=<vX.Y.Z>   the name the tag's files start with: quest-n-click from 4.2.5 (D47), web-scumm before
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { atLeast } from './candidate.mjs';

/** The first release whose files carry the project's new name, quest'n'click (4.2.5, D47); every earlier one keeps
 * `web-scumm-…`, as it was published (its downloads, sums and attestations name those files). */
export const RENAMED = '4.2.5';
/** The line that no longer ships the old package names as aliases (D47): through 4.2.x they are published too. */
export const ALIASES_UNTIL = '4.3.0';

/** The name a release's own files start with (`{proj}`): `quest-n-click` from 4.2.5, `web-scumm` before. */
export const projectOf = (version) => (atLeast(version.replace(/-.*$/, ''), RENAMED) ? 'quest-n-click' : 'web-scumm');

/** The first release whose packages are named under the npm organisation's scope (D53); the archives keep their names. */
export const SCOPED = '4.5.2';

/** The first release whose Remix reports the candidate proves (#291, D55); the release job proved them before. */
export const REMIX_IN_CANDIDATE = '4.5.3';

/**
 * Each package by its archive's name (its npm name from 4.2.5 to 4.5.1, a pointer to `npm` on npm since), its npm
 * name since 4.5.2 (D53, the organisation's scope), the name it had before 4.2.5, and the release that first shipped it.
 */
export const PACKAGES = [
  { name: 'quest-n-click', npm: '@quest-n-click/engine', old: 'web-scumm' },
  { name: 'create-quest-n-click', npm: '@quest-n-click/create', old: 'create-web-scumm' },
  { name: 'quest-n-click-bridge', npm: '@quest-n-click/bridge', old: 'web-scumm-bridge' },
  { name: 'quest-n-click-connectors', npm: '@quest-n-click/connectors', old: 'web-scumm-connectors' },
  {
    name: 'quest-n-click-studio-server',
    npm: '@quest-n-click/studio-server',
    old: 'web-scumm-studio-server',
    since: '4.2.1',
  },
];

/** A package's archive and its SBOM, published under its own name, for the releases `since` (and before `until`). */
function packageEntries(p, { since, until }) {
  const span = { ...(since ? { since } : {}), ...(until ? { until } : {}) };
  return [
    {
      id: `package:${p}`,
      kind: 'package',
      candidate: `pack/${p}-{pkg}.tgz`,
      artifact: 'candidate-pack',
      job: 'pack',
      published: `${p}-{pkg}.tgz`,
      sbom: `${p}-{tag}-sbom.cdx.json`,
      ...span,
    },
    {
      id: `sbom:${p}`,
      kind: 'sbom',
      candidate: `sbom/${p}.cdx.json`,
      artifact: 'candidate-sbom',
      job: 'pack',
      published: `${p}-{tag}-sbom.cdx.json`,
      ...span,
    },
  ];
}

/**
 * Every file of a release. `candidate`: its path in the candidate's manifest (`{pkg}` the package version, `{v}` the
 * version, `*` a run's name), `artifact` and `job` the candidate job that uploads it; `null` when the release job makes
 * it. `published`: its name on the release (`{tag}` the tag, `{proj}` the name the release's files start with). `sbom`:
 * the published SBOM that describes it. `since`: the first release that has it (an older one is judged without it);
 * `until`: the first release that no longer has it.
 */
export const ARTIFACTS = [
  // The packages (4.1.18; the Studio Server since 4.2.1), packed once by the candidate, installed outside the repository
  // on three systems, and their SBOMs (4.1.19), from what each archive holds. Their names since 4.2.5 (D47), and the old
  // names through 4.2.x: before 4.2.5 the packages themselves, from 4.2.5 their aliases (the same files, the old name).
  ...PACKAGES.flatMap(({ name, old, since }) => [
    ...packageEntries(name, { since: RENAMED }),
    ...packageEntries(old, { since, until: ALIASES_UNTIL }),
  ]),
  // The Bridge's qualification image (4.1.19): its archive, its three identities, its SBOM.
  {
    id: 'image:archive',
    kind: 'image',
    candidate: 'image/{proj}-bridge-image.tar',
    artifact: 'candidate-image',
    job: 'image',
    published: '{proj}-bridge-image-{tag}.tar',
    sbom: '{proj}-bridge-image-{tag}-sbom.cdx.json',
  },
  {
    id: 'image:identity',
    kind: 'image',
    candidate: 'image/{proj}-bridge-image.json',
    artifact: 'candidate-image',
    job: 'image',
    published: '{proj}-bridge-image-{tag}.json',
  },
  {
    id: 'image:sbom',
    kind: 'sbom',
    candidate: 'image/{proj}-bridge-image.cdx.json',
    artifact: 'candidate-image',
    job: 'image',
    published: '{proj}-bridge-image-{tag}-sbom.cdx.json',
  },
  // The runs the Remix × Time Attack check wrote (4.1.17), their manifest and the check's report.
  {
    id: 'runs:wsrun',
    kind: 'run',
    candidate: 'wsrun/*.wsrun',
    artifact: 'candidate-release',
    job: 'cross-runtime',
    published: '{proj}-{tag}-*.wsrun',
  },
  {
    id: 'runs:manifest',
    kind: 'run',
    candidate: 'wsrun/wsrun-manifest.json',
    artifact: 'candidate-release',
    job: 'cross-runtime',
    published: '{proj}-{tag}-wsrun-manifest.json',
  },
  {
    id: 'runs:report',
    kind: 'report',
    candidate: 'e2e-remix-speedrun.txt',
    artifact: 'candidate-release',
    job: 'cross-runtime',
    published: '{proj}-{tag}-e2e-remix-speedrun.txt',
  },
  // The candidate's baseline of itself (4.1.19) and its manifest (4.1.17), written by its gate.
  ...['json', 'md'].map((ext) => ({
    id: `baseline:${ext}`,
    kind: 'report',
    candidate: `baseline/baseline-{v}.${ext}`,
    artifact: 'candidate-baseline',
    job: 'candidate-gate',
    published: `{proj}-{tag}-baseline.${ext}`,
  })),
  {
    id: 'candidate:manifest',
    kind: 'report',
    // The manifest lists the files under candidate-release/, never itself.
    candidate: null,
    artifact: 'candidate-manifest',
    job: 'candidate-gate',
    published: '{proj}-{tag}-candidate.json',
  },
  // The built game (4.1.20 PR 4): the very site release-core built and checked, its assets manifest, and the SHA-256 of
  // every file it serves, which the people's passes are bound to (docs/dev/surfaces.json). Before 4.1.20 the release
  // job built its own.
  {
    id: 'game:dist',
    kind: 'game',
    candidate: 'site/dist.tar.gz',
    artifact: 'candidate-site',
    job: 'release-core',
    published: '{proj}-{tag}-dist.tar.gz',
    sbom: '{proj}-{tag}-sbom.cdx.json',
  },
  // The game and the Studio's demo built for the base path /demo/ (4.5.2, D52): what the project's website,
  // quest-n-click.cleverapps.io, downloads from the latest release, checks against the sums (and the attestation) and
  // serves at /demo/, its service worker scoped there. The shape the engine's Pages job built up to 4.5.1.
  {
    id: 'game:web',
    kind: 'game',
    candidate: 'site/web.tar.gz',
    artifact: 'candidate-site',
    job: 'release-core',
    published: '{proj}-{tag}-web.tar.gz',
    sbom: '{proj}-{tag}-sbom.cdx.json',
    since: '4.5.2',
  },
  {
    id: 'game:assets',
    kind: 'game',
    candidate: 'site/assets-manifest.json',
    artifact: 'candidate-site',
    job: 'release-core',
    published: '{proj}-{tag}-assets-manifest.json',
  },
  {
    id: 'game:files',
    kind: 'game',
    candidate: 'site/site-files.json',
    artifact: 'candidate-site',
    job: 'release-core',
    published: '{proj}-{tag}-site-files.json',
  },
  // The surfaces of the people's passes (4.1.20 PR 4, ADR 0024): what each pass is bound to, under the manifest's
  // attestation (written by the gate before the manifest, from the files above).
  {
    id: 'surfaces',
    kind: 'report',
    candidate: 'surfaces/qualification-surfaces.json',
    artifact: 'candidate-surfaces',
    job: 'candidate-gate',
    published: '{proj}-{tag}-surfaces.json',
  },
  // The documentation archive (4.5.0, docs/dev/PLAN-4.5-WIKI.md §4.5.4): the bundle, the rendered site and the wiki of
  // the release's commit, revision r1, built twice by the candidate (its job docs-archive, after release-core, from the
  // candidate's test report); docs-publish promotes this very file after `ship verify`. In the candidate under
  // package.json's version; published under the tag's (an rc's suffix included).
  {
    id: 'docs:archive',
    kind: 'documentation',
    candidate: 'docs/{proj}-docs-{pkg}.tar.gz',
    artifact: 'candidate-docs',
    job: 'docs-archive',
    published: '{proj}-docs-{v}.tar.gz',
    since: '4.5.0',
  },
  // The signing of 4.2's tags rehearsed by the candidate (4.1.20 PR 3b): its report.
  {
    id: 'signing:rehearsal',
    kind: 'report',
    candidate: 'signing/signing-rehearsal.json',
    artifact: 'candidate-signing',
    job: 'signing-rehearsal',
    published: '{proj}-{tag}-signing-rehearsal.json',
  },
  // The Remix catalogues proved (4.1.15, D25): by the release job up to 4.5.2, by the candidate since 4.5.3 (#291, its
  // job remix-proof), the same name on the release either way.
  ...['demo', 'reference'].flatMap((g) => [
    {
      id: `remix:${g}`,
      kind: 'report',
      candidate: `remix/remix-${g}.json`,
      artifact: 'candidate-remix',
      job: 'remix-proof',
      published: `{proj}-{tag}-remix-${g}.json`,
      since: REMIX_IN_CANDIDATE,
    },
    {
      id: `remix:${g}:release`,
      kind: 'report',
      candidate: null,
      job: 'release',
      published: `{proj}-{tag}-remix-${g}.json`,
      until: REMIX_IN_CANDIDATE,
    },
  ]),
  // What the release job makes from the tag's commit: the reference speedrun, verified, and the sums.
  {
    id: 'speedrun:reference',
    kind: 'run',
    candidate: null,
    job: 'release',
    published: '{proj}-{tag}-reference-any.wsrun',
  },
  { id: 'sums', kind: 'sums', candidate: null, job: 'release', published: '{proj}-{tag}-SHA256SUMS' },
];

const fill = (s, { tag, version }) =>
  s
    .replaceAll('{proj}', projectOf(version))
    .replaceAll('{tag}', tag)
    .replaceAll('{v}', version)
    .replaceAll('{pkg}', version.replace(/-.*$/, ''));

/** Whether a release of `version` has an entry (its `since`, its `until`). */
const has = (a, version) => (!a.since || atLeast(version, a.since)) && (!a.until || !atLeast(version, a.until));

/** The version a tag names (`v4.1.20-rc.1` → `4.1.20-rc.1`). */
const versionOfTag = (tag) => {
  if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error(`not a release tag: ${tag}`);
  return tag.slice(1);
};

/** The names of the runs a candidate wrote (`wsrun/run-daily.wsrun` → `run-daily`), from its manifest's files. */
const runsOf = (candidateFiles) =>
  candidateFiles
    .filter((f) => /^wsrun\/[^/]+\.wsrun$/.test(f))
    .map((f) => f.slice('wsrun/'.length, -'.wsrun'.length))
    .sort();

/** The files a candidate's manifest must list for a version (the runs as the manifest names them). */
export function candidateFiles(version, runs) {
  return ARTIFACTS.filter((a) => a.candidate && has(a, version))
    .flatMap((a) =>
      a.candidate.includes('*')
        ? runs.map((r) => fill(a.candidate.replace('*', r), { tag: `v${version}`, version }))
        : [fill(a.candidate, { tag: `v${version}`, version })],
    )
    .sort();
}

/** The names a release publishes for a tag, given the files its candidate's manifest lists. */
export function releaseFiles(tag, candidate) {
  const version = versionOfTag(tag);
  const runs = runsOf(candidate);
  return ARTIFACTS.filter((a) => has(a, version))
    .flatMap((a) =>
      a.published.includes('*')
        ? runs.map((r) => fill(a.published.replace('*', r), { tag, version }))
        : [fill(a.published, { tag, version })],
    )
    .sort();
}

/** What is wrong with a folder of release files against the manifest: each file missing or not in it. */
export function checkRelease(tag, candidate, present) {
  const want = new Set(releaseFiles(tag, candidate));
  const got = new Set(present);
  return [
    ...[...want].filter((f) => !got.has(f)).map((f) => `${f}: missing`),
    ...[...got].filter((f) => !want.has(f)).map((f) => `${f}: not in tools/release/artifacts.mjs`),
  ];
}

/** The first release whose published files must be exactly the manifest's (`ship verify`). */
export const FIRST = '4.1.20';

/**
 * What `ship verify` finds wrong with a published release's files (`files`, downloaded into `dir`): from 4.1.20, each
 * file missing or extra against the manifest, the runs named by the candidate's own manifest the release carries.
 */
export function publishedProblems(tag, files, dir) {
  if (!atLeast(versionOfTag(tag), FIRST)) return [];
  const cand = `${projectOf(versionOfTag(tag))}-${tag}-candidate.json`;
  if (!files.includes(cand)) return [`${cand}: missing (the candidate's manifest names the runs)`];
  return checkRelease(tag, filesOfManifest(join(dir, cand)), files);
}

/** The candidate's manifest's own list of files (`candidate.json`, format web-scumm-candidate). */
export const filesOfManifest = (file) => JSON.parse(readFileSync(file, 'utf8')).artifacts.map((a) => a.name);

const flag = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const tag = flag('tag');
  const cand = flag('candidate');
  // The name this tag's files start with (4.2.5, D47), for release.yml.
  if (cmd === 'project' && tag) console.log(projectOf(versionOfTag(tag)));
  else if ((cmd === 'release-files' || cmd === 'check-release') && tag && cand && existsSync(cand)) {
    if (cmd === 'release-files') console.log(releaseFiles(tag, filesOfManifest(cand)).join('\n'));
    else {
      const dir = flag('dir') ?? '.';
      const ours = new Set(
        ARTIFACTS.map((a) =>
          fill(a.published, { tag, version: versionOfTag(tag) })
            .split(tag)[0]
            .replace(/\d.*$/, ''),
        ),
      );
      // The folder holds more than the release (the checkout): only names that start as one of ours are judged.
      const present = readdirSync(dir).filter((f) => [...ours].some((p) => f.startsWith(p)) && releaseLike(f, tag));
      const bad = checkRelease(tag, filesOfManifest(cand), present);
      for (const b of bad) console.error(`✖  ${b}`);
      if (!bad.length) console.log(`✔  ${present.length} files, as tools/release/artifacts.mjs lists them for ${tag}`);
      process.exit(bad.length ? 1 : 0);
    }
  } else {
    console.error(
      'usage: node tools/release/artifacts.mjs <release-files|check-release> --tag= --candidate= [--dir=] | project --tag=',
    );
    process.exit(2);
  }
}

/** A file name of this tag's release: the tag, the package version (an archive) or the version (the docs), in it. */
function releaseLike(f, tag) {
  const v = versionOfTag(tag);
  return f.includes(tag) || f.includes(`-${v.replace(/-.*$/, '')}.tgz`) || f.endsWith(`-docs-${v}.tar.gz`);
}
