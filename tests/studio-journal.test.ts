// The operation journal (4.2.1, plan P1, P5, P6): an operation is applied whole or not at all, recorded before it
// touches a file and confirmed after; a retry gets its recorded response; an interruption is rolled forward when the
// journal opens again; a file that matches neither side puts the project in maintenance; what changed outside is
// adopted; a stale base or a file rewritten meanwhile is a 409; two processes never write at once.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { ABSENT, sha256 } from '../studio-server/src/ops/durable';
import { Journal, LeaseLostError, MaintenanceError } from '../studio-server/src/ops/journal';

let root: string, game: string;
// Every database a test opens is closed before its folder goes: Windows deletes no open file.
let dbs: { close(): Promise<void> }[] = [];
const openDb = async () => {
  const db = await openSqliteDb(join(root, 'journal.sqlite'));
  dbs.push(db);
  return db;
};
const open = async (o: { holder?: string; leaseWaitMs?: number; leaseMs?: number } = {}) =>
  Journal.open({
    db: await openDb(),
    blobs: fsBlobStore(join(root, 'blobs')),
    gameDir: game,
    ...o,
  });
const read = (p: string) => readFileSync(join(game, p), 'utf8');

beforeEach(() => {
  mkdirSync(join(process.cwd(), '.cache'), { recursive: true });
  root = mkdtempSync(join(process.cwd(), '.cache', 'journal-'));
  game = join(root, 'game');
  mkdirSync(join(game, 'rooms'), { recursive: true });
  writeFileSync(join(game, 'rooms', 'a.ts'), 'a0');
  writeFileSync(join(game, 'notes.json'), '{}');
});
afterEach(async () => {
  for (const db of dbs) await db.close();
  dbs = [];
  rmSync(root, { recursive: true, force: true });
});

