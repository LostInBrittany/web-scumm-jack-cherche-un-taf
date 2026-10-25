// node scripts/check-links.mjs [--timeout=10000]: every external link of the documentation asked once (HEAD, then GET
// when HEAD is refused), the statuses printed by domain, exit 1 on any that is not 2xx or 3xx (4.1.8, docs/418-truth).
// Run by a person before a release, never by CI: the network is not a test. Internal links are tests/docs-links.test.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const asked = Number(process.argv.find((a) => a.startsWith('--timeout='))?.split('=')[1]);
const timeout = Number.isFinite(asked) && asked > 0 ? asked : 10000;
const FILES = [
  'README.md',
  'README.fr.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CREDITS.md',
  'LICENSE-ASSETS',
  'CODE_OF_CONDUCT.md',
];
const DIRS = ['wiki/en', 'wiki/fr', 'docs', '.github'];
// Hosts quoted as a provider's base URL, not as a page: a 4xx from them says nothing about the documentation.
const BASE_HOSTS = new Set(['api.anthropic.com', 'api.mistral.ai', 'api.openai.com']);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(md|yml|yaml)$/.test(e.name)) yield p;
  }
}
const files = [
  ...FILES.map((f) => join(ROOT, f)).filter((f) => statSync(f, { throwIfNoEntry: false })),
  ...DIRS.flatMap((d) => [...walk(join(ROOT, d))]),
];
const where = new Map();
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/https?:\/\/[^\s)<>"'`\]]+/g)) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    if (/\.example\b|\$\{|%7B/.test(url)) continue; // placeholders, templates
    if (!URL.canParse(url)) continue; // a host written as an example (`https://[::1`…), not a link
    if (text[m.index + m[0].length] === '<') continue; // cut by a placeholder (`…/download/v<version>/…`)
    if (/^(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:|$)/.test(new URL(url).host)) continue; // a dev server's address
    if (!where.has(url)) where.set(url, f.slice(ROOT.length + 1));
  }
}
const ask = async (url) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctl.signal });
    if (r.status === 405 || r.status === 403)
      r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctl.signal });
    return r.status;
  } catch (e) {
    return `error: ${e?.cause?.code ?? e?.name ?? e}`;
  } finally {
    clearTimeout(t);
  }
};
const byDomain = new Map();
let bad = 0;
for (const [url, file] of [...where].sort()) {
  const host = new URL(url).host;
  const status = await ask(url);
  const ok = typeof status === 'number' && status < 400;
  const base = BASE_HOSTS.has(host) && !ok;
  if (!ok && !base) bad++;
  (byDomain.get(host) ?? byDomain.set(host, []).get(host)).push(
    `${ok ? '✔' : base ? '○' : '✖'} ${status} ${url}  (${file})`,
  );
}
for (const [host, lines] of [...byDomain].sort()) console.log(`${host}\n  ${lines.join('\n  ')}`);
console.log(
  `${bad ? '✖' : '✔'}  ${where.size} links in ${files.length} files, ${bad} not reachable${[...byDomain.keys()].some((h) => BASE_HOSTS.has(h)) ? ' (○: a provider base URL, not a page)' : ''}`,
);
process.exit(bad ? 1 : 0);
