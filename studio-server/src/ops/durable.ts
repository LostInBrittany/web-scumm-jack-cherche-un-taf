// Durable file writes (4.2.1, plan P1): a write is on the disk before anyone is told it happened. A file goes through
// a temporary file, an fsync, a rename and an fsync of its directory; a removal is an unlink and the same fsync. A
// directory created on the way is fsynced into its parent. Nothing here decides what to write: the journal does.
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** The hash a journal records for a content: sha256, hex. */
export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/** What the journal writes for a file that does not exist. */
export const ABSENT = 'absent';

function fsyncDir(dir: string) {
  // A directory is opened read-only to be fsynced; some systems refuse that (it is then not needed). A real I/O error
  // is not swallowed. (On macOS, fsync is not F_FULLFSYNC: the drive's own cache may still hold the write.)
  let fd: number | undefined;
  try {
    fd = openSync(dir, 'r');
    fsyncSync(fd);
  } catch (e) {
    if (!['EINVAL', 'EISDIR', 'EPERM', 'EBADF', 'ENOTSUP', 'EACCES'].includes((e as NodeJS.ErrnoException).code ?? ''))
      throw e;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Creates `dir` and its missing parents, each fsynced into the directory that holds it. */
function mkdirDurable(dir: string) {
  if (existsSync(dir)) return;
  mkdirDurable(dirname(dir));
  mkdirSync(dir);
  fsyncDir(dirname(dir));
}

/** The temporary name of a durable write: beside its file, so the rename never crosses a file system. */
const tmpName = (file: string) => join(dirname(file), `.${basename(file)}.${process.pid}.studio-tmp`);

/** Writes `bytes` to `file` durably; `null` removes the file. */
export function writeDurable(file: string, bytes: Buffer | string | null): void {
  if (bytes === null) {
    if (!existsSync(file)) return;
    unlinkSync(file);
    fsyncDir(dirname(file));
    return;
  }
  mkdirDurable(dirname(file));
  const tmp = tmpName(file);
  const fd = openSync(tmp, 'w', 0o644);
  try {
    const buf = typeof bytes === 'string' ? Buffer.from(bytes) : bytes;
    let off = 0;
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  fsyncDir(dirname(file));
}

/** Removes the temporary files a crash left beside the files of `root` (recursively); returns their paths. */
export function sweepTemporaries(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.studio-tmp$/.test(e.name)) {
        rmSync(p, { force: true });
        found.push(p);
      }
    }
  };
  if (existsSync(root)) walk(root);
  return found;
}
