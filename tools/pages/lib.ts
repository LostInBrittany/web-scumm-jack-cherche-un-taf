// Shared helpers for the review pages (storyboard, review, placement): game loading, image lookup and thumbnails,
// HTML escaping, the page shell and the persistence snippet (artifact db, else localStorage + Export JSON).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadLayouts } from '../../src/engine/tools/load';
import type { CharacterDef, GameDef, Layout } from '../../src/engine/core/types';
import { GAME, GAME_DIR, ROOT, type GameModule } from '../game';

export { ROOT };

/** Everything a page generator needs about one game. */
export interface PageContext {
  gameId: string;
  gameDir: string;
  mod: GameModule;
  game: GameDef;
  /** Layouts read from games/<id>/layout/*.json (the module's own `layouts` is empty outside Vite). */
  layouts: Record<string, Layout>;
}

/** Builds the context for a game folder. `mod` may be passed in (tests import the module themselves). */
export async function loadContext(opts: { gameDir?: string; mod?: GameModule } = {}): Promise<PageContext> {
  const gameDir = resolve(opts.gameDir ?? GAME_DIR);
  const mod = opts.mod ?? ((await import(pathToFileURL(join(gameDir, 'index.ts')).href)) as GameModule);
  const disk = readLayouts(gameDir);
  // Disk wins; the module's layouts (filled when the module imports its JSON, like the test fixture) fill the gaps.
  const layouts = { ...(mod.layouts ?? {}), ...disk };
  return { gameId: opts.gameDir ? basename(gameDir) : GAME, gameDir, mod, game: mod.game, layouts };
}

