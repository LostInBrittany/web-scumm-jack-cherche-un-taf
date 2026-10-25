// Where `npm run upgrade-check -- --from=…` takes the older engine (4.1.17): `previous`, a path to a tarball, or a
// published version. A version may be written with or without its `v` (`--from=v4.1.15` built `vv4.1.15` and asked
// for `web-scumm-v4.1.15.tgz` before 4.1.17), and a pre-release's tarball carries package.json's version without the
// suffix (v4.1.16-rc.2 ships web-scumm-4.1.16.tgz). From 4.2.5 (D47) a release's own files are named quest-n-click-…;
// every earlier one keeps its web-scumm-… names (GitHub serves them under the repository's new name too).
import { projectOf } from '../tools/release/artifacts.mjs';

/** `{ kind: 'previous' }`, `{ kind: 'tgz', path }` or `{ kind: 'release', tag, asset, version }`; throws otherwise. */
export function upgradeSource(from, exists) {
  if (!from) throw new Error('--from=<version | previous | quest-n-click-x.y.z.tgz> is required');
  if (from === 'previous') return { kind: 'previous' };
  if (from.endsWith('.tgz') || exists(from)) {
    if (!exists(from)) throw new Error(`${from}: no such tarball`);
    return { kind: 'tgz', path: from };
  }
  const v = from.replace(/^v/, '');
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/.test(v))
    throw new Error(`--from=${from}: not a version, "previous" or a .tgz`);
  const pkg = v.replace(/-.*$/, '');
  return { kind: 'release', tag: `v${v}`, asset: `${projectOf(pkg)}-${pkg}.tgz`, version: v };
}

/**
 * The SHA-256 a release's sums file gives an asset (4.1.19: the older engine is checked against its release's own
 * `<name>-<tag>-SHA256SUMS`, never trusted because a URL answered). Throws when the file does not name it once.
 */
export function sumFor(sums, asset) {
  const found = String(sums)
    .split(/\r?\n/)
    .map((l) => /^([0-9a-f]{64}) [ *]?(.+)$/.exec(l.trim()))
    .filter((m) => m && m[2] === asset);
  if (found.length !== 1)
    throw new Error(`${asset}: ${found.length ? 'named twice' : 'not named'} in the release's sums`);
  return found[0][1];
}

/** The sums file of a release tag (`v4.1.16`, `v4.1.18-rc.1`). */
export const sumsAsset = (tag) => `${projectOf(tag.replace(/^v/, ''))}-${tag}-SHA256SUMS`;

/**
 * The SHA-256 of the older engines the candidate creates games on (4.1.19, plan §7.4), written here once read from
 * their releases: the release's sums file is the same host as the tarball (integrity), this list is not (a release
 * changed after the fact is refused).
 */
export const KNOWN_ENGINES = {
  'v4.1.16': 'bcebeeb68ef85efa0866442f4fd9085be6cceb5f7fefa1cdd88d1e1e9b9feb9b',
  'v4.1.17': 'eb63041433fb1af65a9faad928488ead74a963c5ba06ca3027cbca5c644a995c',
  'v4.1.18-rc.1': 'bbe54b8593ff4fb09bb0091633805ed47cfad6e7c02eaddaa65afcb37b478836',
};
