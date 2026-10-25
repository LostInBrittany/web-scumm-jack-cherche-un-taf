// The Studio's Assets tab, server side (wiki/en/studio.assets.md#assets-tab): every image and sound of the game with where
// it is used, the art prompts per sheet, and the uploads (a generated sheet cut by tools/cut-sheet.py, one cell, a
// decor, a sound), never deleting anything: a replaced file is first kept as `<name>_v<N>.<ext>` next to it. Since
// 4.2.1 every upload is one operation of the game's journal (studio.writeFiles): the backups, the new files and the
// cells a tool cut are written together or not at all, and a tool never writes into the game folder itself.
// `assetsMiddleware` is mounted by the dev server at /__studio/api/assets (tools/studio/plugin.ts).
import {
  closeSync,
  createReadStream,
  openSync,
  readSync,
  realpathSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import type { GameDef } from '../../src/engine/core/types';
import { imageSource } from '../pages/lib';
import { buildPrompts } from '../prompts';
import { collectRefs } from '../refs';
import { StudioError, type Studio } from '../../studio-server/src/ops/core';
import { CutFailed, cutOnCopy, type CutRequest, imageType, run } from './cut';
import type {
  AssetCell,
  AssetDecor,
  AssetPrompt,
  AssetSheet,
  AssetSheetKind,
  AssetsListing,
  CellReplace,
  CellReplaceResult,
  DecorUpload,
  PrepareResult,
  SheetUpload,
  SheetUploadResult,
  SoundUpload,
  UploadResult,
} from './types';

const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const AUDIO_EXT = ['.ogg', '.mp3', '.wav', '.m4a', '.flac', '.aac', '.opus', '.webm'];
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.opus': 'audio/ogg',
  '.webm': 'audio/webm',
  '.mp4': 'video/mp4',
};
/** The type an image or sound of the game is served with. */
export const mimeOf = (file: string) => MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
const BACKUP = /_v\d+$/;
const SHEET_ID = /^[A-Za-z0-9][\w-]*$/;
const CELL_ID = /^[\w-]+(\/[\w-]+)*$/;
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
const uniq = <T>(a: T[]) => [...new Set(a)];
const stem = (f: string) => f.slice(0, f.length - extname(f).length);

// ------------------------------------------------------------------ small file helpers

/** Whether `file`, its links followed, is inside `dir` (also its links followed). */
function inside(dir: string, file: string): boolean {
  try {
    return realpathSync(file).startsWith(realpathSync(dir) + sep);
  } catch {
    return false;
  }
}

