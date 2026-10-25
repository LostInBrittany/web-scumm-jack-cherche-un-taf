#!/usr/bin/env node
// node tools/rename-org.mjs [--check] (4.5.2 "Org", D51, D52): the repository moved from the user wanoo to the
// Quest-n-Click organization, and the project's site from GitHub Pages (wanoo.github.io/quest-n-click, then briefly
// quest-n-click.github.io, abandoned) to its website, https://quest-n-click.cleverapps.io (the demo under /demo/, the
// latest documentation under /docs/<page id>, /fr/docs/<page id> in French). This script rewrites the addresses in every tracked text file,
// the same way each time:
//   - a page of a version's documentation, …/docs/<v>/[r<n>/]<lang>/<id>.html#<section> (either Pages address) →
//     https://quest-n-click.cleverapps.io/docs/<id>#<section> in English, …/fr/docs/<id>#<section> in French (the
//     site's canonical forms; a link to the website's `/en/docs` loses that prefix too); any other
//     …/docs/… → the docs' index in the address's language, else the file's; …/docs/publication.json → the record
//     in the wiki's repository;
//   - …/studio.html → https://quest-n-click.cleverapps.io/demo/studio.html, and any other page of the old site, the
//     game, → …/demo/…; quest-n-click.github.io alone → the website;
//   - github.com/wanoo/quest-n-click, and `wanoo/quest-n-click` in a `-R` or a repository string (or URL-encoded,
//     `wanoo%2Fquest-n-click`) → Quest-n-Click/…
// It is idempotent: a second run changes nothing. `--check` writes nothing and exits 1 naming each file that still
// holds an old address outside the exceptions (tests/rename-org.test.ts runs it).
// The exceptions keep history true: what was written of a released version (the CHANGELOG, the LOG, the decisions, the
// ADRs, the plans and pass sheets of past releases), the provenance constants of the identities attested before the
// transfer and the tests that name them on purpose, and a few sentences of the wiki that say where things were.
// The former name, wanoo/web-scumm, is not touched: what still names it is history (D47).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Paths kept whole (a folder ends with `/`). */
export const EXCLUDED = [
  'CHANGELOG.md',
  'docs/dev/LOG.md',
  'docs/dev/DECISIONS.md',
  'docs/dev/adr/',
  'docs/dev/passes/',
  'docs/dev/plans/',
  'docs/dev/PLAN-4.5-WIKI.md',
  'tools/rename-org.mjs',
  'tests/rename-org.test.ts',
  'tools/release/provenance.mjs',
  'tests/release-provenance.test.ts',
  'tests/wiki-pages.test.ts',
];

/** Sentences kept as they are inside a file that is otherwise renamed: where the repository and its site were. */
export const KEEP = {
  'wiki/en/install.from-web-scumm.md': ['from\nv4.2.5 to v4.5.1 they name `wanoo/quest-n-click`'],
  'wiki/fr/install.from-web-scumm.md': ['de la v4.2.5 à la v4.5.1, elles nomment `wanoo/quest-n-click`'],
  'wiki/en/install.upgrade-notes-4-2.md': ['from v4.2.5 to v4.5.1 the attestations name\n`wanoo/quest-n-click`'],
  'wiki/fr/install.upgrade-notes-4-2.md': ['de la v4.2.5 à la v4.5.1, les attestations nomment\n`wanoo/quest-n-click`'],
  'wiki/en/install.from-repository.md': ['`github.com/wanoo/quest-n-click` (4.2.5 to 4.5.1)'],
  'wiki/fr/install.from-repository.md': ['`github.com/wanoo/quest-n-click` (de la 4.2.5 à la 4.5.1)'],
  'wiki/en/start.play-online.md': ['`wanoo.github.io/quest-n-click` (4.2.5 to 4.5.1)'],
  'wiki/fr/start.play-online.md': ['`wanoo.github.io/quest-n-click`\n(de la 4.2.5 à la 4.5.1)'],
  'wiki/en/start.what-it-is.md': ['(`wanoo/quest-n-click`, `wanoo/web-scumm`)', 'and `wanoo.github.io/quest-n-click`'],
  'wiki/en/contribute.releasing.md': [
    '`gh attestation verify <file> --owner wanoo --signer-workflow wanoo/quest-n-click/.github/workflows/release.yml`',
  ],
  'wiki/fr/contribute.releasing.md': [
    '`gh attestation verify <file> --owner wanoo --signer-workflow wanoo/quest-n-click/.github/workflows/release.yml`',
  ],
  'tools/wiki/pages.ts': ['were attested by wanoo/quest-n-click, before the transfer', 'then wanoo/quest-n-click.'],
  'tools/release/ship.mjs': ['wanoo/quest-n-click\n    // up to 4.5.1'],
  'tools/field/bundle.ts': ['was attested by wanoo/quest-n-click'],
  'wiki/fr/start.what-it-is.md': ['(`wanoo/quest-n-click`, `wanoo/web-scumm`)', 'et `wanoo.github.io/quest-n-click`'],
};

