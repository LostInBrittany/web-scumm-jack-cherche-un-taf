// Fails the build if anything from the private origin project leaks into the public repository
// (names of real people, private sheet ids, the private project name). Run with `npm run audit`.
// The blocked words are stored as SHA-1 prefixes so the list itself does not publish them:
// every token (lowercase runs of letters, digits and underscores, plus each underscore-separated part) is hashed and compared.
// A game may allow some of them in its own files (games/<id>/audit-allow.json, tools/audit-allow.ts).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, extname } from 'node:path';
import { allowances } from './audit-allow';
import { GAME } from './game';

const BLOCKED = new Set([
  '08d44dfdb361',
  '26b2d0a2b474',
  '26cf6b5908e1',
  '3cf9f6cebeac',
  '3d5037bb5bc4',
  '418d940643b1',
  '5047ef8d1703',
  '5367ee918d59',
  '5d168a93bf36',
  '677278dbc545',
  '6b25916920cc',
  '7d64adab0714',
  '84e756f78898',
  '8585746e657f',
  '8d88dbaa65d3',
  '992253c015f0',
  'b782cd97b63a',
  'c0838412a687',
  'c6ed141d4cfb',
  'cab02fe2267d',
  'cf7e879d4c9b',
  'd6b8e48afb25',
  'da6220c9a65f',
  'ddcac787f041',
  'e2c3168e5338',
  'e4005f5151d3',
  'e4f59dcae9fc',
  'ef1d271258b6',
  'fad9a0a6f25d',
]);
const ROOTS = [
  'games',
  'public',
  'docs',
  'wiki',
  'src',
  'tools',
  'scripts',
  'tests',
  '.claude',
  'README.md',
  'README.fr.md',
  'CLAUDE.md',
  'CREDITS.md',
  'index.html',
  'package.json',
];
const TEXT = new Set(['.ts', '.js', '.mjs', '.json', '.md', '.html', '.css', '.py', '.yml', '.txt']);
const SKIP = new Set(['node_modules', 'dist', 'dist-pages', '.cache', 'private', '__pycache__']);

const h = (t: string) => createHash('sha1').update(t).digest('hex').slice(0, 12);
function tokens(s: string): string[] {
  const out: string[] = [];
  for (const m of s.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
    out.push(m);
    if (m.includes('_')) out.push(...m.split('_'));
  }
  return out;
}
const allowed = allowances('.', BLOCKED, GAME);
const hit = (s: string, ok: ReadonlySet<string>) =>
  tokens(s).find((t) => {
    const k = h(t);
    return BLOCKED.has(k) && !ok.has(k);
  });

let hits = 0;
function scan(p: string) {
  const st = statSync(p);
  if (st.isDirectory()) {
    if (!SKIP.has(basename(p))) for (const e of readdirSync(p)) scan(join(p, e));
    return;
  }
  const ok = allowed(p);
  const w = hit(p, ok);
  if (w) {
    console.log(`path: ${p} contains a blocked word (${w})`);
    hits++;
  }
  if (!TEXT.has(extname(p))) return;
  readFileSync(p, 'utf8')
    .split('\n')
    .forEach((l, i) => {
      const t = hit(l, ok);
      if (t) {
        console.log(`${p}:${i + 1}: blocked word (${t})`);
        hits++;
      }
    });
}
for (const r of ROOTS) {
  try {
    statSync(r);
    scan(r);
  } catch {
    /* absent */
  }
}
if (hits) {
  console.error(`\naudit: ${hits} leak(s) found`);
  process.exit(1);
}
console.log('audit: clean');