function readLayouts(gameDir: string): Record<string, Layout> {
  return loadLayouts(join(gameDir, 'layout'));
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

/** `--out <dir|file.html>` and boolean flags. */
export function cliArgs(argv = process.argv.slice(2)) {
  const flags = new Set(argv.filter((a) => a.startsWith('--') && a !== '--out'));
  const i = argv.indexOf('--out');
  const out = i >= 0 ? argv[i + 1] : undefined;
  const rest = argv.filter((a, k) => !a.startsWith('--') && !(i >= 0 && k === i + 1));
  return { flags, out, rest };
}

/** An explicit `--out file.html` as given; else `name` in `--out <dir>` or dist-pages/, always ending with .html (4.5.0). */
export function outPath(out: string | undefined, name: string): string {
  if (out?.endsWith('.html')) return resolve(out);
  return resolve(out ?? join(ROOT, 'dist-pages'), name.endsWith('.html') ? name : `${name}.html`);
}

const LIMIT_BYTES = 16 * 1024 * 1024;

export function writePage(file: string, html: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  const size = Buffer.byteLength(html);
  const mb = (size / 1024 / 1024).toFixed(2);
  console.log(`${file} (${mb} MB)`);
  if (size > LIMIT_BYTES) console.warn(`warning: ${mb} MB is over the 16 MB artifact limit`);
}

/** True when the file is run directly (tsx tools/pages/x.ts), false when imported (tests). */
export function isMain(metaUrl: string): boolean {
  return !!process.argv[1] && metaUrl === pathToFileURL(resolve(process.argv[1])).href;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON safe to put inside a <script> element. */
export function jsonForScript(v: unknown): string {
  return JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** A database document id: letters, digits and `_ - . ~ : @ +` only. */
export function docId(s: string): string {
  const id = s.replace(/[^A-Za-z0-9_.~:@+-]/g, '_').slice(0, 180);
  return id === '.' || id === '..' || !id ? '_' + id : id;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const IMG_EXT = ['.png', '.webp', '.jpg', '.jpeg', '.gif'];
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

export function isImageFile(f: string): boolean {
  return IMG_EXT.includes(extname(f).toLowerCase());
}

/** An object of a parsed JSON file (an array too: its named fields are then just absent), else undefined. */
const record = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
/** A cached thumbnail size: [w, h]. */
const isSize = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number');

/** A JSON file as parsed, `undefined` when missing or invalid: the caller narrows what it reads. */
function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Source file of an image id, following the same rules as tools/assets.py: `sources.json` overrides, then its
 * `images` / `decors` patterns, then games/<id>/art/<id>.png (any image extension), and finally the prepared
 * public/assets/img/<id>.webp when the game's manifest lists the id (that folder holds the last game prepared).
 */
export function imageSource(gameDir: string, id: string): string | undefined {
  const src = record(readJson(join(gameDir, 'sources.json'))) ?? {};
  const rel = (p: string) => resolve(ROOT, p);
  const ov = record(src.overrides)?.[id];
  if (ov) {
    for (const c of Array.isArray(ov) ? ov : [ov]) {
      const p = typeof c === 'string' ? c : record(c)?.src;
      if (typeof p === 'string' && p && existsSync(rel(p))) return rel(p);
    }
  }
  /** `sources.json` patterns: a string, `{ path }`, or a list of them; anything else is ignored. */
  const pats = (v: unknown): string[] =>
    (Array.isArray(v) ? v : v ? [v] : [])
      .map((x: unknown) => (typeof x === 'string' ? x : record(x)?.path))
      .filter((x): x is string => typeof x === 'string' && x !== '');
  const name = id.startsWith('decor/') ? id.slice(6) : '';
  for (const p of name ? pats(src.decors) : pats(src.images)) {
    const f = rel(p.replace('{name}', name).replace('{id}', id));
    if (existsSync(f)) return f;
  }
  for (const ext of IMG_EXT) {
    const f = join(gameDir, 'art', id + ext);
    if (existsSync(f)) return f;
  }
  const manifest = record(readJson(join(gameDir, 'assets.gen.json')));
  const pub = join(ROOT, 'public/assets/img', id + '.webp');
  if (record(manifest?.images)?.[id] && existsSync(pub)) return pub;
  return undefined;
}

function dataUri(file: string): string {
  const mime = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

let pilOk: boolean | undefined;
function hasPil(): boolean {
  if (pilOk === undefined) {
    try {
      execFileSync('python3', ['-c', 'import PIL'], { stdio: 'ignore' });
      pilOk = true;
    } catch {
      pilOk = false;
    }
  }
  return pilOk;
}

// Batch thumbnailer: one python3 process for the whole list. Trims the transparent border of sprites, fits the
// longest side to `max`, writes WebP. Prints "w h" per file so pages know the proportions.
const PY_THUMBS = `
import json, sys
from PIL import Image
jobs = json.load(sys.stdin)
out = []
for src, dst, mx, trim in jobs:
    try:
        im = Image.open(src)
        im = im.convert('RGBA') if im.mode in ('P', 'LA', 'RGBA', 'PA') or 'transparency' in im.info else im.convert('RGB')
        if trim and im.mode == 'RGBA':
            box = im.getbbox()
            if box: im = im.crop(box)
        k = min(1.0, mx / max(im.width, im.height))
        if k < 1: im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=80, method=4)
        out.append([im.width, im.height])
    except Exception as e:
        out.append(None)
print(json.dumps(out))
`;

export interface Thumb {
  uri: string;
  w: number;
  h: number;
}

/**
 * Thumbnails as data: URIs, longest side ≤ `max` px. Cached in .cache/pages/. Without python3 + Pillow, the source
 * file is embedded as is (pages get bigger) and its size is read from the PNG header when possible.
 */
export function thumbs(files: string[], max: number, opts: { trim?: boolean } = {}): Map<string, Thumb> {
  const res = new Map<string, Thumb>();
  const uniq = [...new Set(files)].filter((f) => existsSync(f));
  const cacheDir = join(ROOT, '.cache/pages');
  const todo: [string, string, number, boolean][] = [];
  const keyOf = (f: string) => {
    const st = statSync(f);
    return createHash('sha1').update(`${f}|${st.size}|${st.mtimeMs}|${max}|${!!opts.trim}`).digest('hex').slice(0, 20);
  };
  const usePil = uniq.length > 0 && hasPil();
  if (usePil) {
    mkdirSync(cacheDir, { recursive: true });
    for (const f of uniq) {
      const k = keyOf(f);
      if (!existsSync(join(cacheDir, k + '.webp')) || !existsSync(join(cacheDir, k + '.json')))
        todo.push([f, join(cacheDir, k + '.webp'), max, !!opts.trim]);
    }
    for (let i = 0; i < todo.length; i += 400) {
      const chunk = todo.slice(i, i + 400);
      const dims = JSON.parse(
        execFileSync('python3', ['-c', PY_THUMBS], { input: JSON.stringify(chunk), maxBuffer: 64 << 20 }).toString(),
      ) as ([number, number] | null)[];
      chunk.forEach(([, dst], j) => writeFileSync(dst.replace(/\.webp$/, '.json'), JSON.stringify(dims[j])));
    }
  }
  for (const f of uniq) {
    if (usePil) {
      const k = keyOf(f);
      const dims = readJson(join(cacheDir, k + '.json'));
      if (isSize(dims)) {
        res.set(f, { uri: dataUri(join(cacheDir, k + '.webp')), w: dims[0], h: dims[1] });
        continue;
      }
    }
    const [w, h] = pngSize(f) ?? [max, max];
    res.set(f, { uri: dataUri(f), w, h });
  }
  return res;
}

function pngSize(f: string): [number, number] | undefined {
  const b = readFileSync(f);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  return undefined;
}

/** Image id a character shows in a list: portrait, else its first idle frame, else any first frame. */
export function charImageId(c: CharacterDef | undefined): string | undefined {
  if (!c) return undefined;
  return c.portrait ?? c.sprites?.idle?.[0] ?? Object.values(c.sprites ?? {})[0]?.[0];
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

/** Colour tokens (dark by default, light when the viewer asks) and the shared controls. */
const BASE_CSS = `
:root { --bg:#14111c; --panel:#1d1828; --panel2:#262036; --line:#3a3150; --ink:#eee8da; --dim:#a69cb6; --accent:#f0c040;
  --accent-ink:#14111c; --ok:#7fd49a; --err:#ff7a7a; --warn:#ffb86b; --field:#0f0c16; --check1:#3a3550; --check2:#2c283e; color-scheme: dark; }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --bg:#f6f3ec; --panel:#ffffff; --panel2:#f0ebe0; --line:#d8cfbf;
  --ink:#231d2c; --dim:#6b6178; --accent:#a86f00; --accent-ink:#ffffff; --ok:#2f8a4c; --err:#c03232; --warn:#a45a00; --field:#ffffff;
  --check1:#e4e0ea; --check2:#d2ccda; color-scheme: light; } }
:root[data-theme="light"] { --bg:#f6f3ec; --panel:#ffffff; --panel2:#f0ebe0; --line:#d8cfbf; --ink:#231d2c; --dim:#6b6178;
  --accent:#a86f00; --accent-ink:#ffffff; --ok:#2f8a4c; --err:#c03232; --warn:#a45a00; --field:#ffffff; --check1:#e4e0ea; --check2:#d2ccda; color-scheme: light; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
h1, h2, h3, p { margin: 0; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
.ps-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 13px; color: var(--dim); }
.ps-bar .ps-state.ok { color: var(--ok); } .ps-bar .ps-state.err { color: var(--err); } .ps-bar .ps-state.warn { color: var(--warn); }
.btn { background: var(--panel2); border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; min-height: 36px; }
.btn:hover, .btn:focus-visible { border-color: var(--accent); outline: none; }
.btn.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; }
textarea, input[type=text], input[type=number], select { background: var(--field); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; }
textarea:focus, input:focus, select:focus { outline: 2px solid var(--accent); border-color: transparent; }
.state { font-size: 12px; color: var(--dim); min-height: 16px; } .state.ok { color: var(--ok); } .state.err { color: var(--err); }
`;

/**
 * Persistence, injected as a <script> in every page. API on `window.PS`:
 *   PS.start({ page, collections, onDoc(col, id, data) })  restores local copies, then connects to the artifact db
 *   PS.save(col, id, data, el?)                            writes (db, and always the local copy); `el` gets the status
 *   PS.all()                                               { col: { id: data } } from the local copy
 *   PS.exportJson(name, value)                             copies to the clipboard and downloads a .json file
 * Modes: "db" (published artifact with the db capability), "local" (plain file: localStorage + Export JSON),
 * "readonly" (db rejects writes: edits stay on this device, Export JSON still works).
 */
const PERSIST_JS = String.raw`
(function () {
  var S = { mode: 'local', db: null, key: '', cols: [], data: {}, onDoc: null };
  var bar = function () { return document.getElementById('ps-state'); };
  function status(text, cls) { var el = bar(); if (el) { el.textContent = text; el.className = 'ps-state' + (cls ? ' ' + cls : ''); } }
  function mark(el, text, cls) { if (!el) return; el.textContent = text; el.className = 'state' + (cls ? ' ' + cls : ''); }
  function loadLocal() { try { var raw = localStorage.getItem(S.key); if (raw) S.data = JSON.parse(raw) || {}; } catch (e) { S.data = {}; } }
  function saveLocal() { try { localStorage.setItem(S.key, JSON.stringify(S.data)); return true; } catch (e) { return false; } }
  function put(col, id, data) { (S.data[col] = S.data[col] || {})[id] = data; }
  async function save(col, id, data, el) {
    data = Object.assign({}, data, { updatedAt: new Date().toISOString() });
    put(col, id, data);
    var local = saveLocal();
    if (S.mode !== 'db') { mark(el, local ? (S.mode === 'readonly' ? 'Kept on this device (read-only)' : 'Saved on this device') : 'Not saved: export it', local ? 'ok' : 'err'); return; }
    mark(el, 'Saving…');
    try { await S.db.doc(col + '/' + id).set(data); mark(el, 'Saved', 'ok'); }
    catch (e) {
      var code = e && e.code;
      if (code === 'invalid_argument' || code === 'not_granted' || code === 'revoked' || code === 'capability_disabled') {
        S.mode = 'readonly';
        status('Read-only here: changes stay on this device. Use Export JSON and paste it in the chat.', 'warn');
        mark(el, 'Kept on this device (read-only)', 'warn');
      } else if (code === 'quota_exceeded') mark(el, 'Not saved: storage full', 'err');
      else mark(el, 'Not saved, try again', 'err');
    }
  }
  function exportJson(name, value) {
    var text = JSON.stringify(value, null, 2);
    try { navigator.clipboard && navigator.clipboard.writeText(text).catch(function () {}); } catch (e) {}
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    } catch (e) {}
    status('Exported ' + name + ' (also copied to the clipboard).', 'ok');
    return text;
  }
  async function start(opts) {
    S.key = 'web-scumm:' + opts.page; S.cols = opts.collections; S.onDoc = opts.onDoc;
    loadLocal();
    S.cols.forEach(function (c) { var m = S.data[c] || {}; Object.keys(m).forEach(function (id) { S.onDoc(c, id, m[id], 'local'); }); });
    status('Saving on this device. Use Export JSON to send your changes.');
    var db = null;
    try { db = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch (e) { db = null; }
    if (!db) return;
    S.db = db; S.mode = 'db';
    status('Connected: every change is saved in the artifact.', 'ok');
    S.cols.forEach(function (c) {
      try {
        db.collection(c).onSnapshot(function (snap) {
          snap.docs.forEach(function (d) { var v = d.data(); if (v) { put(c, d.id, v); S.onDoc(c, d.id, v, 'db'); } });
          saveLocal();
        }, function (e) {
          if (e && (e.code === 'revoked' || e.code === 'not_granted')) { S.mode = 'readonly'; status('Read-only here: changes stay on this device. Use Export JSON.', 'warn'); }
          else status('Connection lost: reload the page.', 'err');
        });
      } catch (e) { status('Connection failed: changes stay on this device.', 'warn'); S.mode = 'local'; }
    });
  }
  window.PS = { start: start, save: save, all: function () { return S.data; }, exportJson: exportJson, mode: function () { return S.mode; }, status: status };
})();
`;

/** A complete document. `body` is trusted HTML (already escaped by the caller). */
export function pageShell(o: {
  title: string;
  description?: string;
  css: string;
  body: string;
  script: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
${o.description ? `<meta name="description" content="${esc(o.description)}">` : ''}
<style>${BASE_CSS}${o.css}</style>
</head>
<body>
${o.body}
<script>${PERSIST_JS}</script>
<script>${o.script}</script>
</body>
</html>
`;
}

/** The status line + Export JSON button every page shows at the top. */
export function persistBar(extra = ''): string {
  return `<div class="ps-bar"><span id="ps-state" class="ps-state">Loading…</span>${extra}<button type="button" class="btn" id="ps-export">Export JSON</button></div>`;
}
