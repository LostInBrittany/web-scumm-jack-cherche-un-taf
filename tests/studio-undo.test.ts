// Personal undo on a shared Studio (4.2.2 PR 4, plan §2.4, G5), two members: each undoes and redoes only their own
// operations, in their order, whatever the other wrote meanwhile; an undo is a new operation (history kept); 409 when
// the other wrote one of its files since; 423 when the other holds its span; a new edit drops the member's redo; the
// stacks are in the database (another studio on the same journal sees them).
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, operationContext } from '../studio-server/src/ops/core';
import { StudioError } from '../studio-server/src/ops/errors';
import { Journal } from '../studio-server/src/ops/journal';
import { spansOf } from '../studio-server/src/ops/spans';
import { PersonalUndo } from '../studio-server/src/ops/undo';
import { Leases } from '../studio-server/src/server/leases';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, game: string, db: SqlDb, journal: Journal, leases: Leases;
let studio: ReturnType<typeof createStudio>;
let roomA: string, roomB: string, roomC: string, layoutBefore: string;

const who = (u: string) => ({ userId: u, name: u });
const as = <T>(u: string, fn: () => Promise<T>): Promise<T> =>
  operationContext.run({ author: u, claimant: who(u) }, fn);
const layoutOf = (room: string) =>
  JSON.parse(readFileSync(join(game, 'layout', `${room}.json`), 'utf8')) as { entries?: Record<string, number[]> };
const move = (u: string, room: string, x: number) =>
  as(u, async () => {
    const l = layoutOf(room);
    await studio.setLayout(room, { ...l, entries: { ...l.entries, e2e: [x, x] } } as never);
  });