/** The project's website (D52): the demo at /demo/, the latest documentation at /docs/<page id> (English, unprefixed) and /fr/docs/<page id>. */
export const SITE_URL = 'https://quest-n-click.cleverapps.io';
/** Where docs-publish keeps the publication record now that GitHub Pages is abandoned: the wiki's repository. */
const PUBLICATION_URL = 'https://raw.githubusercontent.com/wiki/Quest-n-Click/quest-n-click/publication.json';

/** What an old address looks like; `renameText` leaves none outside what it keeps. */
export const OLD =
  /quest-n-click\.cleverapps\.io\/en\/docs(?![\w-])|wanoo\.github\.io\/quest-n-click(?![\w-])|(?<![\w.-])(?<!\w\/)quest-n-click\.github\.io(?![\w-])|(?:(?<![\w.-])|(?<=%3A))wanoo(?:\/|%2F)quest-n-click(?![\w-])/;

// Either Pages address: the user's (4.2.5 to 4.5.1) and the organization's (abandoned, 4.5.2, D52); its path to the
// first character a link or a sentence ends with.
const SITE =
  /(https?:\/\/)?(?:(wanoo\.github\.io\/quest-n-click)|(?<![\w.-])(?<!\w\/)(quest-n-click\.github\.io)(\/play)?)(?![\w-])(\/[^\s)"'`<>\]|]*)?/g;
const REPO = /(?:(?<![\w.-])|(?<=%3A))wanoo(\/|%2F)quest-n-click(?![\w-])/g;

/** The website's language prefix: none for English (its canonical form, D52), `/fr` for French. */
const prefix = (lang) => (lang === 'en' ? '' : `/${lang}`);

/** An address of the website that names English with a prefix: `/en/docs` redirects to `/docs`, never written. */
const SITE_EN = /((?:https?:\/\/)?quest-n-click\.cleverapps\.io)\/en\/docs(?![\w-])/g;

/** An old site's address on the website: `scheme` kept or not, `path` after the host (and after /play). */
function onSite(scheme, path, lang, root) {
  const host = scheme ? SITE_URL : SITE_URL.replace(/^https:\/\//, '');
  const trail = /[.,;:]+$/.exec(path)?.[0] ?? '';
  const p = path.slice(0, path.length - trail.length);
  if (/^\/docs(?![\w-])/.test(p)) {
    if (/^\/docs\/publication\.json$/.test(p)) return PUBLICATION_URL + trail;
    // A page of a version's documentation is the same page of the latest one; anything else, the docs' index.
    const page = /^\/docs\/(?:[^/#]+\/)*?(en|fr)\/([\w.-]+?)\.html(#[\w.-]*)?$/.exec(p);
    if (page) return `${host}${prefix(page[1])}/docs/${page[2]}${page[3] ?? ''}${trail}`;
    return `${host}${prefix(/\/(en|fr)(?:\/|$)/.exec(p)?.[1] ?? lang)}/docs${trail}`;
  }
  if (root && !p) return host + trail;
  const rest = p.replace(/^\//, '');
  return `${host}/demo${rest || scheme ? '/' : ''}${rest}${trail}`;
}

/**
 * One text renamed (the parts of it `keep` lists left as they are). `lang`: the language a link to the documentation's
 * index takes when its address names none (the file's).
 */
export function renameText(text, keep = [], lang = 'en') {
  if (keep.length) {
    const at = keep.map((k) => text.indexOf(k)).filter((i) => i >= 0);
    if (at.length) {
      const i = Math.min(...at);
      const k = keep.find((s) => text.indexOf(s) === i);
      return renameText(text.slice(0, i), keep, lang) + k + renameText(text.slice(i + k.length), keep, lang);
    }
  }
  return text
    .replace(SITE, (_m, scheme = '', _user, org, play, path = '') => onSite(scheme, path, lang, Boolean(org) && !play))
    .replace(REPO, (_m, sep) => `Quest-n-Click${sep}quest-n-click`)
    .replace(SITE_EN, '$1/docs');
}

/** The language of a file's documentation links: French under a `fr/` folder or in a `.fr.md`. */
const langOf = (file) => (/(^|\/)fr\/|\.fr\.md$/.test(file) ? 'fr' : 'en');

const excluded = (f) => EXCLUDED.some((e) => (e.endsWith('/') ? f.startsWith(e) : f === e));

/** The tracked text files of a checkout, outside the exceptions. */
function files(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\0')
    .filter((f) => f && !excluded(f));
}

/** Each file whose text the renaming changes: `{ file, before, after }`. */
export function pending(root = '.') {
  const out = [];
  for (const file of files(root)) {
    let before;
    try {
      before = readFileSync(join(root, file), 'utf8');
    } catch {
      continue; // a file deleted in the working tree, a submodule
    }
    if (before.includes('\0') || !OLD.test(before)) continue;
    const after = renameText(before, KEEP[file], langOf(file));
    if (after !== before) out.push({ file, before, after });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const todo = pending();
  for (const { file, after } of todo) {
    if (check) console.error(`✖ ${file}: an address of the repository or the site before the transfer`);
    else writeFileSync(file, after);
  }
  if (check && todo.length) {
    console.error(`✖ ${todo.length} file(s) to rename: node tools/rename-org.mjs`);
    process.exit(1);
  }
  console.log(check ? '✔ no address before the transfer outside the exceptions' : `✔ ${todo.length} file(s) renamed`);
}
