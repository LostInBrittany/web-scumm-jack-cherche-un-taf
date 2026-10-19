// The journal's durable writes (4.2.1, studio-server/src/ops/durable.ts), pinned for the mutation set `studio-ops`:
// a removal of a file that is there and of one that is not, text and bytes written exactly, and the sweep of a
// folder that does not exist. What no test can reach on a POSIX runner is named in docs/dev/mutants.json.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sweepTemporaries, writeDurable } from '../studio-server/src/ops/durable';

let dir: string;
beforeEach(() => {
  mkdirSync(join(process.cwd(), '.cache'), { recursive: true });
  dir = mkdtempSync(join(process.cwd(), '.cache', 'durable-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

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