const at = (room: string) => layoutOf(room).entries?.e2e?.[0];

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-undo-'));
  game = join(tmp, 'game');
  cpSync(join(ROOT, 'games', 'demo'), game, { recursive: true });
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  leases = new Leases(db);
  journal = await Journal.open({
    db,
    blobs: fsBlobStore(join(tmp, 'blobs')),
    gameDir: game,
    claim: async (q, paths) => {
      const c = operationContext.getStore()?.claimant;
      if (!c) throw new StudioError('a write on a shared Studio says who writes', 500);
      await leases.claimPaths(q, c, paths);
    },
    precheck: async (paths) => {
      const c = operationContext.getStore()?.claimant;
      if (c) await leases.check(c, spansOf(paths));
    },
  });
  const personalUndo = new PersonalUndo(db, () => journal.epoch());
  studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, personalUndo });
  const info = await studio.gameInfo();
  [roomA, roomB, roomC] = info.rooms.map((r) => r.id) as [string, string, string];
  layoutBefore = readFileSync(join(game, 'layout', `${roomC}.json`), 'utf8');
}, 60_000);
afterAll(async () => {
  await journal.close();
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('personal undo, two members', () => {
  it("undoes and redoes a member's own operations only, in their order, as new operations", async () => {
    await move('lea', roomA, 10);
    await move('tom', roomB, 20);
    await move('lea', roomA, 11);
    const rev = await journal.revision();
    // Léa's undo is her last operation, not Tom's (which came after her first).
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true, what: `${roomA}: layout` });
    expect(at(roomA)).toBe(10);
    expect(at(roomB)).toBe(20);
    expect(await journal.revision()).toBe(rev + 1);
    expect(await as('lea', () => studio.history())).toEqual({ undo: [`${roomA}: layout`], redo: [`${roomA}: layout`] });
    // Tom's stack is his own.
    expect(await as('tom', () => studio.history())).toEqual({ undo: [`${roomB}: layout`], redo: [] });
    expect(await as('lea', () => studio.redo())).toMatchObject({ ok: true });
    expect(at(roomA)).toBe(11);
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true });
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true });
    expect(at(roomA)).toBeUndefined();
    expect(await as('lea', () => studio.undo())).toEqual({ ok: false, reason: 'nothing to undo' });
    // A new edit drops her redo.
    await move('lea', roomA, 12);
    expect((await as('lea', () => studio.history())).redo).toEqual([]);
    expect(await as('lea', () => studio.redo())).toEqual({ ok: false, reason: 'nothing to redo' });
    // Another studio on the same journal sees the same stacks.
    const other = createStudio({
      gameDir: game,
      root: tmp,
      journal,
      importFresh: importInChild,
      personalUndo: new PersonalUndo(db, () => journal.epoch()),
    });
    expect((await as('lea', () => other.history())).undo[0]).toBe(`${roomA}: layout`);
  }, 60_000);

  it('refuses (409) to undo over a file the other wrote since, and (423) where the other holds the span', async () => {
    await leases.release('lea');
    await leases.release('tom');
    await move('lea', roomB, 30);
    await leases.release('lea');
    await leases.release('tom');
    await move('tom', roomB, 31);
    await expect(as('lea', () => studio.undo())).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/was written again at revision \d+/),
    });
    expect(at(roomB)).toBe(31);
    // Tom's own undo is fine; then Léa's would be too, but Tom now holds the span: 423.
    expect(await as('tom', () => studio.undo())).toMatchObject({ ok: true });
    expect(at(roomB)).toBe(30);
    await expect(as('lea', () => studio.undo())).rejects.toMatchObject({ status: 423 });
    expect(at(roomB)).toBe(30);
    await leases.release('tom');
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true });
    expect(at(roomB)).toBe(20);
  }, 60_000);

  it('undoes an operation of several files, created ones included, and redoes it, next first in the history', async () => {
    await leases.release('lea');
    await leases.release('tom');
    const files = ['playtests/undo-a.md', 'playtests/undo-b.md'];
    await as('lea', () =>
      studio.writeFiles(
        'two notes',
        files.map((path) => ({ path, after: `${path}\n` })),
      ),
    );
    await as('lea', () => studio.writeFiles('third', [{ path: 'playtests/undo-c.md', after: 'c\n' }]));
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true, what: 'third' });
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true, what: 'two notes' });
    for (const f of [...files, 'playtests/undo-c.md']) expect(existsSync(join(game, f)), f).toBe(false);
    // The next redo comes first: the earliest undone.
    expect((await as('lea', () => studio.history())).redo.slice(0, 2)).toEqual(['two notes', 'third']);
    expect(await as('lea', () => studio.redo())).toMatchObject({ ok: true, what: 'two notes' });
    for (const f of files) expect(readFileSync(join(game, f), 'utf8')).toBe(`${f}\n`);
  }, 60_000);

  it('answers a retried edit once (no second record), and moves an undo already applied without writing it again', async () => {
    await leases.release('lea');
    await leases.release('tom');
    // The same operation id twice (a client's retry after a cut): one revision, one entry, the redo kept.
    await move('lea', roomA, 40);
    await as('lea', () => studio.undo());
    const redo = (await as('lea', () => studio.history())).redo;
    const rev = await journal.revision();
    const edit = () =>
      operationContext.run({ id: 'retry-1', author: 'lea', claimant: who('lea') }, async () => {
        const l = layoutOf(roomC);
        await studio.setLayout(roomC, { ...l, entries: { ...l.entries, e2e: [41, 41] } } as never);
      });
    await edit();
    const after = await as('lea', () => studio.history());
    await edit();
    expect(await journal.revision()).toBe(rev + 1);
    expect(await as('lea', () => studio.history())).toEqual(after);
    expect(after.redo).not.toEqual(redo);
    // An undo whose inverse landed but whose move was lost: the files are already back, it is moved, nothing written.
    await as('lea', () =>
      studio.writeFiles('the inverse, by hand', [{ path: `layout/${roomC}.json`, after: layoutBefore }], {
        undo: false,
      }),
    );
    const r2 = await journal.revision();
    expect(await as('lea', () => studio.undo())).toMatchObject({ ok: true, what: `${roomC}: layout` });
    expect(await journal.revision()).toBe(r2);
  }, 60_000);

  it('keeps the local Studio (no member) on its own process stack', async () => {
    await expect(operationContext.run({ author: 'x' }, () => studio.undo())).resolves.toBeDefined();
  });
});