/** Pixel size from the file header (PNG, JPEG, WebP, GIF); [0, 0] when unknown. */
export function imageSize(file: string): [number, number] {
  // The header is near the start: the first 64 KiB are read, never a whole (possibly huge) file.
  let b: Buffer;
  let fd: number | undefined;
  try {
    fd = openSync(file, 'r');
    const head = Buffer.alloc(64 * 1024);
    b = head.subarray(0, readSync(fd, head, 0, head.length, 0));
  } catch {
    return [0, 0];
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (chunk === 'VP8L') {
      const v = b.readUInt32LE(21);
      return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
    }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return [0, 0];
}

/** Base64 (a data URL is accepted) → bytes. */
function decode(data: unknown): Buffer {
  if (typeof data !== 'string' || !data) throw new StudioError('`data` (base64) is required');
  const b = Buffer.from(data.replace(/^data:[^,]*,/, ''), 'base64');
  if (!b.length) throw new StudioError('`data` is empty or not base64');
  return b;
}

const mtime = (f: string) => {
  try {
    return Math.round(statSync(f).mtimeMs);
  } catch {
    return 0;
  }
};
const fresh = (src: string, dst: string) => existsSync(dst) && mtime(dst) >= mtime(src);

/** `<stem>_v1.<ext>`… next to a file, in version order. */
function backupsOf(file: string): string[] {
  const dir = dirname(file);
  if (!existsSync(dir)) return [];
  const base = stem(file.slice(dir.length + 1));
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_v(\\d+)\\.\\w+$`);
  return readdirSync(dir)
    .filter((f) => re.test(f))
    .sort(natural)
    .map((f) => join(dir, f));
}

/**
 * The next free `<stem>_v<N><ext>` of `file`, counting the backups already on disk and those this operation plans
 * (`planned`, which it extends): a backup is a file of the operation, written with the rest.
 */
function nextBackup(file: string, planned: Set<string>): string {
  const num = (f: string) => Number(/_v(\d+)\.\w+$/.exec(f)![1]);
  const base = stem(file.slice(dirname(file).length + 1));
  const mine = [...planned].filter(
    (f) => dirname(f) === dirname(file) && stem(f.slice(dirname(f).length + 1)).startsWith(`${base}_v`),
  );
  const n = Math.max(0, ...backupsOf(file).map(num), ...mine.map(num)) + 1;
  const to = join(dirname(file), `${base}_v${n}${extname(file)}`);
  planned.add(to);
  return to;
}

/** Image files under a folder, relative (talk kits nest one folder per pose), without hidden, `_` and backup files. */
function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir).sort(natural)) {
    if (f.startsWith('.') || f.startsWith('_')) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p, `${prefix}${f}/`));
    else if (IMG_EXT.includes(extname(f).toLowerCase()) && !BACKUP.test(stem(f))) out.push(prefix + f);
  }
  return out;
}

// ------------------------------------------------------------------ where each image and sound is used

type Seg = string | number;
/** Command-list keys, left out of a "where" (`rules.on`, not `rules.on.do`). */
const CMD_LISTS = new Set(['do', 'then', 'else', 'once', 'cutscene', 'after']);

/** A short "where": `cast.grandpa.walk`, `items.key`, `house.props.pantry`, `house.minigame.pipes`, `skin.map`… */
function where(game: GameDef, segs: Seg[], minigame?: string): string {
  const s = segs.filter((x): x is string => typeof x === 'string');
  if (segs[0] === 'rooms' && typeof segs[1] === 'number') {
    const room = game.rooms[segs[1]]?.id ?? String(segs[1]);
    const rest = segs.slice(2);
    if (rest[0] === 'props' || rest[0] === 'actors' || rest[0] === 'hotspots') return `${room}.${rest[0]}.${rest[1]}`;
    if (minigame) return `${room}.minigame.${minigame}`;
    return `${room}.${String(rest[0] ?? 'room')}`;
  }
  if (segs[0] === 'characters') {
    const [, cid, k, a, b] = segs;
    if (k === 'sprites') return `cast.${cid}.${a}`;
    if (k === 'mouths') return `cast.${cid}.mouths.${a}`;
    if (k === 'variants')
      return `cast.${cid}.variant${Number(a) + 1}.${b === 'sprites' || b === 'mouths' ? `${b === 'mouths' ? 'mouths.' : ''}${segs[5]}` : String(b)}`;
    return `cast.${cid}.${String(k)}`;
  }
  if (segs[0] === 'items') return `items.${segs[1]}`;
  if (segs[0] === 'skin') return `skin.${s[s.length - 1]}`;
  if (minigame) return `${s[0]}.minigame.${minigame}`;
  return s
    .filter((x) => !CMD_LISTS.has(x))
    .slice(0, segs[0] === 'map' ? 3 : 2)
    .join('.');
}

/** Image id → where it is used; sound `<kind>:<id>` → the places that play it. One walk over the game's data. */
function usage(game: GameDef, images: Set<string>, extra: string[], sfx: Set<string>, music: Set<string>) {
  const img = new Map<string, string[]>();
  const snd = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, w: string) => {
    const l = m.get(k) ?? [];
    if (!l.includes(w)) l.push(w);
    m.set(k, l);
  };
  const visit = (v: unknown, segs: Seg[], mg: string | undefined, key: string | undefined) => {
    if (typeof v === 'string') {
      if (images.has(v)) add(img, v, where(game, segs, mg));
      if (key === 'sfx' && sfx.has(v)) add(snd, `sfx:${v}`, where(game, segs, mg));
      if (key === 'music' && music.has(v) && segs[0] !== 'skin') add(snd, `music:${v}`, where(game, segs, mg));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => visit(x, [...segs, i], mg, key));
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const here = typeof o.minigame === 'string' ? o.minigame : mg;
    for (const [k, x] of Object.entries(o)) {
      if (segs.length === 0 && k === 'audio') continue;
      // { music: { push: id } } and { music: { once: id } } play `id` too.
      visit(x, [...segs, k], here, k === 'push' || k === 'once' ? key : k);
    }
  };
  visit(game, [], undefined, undefined);
  for (const id of extra) if (images.has(id)) add(img, id, 'extraImages');
  return { img, snd };
}

// ------------------------------------------------------------------ prompts, split per sheet

/** The section of `npm run prompts` whose heading names this sheet (`#### Base sheet \`hero\``, `### Objects \`items\``…). */
function section(md: string, id: string): string | undefined {
  const lines = md.split('\n');
  const tag = `\`${id}\``;
  let at = -1;
  let level = 0;
  for (const want of [4, 3]) {
    at = lines.findIndex((l) => l.startsWith(`${'#'.repeat(want)} `) && l.includes(tag));
    if (at >= 0) {
      level = want;
      break;
    }
  }
  if (at < 0) return undefined;
  let end = at + 1;
  const stop = new RegExp(`^#{1,${level}} `);
  while (end < lines.length && !stop.test(lines[end])) end++;
  return lines.slice(at, end).join('\n').trim();
}

function styleBlock(md: string): string {
  const i = md.indexOf('## Style block');
  if (i < 0) return '';
  const j = md.indexOf('\n## ', i + 3);
  return md.slice(i, j < 0 ? undefined : j).trim();
}

const gridOf = (markdown: string | undefined) => {
  const m = markdown && /\((\d+) × (\d+)/.exec(markdown.split('\n')[0]);
  return m ? `${m[1]}x${m[2]}` : undefined;
};

// ------------------------------------------------------------------ the assets of one game

/**
 * `publicAssets`: where the prepared images and sounds are (default `<root>/public/assets`); a hosted Studio serves its
 * latest prepared set from its own folder (4.2.3).
 */
export function createAssets(studio: Studio, o: { publicAssets?: () => string; confine?: boolean } = {}) {
  const dir = studio.gameDir;
  const root = studio.root;
  const artDir = join(dir, 'art');
  const audioDir = join(dir, 'audio');
  const pubOf = o.publicAssets ?? (() => join(root, 'public', 'assets'));
  let pub = pubOf();
  const rel = (f: string) => relative(dir, f).split(sep).join('/');
  /** A file of the operation being built: its path in the game and its whole new content (`null` removes it). */
  type Out = { path: string; after: Buffer | null };
  /** Keeps `file` as its next backup, as a file of the operation. */
  const keep = (file: string, planned: Set<string>): Out => ({
    path: rel(nextBackup(file, planned)),
    after: readFileSync(file),
  });
  /** A scratch folder outside the game, removed after `fn`. */
  async function scratch<T>(fn: (tmp: string) => Promise<T>): Promise<T> {
    const tmp = join(root, '.cache', 'studio', `work-${process.pid}-${Date.now().toString(36)}`);
    mkdirSync(tmp, { recursive: true });
    try {
      return await fn(tmp);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  /** Runs a cut on a scratch copy of `art/<sheet>/` (cut.ts): its files as files of the operation, under `art/`. */
  async function cutCopy(tmp: string, source: string, req: CutRequest) {
    try {
      const out = await cutOnCopy({
        tmp,
        artDir,
        source,
        req,
        engine: root,
        env: { ...process.env, GAME: studio.gameId, GAME_DIR: dir },
      });
      return { ...out, files: out.files.map((f): Out => ({ path: `art/${f.path}`, after: f.bytes })) };
    } catch (e) {
      throw e instanceof CutFailed ? new StudioError(e.message, 500) : e;
    }
  }

  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T> | T): Promise<T> => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => undefined);
    return p;
  };

  /** The source file of an image id (tools/pages/lib.ts rules, as tools/assets.py), never the prepared copy. */
  const sourceOf = (id: string) => {
    const f = imageSource(dir, id);
    if (!f || resolve(f).startsWith(pub + sep)) return undefined;
    // `confine` (a hosted Studio): a source `sources.json` names outside the game folder is not read, nor said.
    if (o.confine && !inside(dir, f)) return undefined;
    return resolve(f);
  };

  async function list(): Promise<AssetsListing> {
    pub = pubOf();
    const mod = await studio.loadGame();
    const game = mod.game;
    const refs = collectRefs(mod);
    const sfxIds = new Set(Object.keys(refs.audio.sfx));
    const musicIds = new Set(Object.keys(refs.audio.music));
    const { img, snd } = usage(game, new Set(refs.images), mod.extraImages ?? [], sfxIds, musicIds);

    const byFile = new Map<string, string[]>();
    const missing: string[] = [];
    for (const id of refs.images) {
      const f = sourceOf(id);
      if (!f) {
        missing.push(id);
        continue;
      }
      byFile.set(f, [...(byFile.get(f) ?? []), id]);
    }
    let unprepared = 0;
    const cellOf = (file: string, id: string): AssetCell => {
      const ids = byFile.get(file) ?? [];
      const used = uniq(ids.flatMap((x) => img.get(x) ?? ['content']));
      const asset = ids.map((x) => `img/${x}.webp`).find((x) => existsSync(join(pub, x)));
      const prepared = ids.length > 0 && ids.every((x) => fresh(file, join(pub, `img/${x}.webp`)));
      if (ids.length && !prepared) unprepared++;
      const [w, h] = imageSize(file);
      return {
        id,
        file: rel(file),
        w,
        h,
        used,
        ids,
        prepared,
        asset,
        backups: backupsOf(file).map(rel),
        mtime: mtime(file),
      };
    };
    const missingCell = (id: string, imageId: string): AssetCell => ({
      id,
      file: '',
      w: 0,
      h: 0,
      used: img.get(imageId) ?? [],
      ids: [imageId],
      prepared: false,
      backups: [],
      mtime: 0,
      missing: true,
    });

    // Prompts: the whole document, and the missing-only one for the sheets that lack cells.
    const opts = { gameId: studio.gameId, gameDir: dir, root };
    const full = buildPrompts(mod, opts);
    const only = full.missing.length ? buildPrompts(mod, { ...opts, missing: true }) : null;
    const prompts = full.sheets
      .map((p): AssetPrompt | null => {
        const markdown = section(full.markdown, p.id);
        const missingMarkdown = p.missing.length && only ? section(only.markdown, p.id) : undefined;
        return markdown ? { id: p.id, kind: p.kind, markdown, ...(missingMarkdown ? { missingMarkdown } : {}) } : null;
      })
      .filter((x): x is AssetPrompt => !!x);
    const promptOf = new Map(full.sheets.map((p) => [p.id, p]));

    // Sheets: folders of art/ (decor apart), plus the ones only the game or the prompts know (nothing cut yet).
    const sheets = new Map<string, AssetSheet>();
    const kindOf = (id: string): AssetSheetKind =>
      id.startsWith('talk_') ? 'talk' : id.startsWith('furniture_') ? 'furniture' : 'sprites';
    const sheet = (id: string) => {
      let s = sheets.get(id);
      if (!s) {
        s = { id, kind: kindOf(id), grid: '', cells: [] };
        sheets.set(id, s);
      }
      return s;
    };
    if (existsSync(artDir)) {
      for (const d of readdirSync(artDir).sort(natural)) {
        if (d.startsWith('.') || d.startsWith('_') || d === 'decor' || !statSync(join(artDir, d)).isDirectory())
          continue;
        const s = sheet(d);
        for (const f of walk(join(artDir, d))) s.cells.push(cellOf(resolve(artDir, d, f), stem(f)));
      }
    }
    for (const id of missing) {
      if (id.startsWith('decor/')) continue;
      const i = id.indexOf('/');
      sheet(id.slice(0, i)).cells.push(missingCell(id.slice(i + 1), id));
    }
    for (const p of full.sheets)
      if (p.kind !== 'background' && p.kind !== 'other' && !p.id.startsWith('decor/')) sheet(p.id);
    for (const s of sheets.values()) {
      s.cells.sort((a, b) => natural(a.id, b.id));
      const p = promptOf.get(s.id);
      if (p) s.promptKind = p.kind;
      const owners = s.cells
        .flatMap((c) => c.used)
        .map((u) => /^cast\.([^.]+)\./.exec(u)?.[1])
        .filter((x): x is string => !!x);
      const top = Object.entries(
        owners.reduce<Record<string, number>>((n, c) => ({ ...n, [c]: (n[c] ?? 0) + 1 }), {}),
      ).sort((a, b) => b[1] - a[1])[0];
      if (top) s.character = top[0];
      const md = prompts.find((x) => x.id === s.id)?.markdown;
      const rc = s.cells.map((c) => /^r(\d+)c(\d+)$/.exec(c.id)).filter((m): m is RegExpExecArray => !!m);
      s.grid =
        gridOf(md) ??
        (rc.length ? `${Math.max(6, ...rc.map((m) => +m[2]))}x${Math.max(4, ...rc.map((m) => +m[1]))}` : '6x4');
    }
    // New pose sheets (`<base>_poses`) belong to the base sheet's character.
    for (const s of sheets.values())
      if (!s.character && s.promptKind === 'poses') s.character = sheets.get(s.id.replace(/_poses$/, ''))?.character;

    // Decors: art/decor/<name>.{png,jpg} and the decor ids the game references.
    const decors: AssetDecor[] = [];
    const decorDir = join(artDir, 'decor');
    const roomsOf = (id: string) => game.rooms.filter((r) => r.decor === id).map((r) => r.id);
    const seen = new Set<string>();
    if (existsSync(decorDir)) {
      for (const f of readdirSync(decorDir).sort(natural)) {
        if (
          f.startsWith('.') ||
          !['.png', '.jpg', '.jpeg', '.webp'].includes(extname(f).toLowerCase()) ||
          BACKUP.test(stem(f))
        )
          continue;
        const name = `decor/${stem(f)}`;
        if (seen.has(name)) continue;
        // The file tools/assets.py takes (a .png before a .jpg) when both exist.
        const file = sourceOf(name) ?? resolve(decorDir, f);
        seen.add(name);
        const c = cellOf(file, stem(f));
        decors.push({ ...c, name, rooms: roomsOf(name) });
      }
    }
    for (const id of missing)
      if (id.startsWith('decor/') && !seen.has(id))
        decors.push({ ...missingCell(id.slice(6), id), name: id, rooms: roomsOf(id) });

    // Sounds: files of audio/<kind>/ and the ids of audio.<kind> they provide (an .mp3 asked can come from an .ogg).
    const sounds: AssetsListing['sounds'] = { music: [], sfx: [] };
    for (const kind of ['music', 'sfx'] as const) {
      const table = refs.audio[kind];
      const kdir = join(audioDir, kind);
      const files = existsSync(kdir)
        ? readdirSync(kdir)
            .filter((f) => !f.startsWith('.') && AUDIO_EXT.includes(extname(f).toLowerCase()) && !BACKUP.test(stem(f)))
            .sort(natural)
        : [];
      const has = (f: string) => files.includes(f);
      const provider = (req: string) =>
        has(req) ? req : req.endsWith('.mp3') && has(`${req.slice(0, -4)}.ogg`) ? `${req.slice(0, -4)}.ogg` : undefined;
      for (const req of Object.values(table))
        if (!provider(req) && !existsSync(join(pub, 'audio', kind, req))) missing.push(`audio/${kind}/${req}`);
      for (const f of files) {
        const ids = Object.entries(table).filter(([, req]) => provider(req) === f);
        const src = join(kdir, f);
        const asset = ids.map(([, req]) => `audio/${kind}/${req}`).find((x) => existsSync(join(pub, x)));
        const prepared = ids.length > 0 && ids.every(([, req]) => fresh(src, join(pub, 'audio', kind, req)));
        if (ids.length && !prepared) unprepared++;
        sounds[kind].push({
          id: f,
          kind,
          file: rel(src),
          prepared,
          asset,
          mtime: mtime(src),
          backups: backupsOf(src).map(rel),
          used: uniq(ids.flatMap(([id]) => [`audio.${kind}.${id}`, ...(snd.get(`${kind}:${id}`) ?? [])])),
        });
      }
    }

    return {
      sheets: [...sheets.values()].sort((a, b) => natural(a.id, b.id)),
      decors,
      sounds,
      missing,
      unprepared,
      prompts: { sheets: prompts, style: styleBlock(full.markdown) },
    };
  }

  async function prompts(missing: boolean): Promise<{ markdown: string }> {
    const mod = await studio.loadGame();
    return { markdown: buildPrompts(mod, { gameId: studio.gameId, gameDir: dir, root, missing }).markdown };
  }

  /** A source file of art/ or audio/ by its path relative to the game folder, or null. */
  function filePath(path: string): string | null {
    let p: string;
    try {
      p = decodeURIComponent(path);
    } catch {
      return null;
    }
    if (!/^(art|audio)\/[\w./ -]+$/.test(p) || p.split('/').some((s) => s === '..' || s === '.' || s === ''))
      return null;
    const f = resolve(dir, p);
    if (!f.startsWith(artDir + sep) && !f.startsWith(audioDir + sep)) return null;
    // Its links followed, it is still under art/ or audio/ (a link out of them is no file of theirs).
    if (!inside(artDir, f) && !inside(audioDir, f)) return null;
    try {
      const real = realpathSync(f);
      return statSync(real).isFile() ? real : null;
    } catch {
      return null;
    }
  }

  async function cellEntry(sheetId: string, cell: string): Promise<AssetCell> {
    const l = await list();
    const c = l.sheets.find((s) => s.id === sheetId)?.cells.find((x) => x.id === cell);
    if (!c) throw new StudioError(`no cell "${sheetId}/${cell}" after the write`, 500);
    return c;
  }

  // ---------------------------------------------------------------- uploads

  /**
   * A sheet's upload checked before any cut: its id, grid and cells (400), its image (400, `bad` for a hosted Studio's
   * 415), the cells it would recut without naming them (409, `conflicts`); and the backups of those it recuts, read now.
   */
  function planSheet(b: SheetUpload, bad = 400) {
    if (!b || typeof b.sheetId !== 'string' || !SHEET_ID.test(b.sheetId) || b.sheetId === 'decor')
      throw new StudioError('`sheetId` must be letters, digits, _ and - (not "decor")');
    const grid = b.grid ?? '6x4';
    const g = /^(\d{1,2})x(\d{1,2})$/i.exec(grid);
    if (!g || +g[1] < 1 || +g[2] < 1) throw new StudioError('`grid` must be COLSxROWS, e.g. 6x4');
    const [cols, rows] = [+g[1], +g[2]];
    let only: string[] | undefined;
    if (b.cells !== undefined && b.cells !== '') {
      if (typeof b.cells !== 'string') throw new StudioError('`cells` must be a list like r1c1,r2c3');
      only = uniq(
        b.cells
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      );
      for (const c of only) {
        const m = /^r(\d+)c(\d+)$/.exec(c);
        if (!m || +m[1] < 1 || +m[1] > rows || +m[2] < 1 || +m[2] > cols)
          throw new StudioError(`not a cell of a ${grid} grid: "${c}"`);
      }
      if (!only.length) throw new StudioError('`cells` is empty');
    }
    const data = decode(b.data);
    const type = imageType(data);
    if (!type) throw new StudioError('the sheet must be a PNG, JPEG or WebP image', bad);
    const out = join(artDir, b.sheetId);
    const targets =
      only ?? Array.from({ length: rows * cols }, (_, i) => `r${Math.floor(i / cols) + 1}c${(i % cols) + 1}`);
    const existing = targets.filter((c) => existsSync(join(out, `${c}.png`)));
    // Validated sprites are never recut by accident: overwriting needs the cells named.
    if (!only && existing.length) {
      throw Object.assign(
        new StudioError(
          `${existing.length} cell(s) of "${b.sheetId}" already exist: name the cells to recut (cells), or upload into a new sheet id`,
          409,
        ),
        { body: { conflicts: existing } },
      );
    }
    const planned = new Set<string>();
    const backups = existing.map((c) => keep(join(out, `${c}.png`), planned));
    const req: CutRequest = { mode: 'sheet', sheetId: b.sheetId, cols, rows, only };
    return { data, type, req, targets, backups };
  }

  function uploadSheet(b: SheetUpload): Promise<SheetUploadResult> {
    return serial(async () => {
      const { data, type, req, targets, backups } = planSheet(b);
      const file = join(
        dir,
        'private',
        'sheets',
        `${req.sheetId}-${new Date().toISOString().replace(/[:.]/g, '-')}${type}`,
      );
      // The uploaded sheet is kept first, on its own: a cut that fails leaves it there to try again by hand.
      await studio.writeFiles(`sheet ${req.sheetId}: upload`, [{ path: rel(file), after: data }], { undo: false });
      const r = await scratch(async (tmp) => {
        const sheetFile = join(tmp, `sheet${type}`);
        writeFileSync(sheetFile, data);
        const out = await cutCopy(tmp, sheetFile, req);
        await studio.writeFiles(`sheet ${req.sheetId}`, [...backups, ...out.files], { undo: false });
        return out;
      });
      return {
        ok: true as const,
        file: relative(root, file),
        output: r.output.trim(),
        written: targets,
        backups: backups.map((x) => x.path),
        cells: await sheetCells(req.sheetId),
      };
    });
  }

  /** A sheet's cells as the listing gives them (after an upload). */
  async function sheetCells(sheetId: string): Promise<AssetCell[]> {
    const l = await list();
    return l.sheets.find((s) => s.id === sheetId)?.cells ?? [];
  }

  /** A cell's replacement checked before any keying (as planSheet), and the backup of the cell it replaces, read now. */
  function planCell(b: CellReplace, bad = 400) {
    if (!b || typeof b.sheetId !== 'string' || !SHEET_ID.test(b.sheetId) || b.sheetId === 'decor')
      throw new StudioError('`sheetId` must be a sheet of art/ (not decor)');
    if (typeof b.cell !== 'string' || !CELL_ID.test(b.cell))
      throw new StudioError('`cell` must be like r1c2, or pose/t1 in a talk kit');
    const key = b.key ?? 'auto';
    if (!['auto', 'always', 'never'].includes(key)) throw new StudioError('`key` must be auto, always or never');
    const data = decode(b.data);
    const type = imageType(data);
    if (!type) throw new StudioError('the cell must be a PNG, JPEG or WebP image', bad);
    const target = join(artDir, b.sheetId, `${b.cell}.png`);
    const kept = existsSync(target) ? keep(target, new Set()) : undefined;
    const req: CutRequest = { mode: 'cell', sheetId: b.sheetId, cell: b.cell, key };
    return { data, type, req, file: rel(target), kept };
  }

  function replaceCell(b: CellReplace): Promise<CellReplaceResult> {
    return serial(async () => {
      const { data, type, req, file, kept } = planCell(b);
      const keyed = await scratch(async (tmp) => {
        const upload = join(tmp, `upload${type}`);
        writeFileSync(upload, data);
        const out = await cutCopy(tmp, upload, req);
        await studio.writeFiles(`cell ${b.sheetId}/${b.cell}`, [...(kept ? [kept] : []), ...out.files], {
          undo: false,
        });
        return out.keyed!;
      });
      return {
        ok: true as const,
        file,
        ...(kept ? { backup: kept.path } : {}),
        keyed,
        cell: await cellEntry(b.sheetId, b.cell),
      };
    });
  }

  function uploadSound(b: SoundUpload): Promise<UploadResult> {
    return serial(async () => {
      if (!b || (b.kind !== 'music' && b.kind !== 'sfx')) throw new StudioError('`kind` must be music or sfx');
      if (
        typeof b.file !== 'string' ||
        !/^[\w][\w.-]*$/.test(b.file) ||
        !AUDIO_EXT.includes(extname(b.file).toLowerCase())
      ) {
        throw new StudioError(`\`file\` must be a plain file name ending in ${AUDIO_EXT.join(', ')}`);
      }
      const data = decode(b.data);
      const target = join(audioDir, b.kind, b.file);
      const kept = existsSync(target) ? keep(target, new Set()) : undefined;
      await studio.writeFiles(
        `sound ${b.kind}/${b.file}`,
        [...(kept ? [kept] : []), { path: rel(target), after: data }],
        {
          undo: false,
        },
      );
      return { ok: true as const, file: rel(target), ...(kept ? { backup: kept.path } : {}) };
    });
  }

  function uploadDecor(b: DecorUpload): Promise<UploadResult> {
    return serial(async () => {
      if (!b || typeof b.name !== 'string' || !/^[\w-]+$/.test(b.name) || BACKUP.test(b.name))
        throw new StudioError('`name` must be letters, digits, _ and -');
      const data = decode(b.data);
      const type = imageType(data);
      if (type !== '.png' && type !== '.jpg') throw new StudioError('a decor must be a PNG or a JPEG image');
      const decorDir = join(artDir, 'decor');
      const target = join(decorDir, `${b.name}${type}`);
      // The previous picture is kept as a backup; one with another extension is moved away (tools/assets.py would take it first).
      const planned = new Set<string>();
      const files: Out[] = [];
      let kept: string | undefined;
      for (const ext of ['.png', '.jpg', '.jpeg']) {
        const old = join(decorDir, `${b.name}${ext}`);
        if (!existsSync(old)) continue;
        const k = keep(old, planned);
        files.push(k);
        kept = k.path;
        if (old !== target) files.push({ path: rel(old), after: null });
      }
      files.push({ path: rel(target), after: data });
      await studio.writeFiles(`decor ${b.name}`, files, { undo: false });
      return { ok: true as const, file: rel(target), ...(kept ? { backup: kept } : {}) };
    });
  }

  /** `npm run assets` (tools/refs.ts + tools/assets.py) for this game; `onData` receives the output as it comes. */
  function prepare(onData?: (s: string) => void): Promise<PrepareResult> {
    return serial(async () => {
      if (resolve(dir) !== resolve(root, 'games', studio.gameId))
        throw new StudioError('npm run assets only prepares a game under games/<id>/', 400);
      const r = await run(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'assets'],
        root,
        { ...process.env, GAME: studio.gameId, GAME_DIR: dir },
        onData,
      );
      return { ok: r.code === 0, code: r.code, output: r.output };
    });
  }

  return {
    list,
    prompts,
    filePath,
    uploadSheet,
    replaceCell,
    uploadSound,
    uploadDecor,
    prepare,
    planSheet,
    planCell,
    sheetCells,
    cellEntry,
  };
}

export type Assets = ReturnType<typeof createAssets>;

// ------------------------------------------------------------------ the HTTP side (/__studio/api/assets/*)

const MAX_BODY = 96 * 1024 * 1024;

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new StudioError('body too large', 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s.trim()) {
        ok({});
        return;
      }
      try {
        const v = JSON.parse(s);
        if (!v || typeof v !== 'object' || Array.isArray(v)) fail(new StudioError('the body must be a JSON object'));
        else ok(v);
      } catch {
        fail(new StudioError('the body is not valid JSON'));
      }
    });
    req.on('error', fail);
  });
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

