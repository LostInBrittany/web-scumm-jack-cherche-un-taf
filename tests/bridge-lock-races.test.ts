// The journal lock's races, made deterministic (4.1.8): the branches `JournalLock.acquire` takes when another process
// releases the lock between our `link` and our read (ENOENT, retried), when a rival renames its own lock over ours at
// the same instant (the read-back names another pid, retried), and when the file system answers something else than
// EEXIST or ENOENT (rethrown). On the Mac those branches were reached by chance under the real races and the mutants
// of store.ts:237–280 died; on CI's runner they never were, so the mutants survived. Here `node:fs` is the real one
// with two functions scripted per test. Each test says which mutants of the reality mutation set it kills.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => {
  type Fn = (...a: unknown[]) => unknown;
  const o = {
    read: vi.fn<Fn>(),
    link: vi.fn<Fn>(),
    passthrough: { read: undefined as Fn | undefined, link: undefined as Fn | undefined },
    /** The real functions again (a scripted answer never outlives its test). */
    restore() {
      o.read.mockReset();
      o.link.mockReset();
      if (o.passthrough.read) o.read.mockImplementation(o.passthrough.read);
      if (o.passthrough.link) o.link.mockImplementation(o.passthrough.link);
    },
  };
  return o;
});
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  fsMock.passthrough.read = (...a: unknown[]) => (actual.readFileSync as (...x: unknown[]) => unknown)(...a);
  fsMock.passthrough.link = (...a: unknown[]) => (actual.linkSync as (...x: unknown[]) => unknown)(...a);
  fsMock.restore();
  return { ...actual, readFileSync: fsMock.read, linkSync: fsMock.link };
});
const { JournalLock } = await import('../bridge/src/store');

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
afterEach(() => fsMock.restore());
const journal = (name: string) => {
  const d = mkdtempSync(join(tmpdir(), 'lock-race-'));
  temps.push(d);
  return join(d, `${name}.jsonl`);
};
const errno = (code: string) => Object.assign(new Error(code), { code });
// This file's own `node:fs` is the mocked one too: the real read is the passthrough kept by the mock.
const realRead = (...a: unknown[]) => fsMock.passthrough.read?.(...a);

describe('JournalLock under its races', () => {
  it('a lock released between our link and our read is tried again, and taken', () => {
    // kills store.ts:237 === → !==; 259 condition false (gone → false)
    const file = journal('released-between');
    new JournalLock(file, { pid: 1111, alive: () => true }).acquire(); // someone holds it
    fsMock.read.mockImplementationOnce(() => {
      throw errno('ENOENT'); // ...and released it right after our link failed: the file is gone when we read it
    });
    // the holder is gone for real too, so the retry's link succeeds
    fsMock.link.mockImplementationOnce(() => {
      throw errno('EEXIST');
    });
    fsMock.link.mockImplementationOnce((...a: unknown[]) => {
      rmSync(`${file}.lock`, { force: true });
      return fsMock.passthrough.link?.(...a);
    });
    const second = new JournalLock(file, { pid: 2222, alive: () => true });
    expect(() => second.acquire()).not.toThrow();
    expect(realRead(`${file}.lock`, 'utf8')).toBe('2222\n');
    second.release();
  });

  it('a read that fails for another reason than ENOENT is an error, not a retry', () => {
    // kills store.ts:237 === → !==; 259 condition true (gone → true)
    const file = journal('read-eacces');
    new JournalLock(file, { pid: 1111, alive: () => true }).acquire();
    fsMock.read.mockImplementationOnce(() => {
      throw errno('EACCES');
    });
    expect(() => new JournalLock(file, { pid: 2222, alive: () => true }).acquire()).toThrow(/EACCES/);
  });

  it('a link that fails for another reason than EEXIST is an error, not "someone holds it"', () => {
    // kills store.ts:253 condition false (code !== 'EEXIST' → false)
    const file = journal('link-eperm');
    fsMock.link.mockImplementationOnce(() => {
      throw errno('EPERM');
    });
    expect(() => new JournalLock(file, { pid: 2222, alive: () => true }).acquire()).toThrow(/EPERM/);
  });

  it('a take-over whose read-back finds the lock gone is tried again, and taken', () => {
    // kills store.ts:277 condition false (gone → false)
    const file = journal('takeover-gone');
    new JournalLock(file, { pid: 1111, alive: () => true }).acquire(); // a dead process's lock (alive says no below)
    let reads = 0;
    fsMock.read.mockImplementation((...a: unknown[]) => {
      reads++;
      if (reads === 2) throw errno('ENOENT'); // the read-back after our rename: the file vanished under us
      return realRead(...a);
    });
    const taker = new JournalLock(file, { pid: 2222, alive: (p) => p === 2222 });
    expect(() => taker.acquire()).not.toThrow();
    expect(realRead(`${file}.lock`, 'utf8')).toBe('2222\n');
    taker.release();
  });

  it('a take-over whose read-back fails for another reason is an error', () => {
    // kills store.ts:277 condition true (gone → true)
    const file = journal('takeover-eio');
    new JournalLock(file, { pid: 1111, alive: () => true }).acquire();
    let reads = 0;
    fsMock.read.mockImplementation((...a: unknown[]) => {
      reads++;
      if (reads === 2) throw errno('EIO');
      return realRead(...a);
    });
    expect(() => new JournalLock(file, { pid: 2222, alive: (p) => p === 2222 }).acquire()).toThrow(/EIO/);
  });

  it('a rival that takes the lock at the same instant, every time, wins: ours gives up after three tries', () => {
    // kills store.ts:280 condition false (holds !== String(pid) → false)
    const file = journal('rival');
    new JournalLock(file, { pid: 1111, alive: () => true }).acquire();
    let reads = 0;
    fsMock.read.mockImplementation((...a: unknown[]) => {
      reads++;
      const text = realRead(...a) as string;
      return text.trim() === '2222' ? '3333\n' : text; // whatever we wrote, the read-back names the rival
    });
    // every owner the reads name is gone (so each attempt takes over), and each read-back names the rival
    expect(() => new JournalLock(file, { pid: 2222, alive: () => false }).acquire()).toThrow(
      /another process keeps taking it/,
    );
    // 4.3.0 (the reread of the exemptions) kills store.ts `attempt < 3` → `<=`: three attempts exactly, each reading
    // the lock then reading it back; a fourth would read twice more.
    expect(reads).toBe(6);
  });
});
