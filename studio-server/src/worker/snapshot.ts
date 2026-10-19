// What the worker needs of a game to run it (4.2.1, ADR 0028): its sources and data, never its art or sound (the
// validator reads `assets.gen.json`, not the pictures). One JSON document, its sha256 bound into the job. A game that
// imports files outside its own folder cannot run on a hosted Studio (they are not in the snapshot). A snapshot for
// `prepare` (4.2.2 PR 6b, version 2) carries the game's art and sounds too, base64, as the asset tools read them.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const SKIP_DIR = /^(art|audio|private|playtests|tests)$/;
const TEXT = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx|json|md)$/;
const MAX_FILES = 5_000;
const MAX_BYTES = 32 * 1024 * 1024;
/** The art and sounds a `prepare` reads, under `art/` and `audio/`; the image a cut is given (4.2.3), `upload/`. */
const MEDIA =
  /^(?:(art|audio)\/.+\.(png|jpe?g|webp|gif|mp3|ogg|wav|flac|m4a|mp4|webm|mov)|upload\/source\.(png|jpe?g|webp))$/i;

/** Whether a file of the game (its path with `/`) goes into a snapshot: the rules a folder is packed by. */
export function packable(path: string, o: { playtests?: boolean } = {}): boolean {
  const parts = path.split('/');
  if (parts.some((p) => p.startsWith('.') || p === 'node_modules' || p === '..' || p === '')) return false;
  if (parts.length > 1 && SKIP_DIR.test(parts[0]!) && !(o.playtests && parts[0] === 'playtests')) return false;
  return TEXT.test(path);
}

/**
 * A snapshot from files rather than a folder (4.2.2: a past revision, from the journal's blobs), under the same rules
 * as a folder's: sources and data only, no art, sound, private notes or tests, nothing hidden.
 */
export function packFiles(files: { path: string; bytes: Buffer }[], o: { playtests?: boolean } = {}): Buffer {
  const out: { path: string; text: string }[] = [];
  let bytes = 0;
  for (const f of files) {
    if (!packable(f.path, o)) continue;
    const text = f.bytes.toString('utf8');
    bytes += text.length;
    out.push({ path: f.path, text });
    if (out.length > MAX_FILES || bytes > MAX_BYTES)
      throw new Error(
        `the game is too large to run on the processing worker (${MAX_FILES} files, ${MAX_BYTES >> 20} MiB at most)`,
      );
  }
  out.sort((a, b) => (a.path < b.path ? -1 : 1));
  return Buffer.from(JSON.stringify({ v: 1, files: out }));
}

/** `playtests`: their sessions too (the `playtests` job replays them; nothing else needs them). */
export function packSnapshot(dir: string, o: { playtests?: boolean } = {}): Buffer {
  const files: { path: string; text: string }[] = [];
  let bytes = 0;
  const walk = (d: string, top: boolean) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      if (top && SKIP_DIR.test(e.name) && !(o.playtests && e.name === 'playtests')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, false);
      else if (e.isFile() && TEXT.test(e.name)) {
        const text = readFileSync(p, 'utf8');
        bytes += text.length;
        files.push({ path: relative(dir, p).split(sep).join('/'), text });
        // The same bounds as unpacking, said here, where the author can act on them.
        if (files.length > MAX_FILES || bytes > MAX_BYTES)
          throw new Error(
            `the game is too large to run on the processing worker (${MAX_FILES} files, ${MAX_BYTES >> 20} MiB at most)`,
          );
      }
    }
  };
  walk(dir, true);
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return Buffer.from(JSON.stringify({ v: 1, files }));
}

/** Writes a snapshot into an empty folder; refuses paths that leave it, too many files, too many bytes. */
export function unpackSnapshot(bytes: Buffer, dir: string): number {
  if (bytes.length > MAX_BYTES) throw new Error('the snapshot is too large');
  const s = JSON.parse(bytes.toString('utf8')) as {
    v: number;
    files: { path: string; text?: string; b64?: string }[];
  };
  if ((s.v !== 1 && s.v !== 2) || !Array.isArray(s.files) || s.files.length > MAX_FILES)
    throw new Error('not a snapshot');
  for (const f of s.files) {
    const text = typeof f.text === 'string' && TEXT.test(f.path);
    const media = s.v === 2 && typeof f.b64 === 'string' && MEDIA.test(f.path);
    if (typeof f.path !== 'string' || !(text || media)) throw new Error('not a snapshot');
    if (f.path.startsWith('/') || f.path.split('/').some((x) => x === '..' || x === '' || x.startsWith('.')))
      throw new Error(`a snapshot path leaves its folder: ${f.path}`);
    const target = join(dir, ...f.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text ? f.text! : Buffer.from(f.b64!, 'base64'));
  }
  return s.files.length;
}