/** Connect middleware for /__studio/api/assets (mounted by tools/studio/plugin.ts before the rest of the API). */
export function assetsMiddleware(studio: Studio, log?: { error: (msg: string) => void }) {
  const assets = createAssets(studio);
  return async (req: IncomingMessage, res: ServerResponse) => {
    const [path, query = ''] = (req.url ?? '/').split('?');
    const q = new URLSearchParams(query);
    const method = req.method ?? 'GET';
    try {
      if (method === 'GET' && path.startsWith('/file/')) {
        const f = assets.filePath(path.slice(6));
        if (!f) {
          send(res, 404, { error: 'no such file' });
          return;
        }
        res.setHeader('content-type', mimeOf(f));
        res.setHeader('cache-control', 'no-cache');
        createReadStream(f).pipe(res);
        return;
      }
      if (method === 'POST' && path === '/prepare' && q.get('stream') === '1') {
        // Live output: plain text as it comes, then `[exit <code>]`.
        res.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        });
        try {
          const r = await assets.prepare((s) => res.write(s));
          res.end(`\n[exit ${r.code}]\n`);
        } catch (e) {
          res.end(`\n${(e as Error).message}\n[exit 1]\n`);
        }
        return;
      }
      const routes: [string, string, () => Promise<unknown>][] = [
        ['GET', '/', () => assets.list()],
        ['GET', '/prompts', () => assets.prompts(q.get('missing') === '1')],
        ['POST', '/sheet', async () => assets.uploadSheet((await readJson(req)) as unknown as SheetUpload)],
        ['POST', '/cell', async () => assets.replaceCell((await readJson(req)) as unknown as CellReplace)],
        ['POST', '/sound', async () => assets.uploadSound((await readJson(req)) as unknown as SoundUpload)],
        ['POST', '/decor', async () => assets.uploadDecor((await readJson(req)) as unknown as DecorUpload)],
        ['POST', '/prepare', () => assets.prepare()],
      ];
      const p = path === '' ? '/' : path;
      const hits = routes.filter(([, r]) => r === p);
      const hit = hits.find(([m]) => m === method);
      if (!hit) {
        send(res, hits.length ? 405 : 404, {
          error: hits.length ? `method ${method} not allowed on assets${p}` : `no such endpoint: assets${p}`,
        });
        return;
      }
      send(res, 200, await hit[2]());
    } catch (e) {
      const status = e instanceof StudioError ? e.status : 500;
      if (status >= 500) log?.error(`[studio] ${method} assets${path}: ${(e as Error).stack ?? e}`);
      send(res, status, { ...((e as { body?: object }).body ?? {}), error: (e as Error).message });
    }
  };
}