describe('the operation journal', () => {
  it('applies several files at once, one revision, each file stamped with it', async () => {
    const j = await open();
    const r0 = await j.revision();
    const r = await j.apply({
      author: 'lea',
      what: 'two files',
      effects: [
        { path: 'rooms/a.ts', after: 'a1' },
        { path: 'layout/a.json', after: '{"x":1}' },
      ],
      respond: (rev) => ({ rev }),
    });
    expect(r.rev).toBe(r0 + 1);
    expect(r.changed.sort()).toEqual(['layout/a.json', 'rooms/a.ts']);
    expect(read('rooms/a.ts')).toBe('a1');
    expect(read('layout/a.json')).toBe('{"x":1}');
    expect(await j.file('rooms/a.ts')).toEqual({ blob: sha256('a1'), rev: r.rev });
    expect(await j.file('rooms/missing.ts')).toEqual({ blob: ABSENT, rev: 0 });
    expect((await j.opsAfter(r0)).map((o) => [o.author, o.what])).toEqual([['lea', 'two files']]);
    await j.close();
  });

  it('a retry with the same id gets the recorded response and applies nothing twice', async () => {
    const j = await open();
    const op = (after: string) => ({
      id: 'op-1',
      author: 'lea',
      what: 'once',
      effects: [{ path: 'rooms/a.ts', after }],
      respond: (rev: number) => ({ rev, saw: after }),
    });
    const first = await j.apply(op('a1'));
    writeFileSync(join(game, 'rooms', 'a.ts'), 'a1'); // unchanged
    const again = await j.apply(op('a2'));
    expect(again.replayed).toBe(true);
    expect(again.response).toEqual(first.response);
    expect(read('rooms/a.ts')).toBe('a1');
    expect(await j.revision()).toBe(first.rev);
    await j.close();
  });

  it('an operation that changes nothing makes no revision', async () => {
    const j = await open();
    const r0 = await j.revision();
    const r = await j.apply({
      author: 'x',
      what: 'same',
      effects: [{ path: 'rooms/a.ts', after: 'a0' }],
      respond: () => 1,
    });
    expect(r.changed).toEqual([]);
    expect(await j.revision()).toBe(r0);
    await j.close();
  });

  it('rolls forward an operation interrupted between its intent and its files', async () => {
    const j = await open();
    // The state a crash leaves: the after-blobs stored, the intent logged, one file of two written.
    const blobs = fsBlobStore(join(root, 'blobs'));
    await blobs.put(Buffer.from('a9'));
    await blobs.put(Buffer.from('L9'));
    const db = await openDb();
    const rev = (await j.revision()) + 1;
    await db.run(
      "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ('crash', $1, 'lea', 'w', 'intent', $2, 0)",
      [
        rev,
        JSON.stringify([
          { path: 'rooms/a.ts', before: sha256('a0'), after: sha256('a9') },
          { path: 'layout/a.json', before: ABSENT, after: sha256('L9') },
        ]),
      ],
    );
    writeFileSync(join(game, 'rooms', 'a.ts'), 'a9');
    await j.close();
    const k = await open();
    expect(read('rooms/a.ts')).toBe('a9');
    expect(read('layout/a.json')).toBe('L9');
    expect(await k.revision()).toBe(rev);
    expect((await k.file('layout/a.json')).rev).toBe(rev);
    await k.close();
  });

  it('a file that is neither side of an interrupted operation puts the project in maintenance', async () => {
    const j = await open();
    const db = await openDb();
    await db.run(
      "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ('crash', 99, 'lea', 'w', 'intent', $1, 0)",
      [JSON.stringify([{ path: 'rooms/a.ts', before: sha256('a0'), after: sha256('a9') }])],
    );
    writeFileSync(join(game, 'rooms', 'a.ts'), 'something else');
    await j.close();
    await expect(open()).rejects.toBeInstanceOf(MaintenanceError);
  });

  it('a write that fails midway puts back what it wrote and logs the operation aborted', async () => {
    // The second file's folder is a file: its write fails after the first file was written.
    writeFileSync(join(game, 'blocked'), 'a file, not a folder');
    const j = await open();
    const r0 = await j.revision();
    const e = await j
      .apply({
        author: 'lea',
        what: 'half',
        effects: [
          { path: 'rooms/a.ts', after: 'a1' },
          { path: 'blocked/x.json', after: 'x' },
        ],
        respond: () => null,
      })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(read('rooms/a.ts')).toBe('a0');
    expect(await j.revision()).toBe(r0);
    await j.close();
  });

  it('adopts a change made outside before the next operation on that file', async () => {
    const j = await open();
    writeFileSync(join(game, 'rooms', 'a.ts'), 'edited by hand');
    const r = await j.apply({
      author: 'lea',
      what: 'next',
      effects: [{ path: 'rooms/a.ts', after: 'a2' }],
      respond: () => 0,
    });
    const ops = await j.opsAfter(r.rev - 2);
    expect(ops.map((o) => o.author)).toEqual(['external', 'lea']);
    await j.close();
  });

  it('a stale base or a file rewritten while the edit was prepared is a 409', async () => {
    const j = await open();
    const r = await j.apply({
      author: 'tom',
      what: 't',
      effects: [{ path: 'rooms/a.ts', after: 'a1' }],
      respond: () => 0,
    });
    const stale = await j
      .apply({
        author: 'lea',
        what: 'l',
        effects: [{ path: 'rooms/a.ts', after: 'a2' }],
        base: { 'rooms/a.ts': r.rev - 1 },
        respond: () => 0,
      })
      .catch((x: { status?: number }) => x);
    expect((stale as { status?: number }).status).toBe(409);
    const raced = await j
      .apply({
        author: 'lea',
        what: 'l',
        effects: [{ path: 'rooms/a.ts', after: 'a2' }],
        expect: { 'rooms/a.ts': sha256('a0') },
        respond: () => 0,
      })
      .catch((x: { status?: number }) => x);
    expect((raced as { status?: number }).status).toBe(409);
    expect(read('rooms/a.ts')).toBe('a1');
    await j.close();
  });

  it('a guard that refuses leaves no trace', async () => {
    const j = await open();
    const r0 = await j.revision();
    await expect(
      j.apply({
        author: 'lea',
        what: 'refused',
        effects: [{ path: 'rooms/a.ts', after: 'bad' }],
        guard: async () => {
          throw new Error('no');
        },
        respond: () => 0,
      }),
    ).rejects.toThrow('no');
    expect(read('rooms/a.ts')).toBe('a0');
    expect(await j.revision()).toBe(r0);
    await j.close();
  });

  it('another process holding the lease makes an operation wait, then refuse', async () => {
    const j = await open({ leaseWaitMs: 200 });
    const db = await openDb();
    await db.run('INSERT INTO studio_lease (id, holder, fence, until_ms) VALUES (1, $1, 99, $2)', [
      'other',
      Date.now() + 60_000,
    ]);
    const e = await j
      .apply({ author: 'lea', what: 'w', effects: [{ path: 'rooms/a.ts', after: 'a1' }], respond: () => 0 })
      .catch((x: { status?: number }) => x);
    expect((e as { status?: number }).status).toBe(503);
    // An expired lease is taken over.
    await db.run('UPDATE studio_lease SET until_ms = 0 WHERE id = 1');
    await j.apply({ author: 'lea', what: 'w', effects: [{ path: 'rooms/a.ts', after: 'a1' }], respond: () => 0 });
    expect(read('rooms/a.ts')).toBe('a1');
    await j.close();
  });

  it('keeps the project epoch across openings; temporary files are swept', async () => {
    const j = await open();
    const epoch = await j.epoch();
    await j.close();
    writeFileSync(join(game, 'rooms', '.a.ts.1.studio-tmp'), 'leftover');
    const k = await open();
    expect(await k.epoch()).toBe(epoch);
    expect(existsSync(join(game, 'rooms', '.a.ts.1.studio-tmp'))).toBe(false);
    await k.close();
  });
  it("a second live process rolls a dead writer's intent forward before its own operation, revisions in order", async () => {
    const a = await open();
    const b = await open();
    const blobs = fsBlobStore(join(root, 'blobs'));
    await blobs.put(Buffer.from('a9'));
    const db = await openDb();
    const r = (await a.revision()) + 1;
    // A dies after logging and writing nothing: its intent stays.
    await db.run(
      "INSERT INTO studio_ops (op_id, rev, author, what, state, effects, at) VALUES ('dead', $1, 'a', 'w', 'intent', $2, 0)",
      [r, JSON.stringify([{ path: 'rooms/a.ts', before: sha256('a0'), after: sha256('a9') }])],
    );
    const next = await b.apply({
      author: 'b',
      what: 'mine',
      effects: [{ path: 'notes.json', after: '{"n":1}' }],
      respond: () => 0,
    });
    expect(read('rooms/a.ts')).toBe('a9');
    expect(next.rev).toBe(r + 1);
    expect((await b.opsAfter(r - 1)).map((o) => [o.rev, o.what])).toEqual([
      [r, 'w'],
      [r + 1, 'mine'],
    ]);
    // The dead writer's id, retried, is answered as recovered, never applied again.
    const again = await b.apply({
      id: 'dead',
      author: 'a',
      what: 'w',
      effects: [{ path: 'rooms/a.ts', after: 'zz' }],
      respond: () => 'x',
    });
    expect(again.replayed).toBe(true);
    expect(again.response).toEqual({ recovered: true });
    await a.close();
    await b.close();
  });

  it('a writer whose lease was taken over cannot log its operation', async () => {
    const j = await open({ leaseMs: 60_000 });
    const db = await openDb();
    const e = await j
      .apply({
        author: 'lea',
        what: 'slow',
        effects: [{ path: 'rooms/a.ts', after: 'a1' }],
        // While the guard runs, another process takes the lease over (a new fence).
        guard: async () => {
          await db.run("UPDATE studio_lease SET holder = 'other', fence = fence + 1 WHERE id = 1");
        },
        respond: () => 0,
      })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LeaseLostError);
    expect(read('rooms/a.ts')).toBe('a0');
    await db.run('DELETE FROM studio_lease');
    await j.close();
  });

  it('a file written outside while the guard runs is a 409, never overwritten', async () => {
    const j = await open();
    const e = await j
      .apply({
        author: 'lea',
        what: 'w',
        effects: [{ path: 'rooms/a.ts', after: 'a1' }],
        guard: async () => {
          writeFileSync(join(game, 'rooms', 'a.ts'), 'saved by an editor meanwhile');
        },
        respond: () => 0,
      })
      .catch((x: { status?: number }) => x);
    expect((e as { status?: number }).status).toBe(409);
    expect(read('rooms/a.ts')).toBe('saved by an editor meanwhile');
    await j.close();
  });
});