/**
 * A snapshot for `prepare` (version 2): the sources and data, and the art and sounds under `art/` and `audio/`, from
 * files (the journal's head). Bounded as any snapshot: a game too large is prepared on a local Studio.
 */
export function packAssets(files: { path: string; bytes: Buffer }[]): Buffer {
  const out: { path: string; text?: string; b64?: string }[] = [];
  let bytes = 0;
  for (const f of files) {
    if (f.path.split('/').some((p) => p.startsWith('.') || p === 'node_modules' || p === '..' || p === '')) continue;
    if (MEDIA.test(f.path)) out.push({ path: f.path, b64: f.bytes.toString('base64') });
    else if (packable(f.path)) out.push({ path: f.path, text: f.bytes.toString('utf8') });
    else continue;
    bytes += Buffer.byteLength(out.at(-1)!.b64 ?? out.at(-1)!.text!);
    if (out.length > MAX_FILES || bytes > MAX_BYTES - 1024 * 1024)
      throw new Error(
        `the game's art and sounds are too large to prepare on the processing worker (${MAX_BYTES >> 20} MiB at most): prepare them on a local Studio`,
      );
  }
  out.sort((a, b) => (a.path < b.path ? -1 : 1));
  return Buffer.from(JSON.stringify({ v: 2, files: out }));
}

/**
 * A folder's files for `packAssets` (the instance's folder, the head): only those it keeps (its sources, data, art and
 * sounds), read as they are found, the walk stopped past the bound.
 */
export function filesOf(dir: string): { path: string; bytes: Buffer }[] {
  const out: { path: string; bytes: Buffer }[] = [];
  let bytes = 0;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      const path = relative(dir, p).split(sep).join('/');
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && (MEDIA.test(path) || packable(path))) {
        const b = readFileSync(p);
        bytes += b.length;
        // Past the bound already (base64 makes it larger still): packAssets says so.
        if (bytes > MAX_BYTES) return out.push({ path, bytes: b });
        out.push({ path, bytes: b });
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * A snapshot for a cut (4.2.3 PR 7, version 2): the uploaded image as `upload/source<ext>`, the cells of the sheet as
 * they are (`art/<sheet>/`: what a recut compares with, a pixel-art sheet's colours) and `site.json` (the art style);
 * no source, no other art. Bounded as any snapshot.
 */
export function packCut(gameDir: string, sheetId: string, source: Buffer, ext: string): Buffer {
  const files: { path: string; bytes: Buffer }[] = [{ path: `upload/source${ext}`, bytes: source }];
  const site = join(gameDir, 'site.json');
  if (existsSync(site)) files.push({ path: 'site.json', bytes: readFileSync(site) });
  const sheet = join(gameDir, 'art', sheetId);
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && /\.(png|jpe?g|webp)$/i.test(e.name))
        files.push({ path: `art/${sheetId}/${relative(sheet, p).split(sep).join('/')}`, bytes: readFileSync(p) });
    }
  };
  if (existsSync(sheet)) walk(sheet);
  return packAssets(files);
}

/** The texts of a version 1 snapshot, by path. */
export function snapshotTexts(bytes: Buffer): Map<string, string> {
  const s = JSON.parse(bytes.toString('utf8')) as { v: number; files: { path: string; text: string }[] };
  if (s.v !== 1 || !Array.isArray(s.files)) throw new Error('not a snapshot');
  return new Map(s.files.map((f) => [f.path, f.text]));
}

/**
 * A version 1 snapshot with `files` written over it (4.2.3 PR 8: the migrated game, judged before anything is
 * written), under the same rules as a folder's.
 */
export function overlaySnapshot(bytes: Buffer, files: Record<string, string>): Buffer {
  const texts = snapshotTexts(bytes);
  for (const [path, text] of Object.entries(files)) texts.set(path, text);
  return packFiles([...texts].map(([path, text]) => ({ path, bytes: Buffer.from(text, 'utf8') })));
}
