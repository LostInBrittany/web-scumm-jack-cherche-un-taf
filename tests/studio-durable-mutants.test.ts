// The journal's durable writes (4.2.1, studio-server/src/ops/durable.ts), pinned for the mutation set `studio-ops`:
// a removal of a file that is there and of one that is not, text and bytes written exactly, and the sweep of a
// folder that does not exist. What no test can reach on a POSIX runner is named in docs/dev/mutants.json.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sweepTemporaries, writeDurable } from '../studio-server/src/ops/durable';

/**
 * 4.3.0: the directory's open for its fsync, made to fail with a chosen code (`fail.code`, for the directory
 * `fail.dir` only). Every other call of node:fs is the real one, so the tests above run as they always did.
 */
const fail = vi.hoisted(() => ({ dir: '', code: '', short: 0 }));
vi.mock('node:fs', async (orig) => {
  const real = await orig<typeof import('node:fs')>();
  const openSync = ((p: string, flags: string, mode?: number) => {
    if (fail.code && p === fail.dir && flags === 'r')
      throw Object.assign(new Error(`${fail.code}: open of ${p}`), { code: fail.code });
    return real.openSync(p, flags, mode);
  }) as typeof real.openSync;
  // 4.4.0: the next `fail.short` writes are short by one byte (a FUSE or network file system may write less than asked).
  // 4.5.0: a string handed to writeSync as is (its overload `writeSync(fd, text, position)`) is cut the same way, one
  // byte short of its UTF-8, so a write that passes the text instead of its bytes is seen: its next call would write
  // the whole text again at the position where the first stopped.
  const writeSync = ((fd: number, buf: Buffer | string, off: number, len: number) => {
    if (fail.short > 0 && len > 1) {
      fail.short--;
      if (typeof buf === 'string') {
        const b = Buffer.from(buf);
        return real.writeSync(fd, b, 0, b.length - 1, off);
      }
      return real.writeSync(fd, buf, off, len - 1);
    }
    return real.writeSync(fd, buf as Buffer, off, len);
  }) as typeof real.writeSync;
  return { ...real, openSync, writeSync, default: { ...real, openSync, writeSync } };
});

let dir: string;
beforeEach(() => {
  mkdirSync(join(process.cwd(), '.cache'), { recursive: true });
  dir = mkdtempSync(join(process.cwd(), '.cache', 'durable-'));
});
afterEach(() => {
  fail.code = '';
  fail.short = 0;
  rmSync(dir, { recursive: true, force: true });
});

describe('writeDurable', () => {
  it('removes a file that is there, and does nothing for one that is not', () => {
    const f = join(dir, 'a.txt');
    writeFileSync(f, 'x');
    writeDurable(f, null);
    expect(existsSync(f)).toBe(false);
    expect(() => writeDurable(join(dir, 'missing.txt'), null)).not.toThrow();
    expect(existsSync(join(dir, 'missing.txt'))).toBe(false);
  });

  it('writes text and bytes exactly, in folders it creates, and leaves no temporary file', () => {
    const t = join(dir, 'deep', 'er', 't.txt');
    writeDurable(t, 'héllo, wörld');
    expect(readFileSync(t, 'utf8')).toBe('héllo, wörld');
    const b = join(dir, 'b.bin');
    const bytes = Buffer.from([0, 1, 2, 255, 254, 10, 13]);
    writeDurable(b, bytes);
    expect(readFileSync(b).equals(bytes)).toBe(true);
    writeDurable(b, 'replaced');
    expect(readFileSync(b, 'utf8')).toBe('replaced');
    expect(sweepTemporaries(dir)).toEqual([]);
  });
});

describe('a short write', () => {
  it('writes the rest from where it stopped, whole (4.4.0)', () => {
    const f = join(dir, 'short.txt');
    fail.short = 1;
    writeDurable(f, 'abcdefgh');
    expect(fail.short).toBe(0);
    expect(readFileSync(f, 'utf8')).toBe('abcdefgh');
  });
});

describe('file descriptors', () => {
  // POSIX: the process's open descriptors are listed in /dev/fd (Linux and macOS); Windows has none of that.
  it.skipIf(process.platform === 'win32')("a write and a removal leave no descriptor open, a folder's included", () => {
    const open = () => readdirSync('/dev/fd').length;
    writeDurable(join(dir, 'warm.txt'), 'w');
    const before = open();
    for (let i = 0; i < 20; i++) {
      writeDurable(join(dir, `f${i}.txt`), `${i}`);
      writeDurable(join(dir, `f${i}.txt`), null);
    }
    expect(open()).toBe(before);
  });
});

describe('sweepTemporaries', () => {
  it('removes what a crash left, recursively, and answers nothing for a folder that does not exist', () => {
    mkdirSync(join(dir, 'rooms'));
    writeFileSync(join(dir, 'rooms', '.a.ts.123.studio-tmp'), 'half');
    writeFileSync(join(dir, 'rooms', 'a.ts'), 'whole');
    const found = sweepTemporaries(dir);
    expect(found).toEqual([join(dir, 'rooms', '.a.ts.123.studio-tmp')]);
    expect(existsSync(join(dir, 'rooms', 'a.ts'))).toBe(true);
    expect(sweepTemporaries(join(dir, 'nowhere'))).toEqual([]);
  });
});

// Killed mutants (4.3.0 reread of the exemptions): fsyncDir's catch and finally, reached on any runner by the mocked
// open above. A directory a system will not open for an fsync (the tolerated codes: Windows' EISDIR and EPERM among
// them) is written all the same, with no descriptor to close; a real I/O error is thrown, never swallowed.
describe('fsyncDir when the directory will not open', () => {
  it('tolerates the codes of a system that refuses to open a directory, and closes nothing', () => {
    for (const code of ['EISDIR', 'EPERM', 'EINVAL', 'EBADF', 'ENOTSUP', 'EACCES']) {
      fail.dir = dir;
      fail.code = code;
      const f = join(dir, `${code}.txt`);
      expect(() => writeDurable(f, code), code).not.toThrow();
      expect(readFileSync(f, 'utf8')).toBe(code);
    }
  });

  it('throws a real I/O error', () => {
    fail.dir = dir;
    fail.code = 'EIO';
    const f = join(dir, 'eio.txt');
    expect(() => writeDurable(f, 'x')).toThrow(expect.objectContaining({ code: 'EIO' }));
    expect(() => writeDurable(f, null)).toThrow(expect.objectContaining({ code: 'EIO' }));
  });
});
