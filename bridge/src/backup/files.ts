// The backup's files (4.1.19, ADR 0021): read bounded without trusting them, written atomically, and the Bridge's
// version an envelope names. Split from `bridge/src/backup.ts` (4.1.20 PR 1a).
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { BackupError } from './schema';

/**
 * Reads a backup file without trusting it: a link or anything but a regular file refused, its size checked before a
 * byte is read, at most `max + 1` bytes read, and a file that changed size while read refused.
 */
export function readBounded(path: string, max: number): string {
  const l = lstatSync(path, { throwIfNoEntry: false });
  if (!l) throw new BackupError(`${path} does not exist`);
  if (l.isSymbolicLink() || !l.isFile()) throw new BackupError(`${path} is not a regular file`);
  // No link followed where the system can refuse one (a link swapped in after the lstat), and the file opened must be
  // the one looked at.
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.ino !== l.ino || st.dev !== l.dev)
      throw new BackupError(`${path} is not a regular file (or changed while it was opened)`);
    if (st.size > max) throw new BackupError(`${path} holds ${st.size} bytes, more than ${max} (--max-bytes=)`);
    const buf = Buffer.alloc(st.size + 1);
    let got = 0;
    for (;;) {
      const n = readSync(fd, buf, got, buf.length - got, got);
      if (n === 0) break;
      got += n;
      if (got === buf.length) break;
    }
    if (got !== st.size) throw new BackupError(`${path} changed while it was read`);
    return buf.subarray(0, got).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/**
 * Writes a file of mode 600 the way a backup must be: a private temporary file beside it, written, flushed, closed,
 * renamed over the target, then the folder flushed where the system allows. An interruption leaves the old file or
 * the new one, never half of one.
 */
export function writeAtomic(path: string, content: string): void {
  // A short temporary name (a long target's would exceed the system's limit on a name).
  const tmp = join(
    dirname(path),
    `.${basename(path).slice(0, 64)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    const buf = Buffer.from(content, 'utf8');
    let off = 0;
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    unlinkSync(tmp);
    throw e;
  }
  closeSync(fd);
  try {
    renameSync(tmp, path);
  } catch (e) {
    unlinkSync(tmp);
    throw e;
  }
  try {
    const dir = openSync(dirname(path), 'r');
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  } catch {
    /* a folder cannot be flushed on every system (Windows): the rename is what makes it whole */
  }
}

/** Removes a temporary file, never hiding the error that made it go. */
function rmQuietly(f: string): void {
  try {
    unlinkSync(f);
  } catch {
    /* already gone, or not removable: the first error is the one said */
  }
}

/**
 * Writes a file that must not exist yet (4.1.20 PR 1b, `restore --safety-out`): a path that exists — a file, a link,
 * even one that points nowhere, anything else — is refused before a byte is written; the content goes to a private
 * temporary file beside it (mode 600), flushed, then linked to its name (a link never replaces an existing name, so a
 * file that appeared meanwhile is refused too), the temporary name removed and the folder flushed where the system
 * allows.
 * A hard link is how no name is ever replaced: a filesystem without them (FAT, exFAT, some network shares) refuses
 * the safety backup, and replace-store with it; give a path on one that has them.
 */
export function writeNew(path: string, content: string): void {
  if (lstatSync(path, { throwIfNoEntry: false }))
    throw new BackupError(`${path} already exists (a file, a link or anything else): give a new path`);
  // A short temporary name (a long target's would exceed the system's limit on a name).
  const tmp = join(
    dirname(path),
    `.${basename(path).slice(0, 64)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    const buf = Buffer.from(content, 'utf8');
    let off = 0;
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    rmQuietly(tmp);
    throw e;
  }
  closeSync(fd);
  try {
    linkSync(tmp, path);
  } catch (e) {
    rmQuietly(tmp);
    if ((e as NodeJS.ErrnoException).code === 'EEXIST')
      throw new BackupError(`${path} already exists: give a new path`);
    throw e;
  }
  unlinkSync(tmp);
  try {
    const dir = openSync(dirname(path), 'r');
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  } catch {
    /* a folder cannot be flushed on every system (Windows): the link is what makes it whole */
  }
}

/**
 * This Bridge's version: its package's (the packed @quest-n-click/bridge is one bundle, `src/cli.mjs`), else the
 * repository's, three folders up from this file (the former name's alias, web-scumm-bridge, went in 4.3.0, D47).
 */
export function bridgeVersion(): string {
  for (const rel of ['../package.json', '../../../package.json']) {
    const f = new URL(rel, import.meta.url);
    if (!existsSync(f)) continue;
    try {
      const pkg = JSON.parse(readFileSync(f, 'utf8')) as { name?: string; version?: string };
      // The scoped names since 4.5.2 (D53), the unscoped ones before.
      const ours = ['@quest-n-click/bridge', '@quest-n-click/engine', 'quest-n-click-bridge', 'quest-n-click'];
      if (ours.includes(pkg.name ?? '') && pkg.version) return pkg.version;
    } catch {
      /* not this one */
    }
  }
  return 'unknown';
}
