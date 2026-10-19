// The Assets tab on a hosted Studio (4.2.3 PR 7, H8): its listing, prompts and files (a reviewer's), its uploads and
// its sheets' cutting (a dev's). What runs here is what tools/studio/assets.ts runs on the dev server, with three
// differences:
//   - an upload is untrusted bytes: bounded (10 MiB once decoded; 413 past it) and typed by its magic number and its
//     extension (a PNG, JPEG or WebP image; an Ogg, MP3 or WAV sound; 415 otherwise); it is written, never run or
//     decoded here;
//   - Python runs on the processing worker only: a sheet's cutting and a cell's keying are `cut` jobs of the worker
//     (worker/cut.ts), on a snapshot of the image, the sheet's cells and `site.json`, under the member's exclusive lease;
//     their cells come back bounded (cells of that sheet only) and are written as one operation, with the backups of
//     the cells they replace;
//   - the uploaded sheet itself is not kept (a local Studio keeps it under `private/sheets/`, a folder no span names).
import { Buffer } from 'node:buffer';
import { extname } from 'node:path';
import type { Assets } from '../../../tools/studio/assets';
import { type CutRequest, imageType } from '../../../tools/studio/cut';
import type { CellReplace, DecorUpload, SheetUpload, SoundUpload, UploadResult } from '../../../tools/studio/types';
import type { Studio } from '../ops/core';
import { StudioError } from '../ops/errors';
import type { Cut } from '../worker/cut';
import type { JobControl } from './jobs';

/** An upload's bytes, once decoded. */
export const MAX_UPLOAD = 10 * 1024 * 1024;
/** Its JSON body: the bytes in base64, and a little more. */
export const MAX_UPLOAD_BODY = Math.ceil(MAX_UPLOAD / 3) * 4 + 64 * 1024;

/** The sounds a hosted Studio takes, by extension, each with its magic number. */
const SOUND: Record<string, (b: Buffer) => boolean> = {
  '.ogg': (b) => b.length > 4 && b.toString('latin1', 0, 4) === 'OggS',
  '.mp3': (b) => b.length > 3 && (b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0)),
  '.wav': (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE',
};

/** An upload's bytes: base64 (a data URL is accepted), 10 MiB at most once decoded (413). */
function uploadBytes(data: unknown): Buffer {
  if (typeof data !== 'string' || !data) throw new StudioError('`data` (base64) is required');
  const b64 = data.replace(/^data:[^,]*,/, '');
  // Past the bound before decoding it: base64 is 4 characters for 3 bytes.
  if (Math.floor((b64.length * 3) / 4) > MAX_UPLOAD + 2)
    throw new StudioError(`an upload is ${MAX_UPLOAD >> 20} MiB at most`, 413);
  const b = Buffer.from(b64, 'base64');
  if (!b.length) throw new StudioError('`data` is empty or not base64');
  if (b.length > MAX_UPLOAD) throw new StudioError(`an upload is ${MAX_UPLOAD >> 20} MiB at most`, 413);
  return b;
}

/** Checks an upload's type (415), and its size (413) first. */
function checkUpload(kind: 'image' | 'decor' | 'sound', data: unknown, file?: unknown): void {
  const b = uploadBytes(data);
  if (kind === 'sound') {
    const ext = typeof file === 'string' ? extname(file).toLowerCase() : '';
    const magic = SOUND[ext];
    if (!magic) throw new StudioError('a sound on a hosted Studio is an .ogg, .mp3 or .wav file', 415);
    if (!magic(b))
      throw new StudioError(`the file is not ${ext.slice(1).toUpperCase()} sound: its bytes say otherwise`, 415);
    return;
  }
  const type = imageType(b);
  if (!type || (kind === 'decor' && type === '.webp'))
    throw new StudioError(
      kind === 'decor' ? 'a decor is a PNG or a JPEG image' : 'an image is a PNG, JPEG or WebP image',
      415,
    );
}

export interface HostedAssetsOptions {
  studio: Studio;
  /** The dev server's Assets tab (tools/studio/assets.ts), given where the prepared set is. */
  assets: Assets;
  /** Runs `fn` holding the instance's lock alone, the folder repaired to the head first. */
  locked: <T>(fn: () => Promise<T> | T) => Promise<T>;
  /** Takes and gives back the project's exclusive lease for the member (main.ts). */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  /** The worker's cut, on a snapshot of the image, the sheet and site.json; absent without a worker. */
  cut?: (req: CutRequest, source: Buffer, ext: string, signal: AbortSignal) => Promise<Cut>;
}

export class HostedAssets {
  constructor(private o: HostedAssetsOptions) {}

  get assets(): Assets {
    return this.o.assets;
  }

  uploadSound(b: SoundUpload): Promise<UploadResult> {
    checkUpload('sound', b?.data, b?.file);
    return this.o.assets.uploadSound(b);
  }

  uploadDecor(b: DecorUpload): Promise<UploadResult> {
    checkUpload('decor', b?.data);
    return this.o.assets.uploadDecor(b);
  }

  /**
   * A sheet's cutting (`sheet`) or a cell's keying (`cell`), checked now (400, 409 with the cells that exist, 413,
   * 415): the job's work, to start. It runs under the member's exclusive lease, packs the image with the sheet's cells
   * as they are then, has the worker cut it, and writes the cells with their backups as one operation.
   */
  planCut(mode: 'sheet' | 'cell', b: SheetUpload | CellReplace): (c: JobControl) => Promise<unknown> {
    const cut = this.o.cut;
    if (!cut) throw new StudioError("cutting a sheet needs the hosted Studio's processing worker", 404);
    checkUpload('image', b?.data);
    const plan = () =>
      mode === 'sheet' ? this.o.assets.planSheet(b as SheetUpload, 415) : this.o.assets.planCell(b as CellReplace, 415);
    plan();
    return (c) =>
      this.o.exclusive(async () => {
        c.step('packing');
        // Planned again under the lease: the cells and their backups as they are now (nobody else writes meanwhile).
        const p = await this.o.locked(plan);
        c.step('on the worker');
        const out = await cut(p.req, p.data, p.type, c.signal);
        // Past this point the job writes: a cancel before it leaves no operation.
        c.commit();
        const backups = 'backups' in p ? p.backups : p.kept ? [p.kept] : [];
        const files = Object.entries(out.files).map(([path, b64]) => ({ path, after: Buffer.from(b64, 'base64') }));
        const what = p.req.mode === 'sheet' ? `sheet ${p.req.sheetId}` : `cell ${p.req.sheetId}/${p.req.cell}`;
        await this.o.locked(() => this.o.studio.writeFiles(what, [...backups, ...files], { undo: false }));
        if (p.req.mode === 'sheet' && 'targets' in p)
          return {
            ok: true as const,
            file: '',
            output: out.output,
            written: p.targets,
            backups: backups.map((x) => x.path),
            cells: await this.o.assets.sheetCells(p.req.sheetId).catch(() => []),
          };
        const req = p.req as Extract<CutRequest, { mode: 'cell' }>;
        return {
          ok: true as const,
          file: `art/${req.sheetId}/${req.cell}.png`,
          ...('kept' in p && p.kept ? { backup: p.kept.path } : {}),
          keyed: out.keyed,
          cell: await this.o.assets.cellEntry(req.sheetId, req.cell).catch(() => undefined),
        };
      });
  }
}
