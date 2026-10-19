// A sheet's cutting and a cell's keying, on a scratch copy (4.2.3 PR 7, H8): the part of the Assets tab's uploads that
// runs Python, shared by the dev server (tools/studio/assets.ts, on this machine) and the processing worker's child
// (studio-server/src/worker/cut.ts, on a snapshot). The tool (tools/cut-sheet.py, or the keying below) works on a copy
// of `art/<sheet>/`, never on the game's files; what it wrote there that differs from the original is given back, by
// path under `art/`, for one operation of the journal.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/** The image type of uploaded bytes, from their magic number. */
export function imageType(b: Buffer): '.png' | '.jpg' | '.webp' | null {
  if (b.length > 8 && b.readUInt32BE(0) === 0x89504e47) return '.png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

export function run(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  onData?: (s: string) => void,
): Promise<{ code: number; output: string }> {
  return new Promise((ok) => {
    let output = '';
    const p = spawn(cmd, args, { cwd, env });
    const on = (c: Buffer) => {
      const s = c.toString('utf8');
      output += s;
      onData?.(s);
    };
    p.stdout.on('data', on);
    p.stderr.on('data', on);
    p.on('error', (e) => {
      output += `${e.message}\n`;
      onData?.(`${e.message}\n`);
      ok({ code: 127, output });
    });
    p.on('close', (code) => ok({ code: code ?? 1, output }));
  });
}

/** What to cut: a whole sheet on a grid (`only`: some of its cells), or one cell keyed. */
export type CutRequest =
  | { mode: 'sheet'; sheetId: string; cols: number; rows: number; only?: string[] }
  | { mode: 'cell'; sheetId: string; cell: string; key: 'auto' | 'always' | 'never' };

export interface CutOutput {
  /** The files written, by path under `art/` (`<sheet>/r1c1.png`), only those that differ from the original. */
  files: { path: string; bytes: Buffer }[];
  /** What the tool said. */
  output: string;
  /** cell: `keyed`, `kept` or `opaque`. */
  keyed?: 'keyed' | 'kept' | 'opaque';
}

export class CutFailed extends Error {}

/**
 * Runs the cut of `req` on a copy of `artDir/<sheet>/` made in `tmp`, from the uploaded image `source`. `engine`: the
 * folder holding tools/cut-sheet.py; `env`: the tool's environment (GAME, GAME_DIR: the game's site.json, PYTHONPATH).
 */
export async function cutOnCopy(o: {
  tmp: string;
  artDir: string;
  source: string;
  req: CutRequest;
  engine: string;
  env: NodeJS.ProcessEnv;
}): Promise<CutOutput> {
  const { req } = o;
  const copyArt = join(o.tmp, 'art');
  const from = join(o.artDir, req.sheetId);
  const to = join(copyArt, req.sheetId);
  mkdirSync(to, { recursive: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
  const cutSheet = join(o.engine, 'tools', 'cut-sheet.py');
  let res: { code: number; output: string };
  let keyed: CutOutput['keyed'];
  if (req.mode === 'sheet') {
    res = await run(
      'python3',
      [
        cutSheet,
        o.source,
        req.sheetId,
        '--grid',
        `${req.cols}x${req.rows}`,
        '--out',
        copyArt,
        ...(req.only ? ['--cells', req.only.join(',')] : []),
      ],
      o.engine,
      o.env,
    );
    if (res.code !== 0)
      throw new CutFailed(`cut-sheet.py failed (${res.code}): ${res.output.trim().split('\n').slice(-3).join(' ')}`);
  } else {
    const dst = join(to, `${req.cell}.png`);
    mkdirSync(dirname(dst), { recursive: true });
    res = await run('python3', ['-c', KEY_PY, cutSheet, o.source, dst, req.key, o.artDir], o.engine, o.env);
    const k = res.output.trim().split('\n').pop();
    if (res.code !== 0 || (k !== 'keyed' && k !== 'kept' && k !== 'opaque'))
      throw new CutFailed(`keying failed (${res.code}): ${res.output.trim().split('\n').slice(-3).join(' ')}`);
    keyed = k;
  }
  const files: CutOutput['files'] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const original = join(from, relative(to, p));
        const bytes = readFileSync(p);
        if (!existsSync(original) || !readFileSync(original).equals(bytes))
          files.push({ path: relative(copyArt, p).split(sep).join('/'), bytes });
      }
    }
  };
  walk(to);
  return { files, output: res.output.trim(), ...(keyed ? { keyed } : {}) };
}

/**
 * Keys one uploaded cell with the cutter's own rule (tools/cut-sheet.py: background = the border's median colour,
 * flood-filled from the border, tolerance 30), then crops it to its figure. argv: cut-sheet.py, source, target, mode,
 * art folder. Prints `kept` (the image already has transparency), `opaque` (no flat background, or mode never) or `keyed`.
 * Pixel-art games (site.json `artStyle: "pixel"`, next to the art folder): the cell is then fixed like a cut sheet
 * (scaled down 4× when larger than 128 px, colours reduced and snapped to the sheet's existing ones, indexed PNG).
 */
const KEY_PY = String.raw`
import importlib.util, os, sys
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
spec = importlib.util.spec_from_file_location('cut_sheet', sys.argv[1])
cut = importlib.util.module_from_spec(spec); spec.loader.exec_module(cut)
src, dst, mode = sys.argv[2], sys.argv[3], sys.argv[4]
pixel = len(sys.argv) > 5 and cut.art_style(sys.argv[5]) == 'pixel'
def save(img, what):
    if pixel and what != 'opaque':
        a = np.asarray(img.convert('RGBA'))
        scale = cut.PIXEL_SCALE if max(a.shape[:2]) > 2 * cut.CELL // cut.PIXEL_SCALE else 1
        cut.pixelize(a, scale, cut.PIXEL_COLORS, shared=cut.existing_colors(os.path.dirname(dst))).save(dst, transparency=0)
    else:
        img.save(dst)
    print(what); sys.exit(0)
im = Image.open(src)
rgba = im.convert('RGBA')
alpha = np.asarray(rgba)[..., 3]
if (alpha < 250).mean() > 0.01 and mode != 'always':
    box = rgba.getbbox()
    save(rgba.crop(box) if box else rgba, 'kept')
a = np.asarray(im.convert('RGB')).astype(int)
edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
flat = (np.sqrt(((edge - np.median(edge, axis=0)) ** 2).sum(-1)) <= 30).mean() > 0.9
if mode == 'never' or (mode == 'auto' and not flat):
    save(rgba, 'opaque')
fg = ~cut.flood_from_border(cut.bg_mask(a))
out = Image.fromarray(np.dstack([a.astype(np.uint8), (fg * 255).astype(np.uint8)]), 'RGBA')
box = out.getbbox()
save(out.crop(box) if box else out, 'keyed')
`;
