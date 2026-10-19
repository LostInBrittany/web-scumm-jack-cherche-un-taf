// Comments (4.2.3 PR 3, plan H2): anchored on a stable id and the revision they were written at; a thread one level
// deep, resolved as a thread; a comment whose anchor the game no longer names is said orphan, never moved; each note of
// notes.json comes in once; a reviewer resolves their own threads only, and changes only their own text.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { anchorsOf, Comments } from '../studio-server/src/server/comments';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, db: SqlDb;
let known: Set<string> | null = new Set(['hall', 'hall.door', 'item:key']);
let rev = 3;
let now = 1_000;
const lea = { id: 'u-lea', name: 'Léa' };
const ana = { id: 'u-ana', name: 'Ana' };

beforeAll(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-comments-'));
  db = await openSqliteDb(join(tmp, 'c.sqlite'));
  await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
});
afterAll(async () => {
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});
const make = () => new Comments({ db, known: async () => known, revision: async () => rev, now: () => ++now });

describe('what a comment can be anchored on', () => {
  it("is every id of the game's IR, whether written or made by code, and the storyboard's boards and panels", () => {
    const ir = {
      provenance: { 'hall.r1': { file: 'rooms/hall.ts', line: 3 } },
      rooms: [{ id: 'hall' }],
      rules: [{ id: 'hall.r1' }, { id: 'hall.made-by-code' }],
      scripts: [{ id: 'intro' }],
      entities: [{ key: 'hall.door' }, { key: 'item:key' }, { key: 'char:lou' }],
      objectives: [{ id: 'out' }],
      world: { checkpoints: { c1: {} } },
    } as never;
    expect([...anchorsOf(ir, { boards: [{ id: 'b1', panels: [{ id: 'p1' }, { id: 3 }] }] })].sort()).toEqual(
      [
        'b1',
        'char:lou',
        'checkpoint:c1',
        'hall',
        'hall.door',
        'hall.made-by-code',
        'hall.r1',
        'intro',
        'item:key',
        'objective:out',
        'p1',
      ].sort(),
    );
    expect(anchorsOf(ir, null).has('hall')).toBe(true);
  });
});

describe('comments', () => {
  it('are anchored on a stable id and their revision; a reply joins its thread, on its anchor', async () => {
    const c = make();
    const a = await c.add({ anchor: 'hall.door', text: '  The door should creak.  ' }, ana);
    expect(a).toMatchObject({
      anchor: 'hall.door',
      rev: 3,
      parent: null,
      author: 'Ana',
      text: 'The door should creak.',
    });
    expect(a.orphan).toBe(false);
    rev = 4;
    const b = await c.add({ anchor: 'elsewhere', text: 'agreed', parent: a.id }, lea);
    // A reply takes its thread's anchor, whatever it said; a reply to a reply answers the thread.
    expect(b).toMatchObject({ anchor: 'hall.door', parent: a.id, rev: 4 });
    const d = await c.add({ text: 'and loud', parent: b.id }, ana);
    expect(d.parent).toBe(a.id);
    expect((await c.list('hall.door')).map((x) => x.text)).toEqual(['The door should creak.', 'agreed', 'and loud']);
    // On the game itself: no anchor.
    expect((await c.add({ text: 'Overall: lovely' }, ana)).anchor).toBe('');
  });

  it('says a comment orphan when its anchor is gone, never moves it, and says nothing when the game cannot be read', async () => {
    const c = make();
    const x = await c.add({ anchor: 'item:key', text: 'shinier' }, ana);
    known = new Set(['hall']);
    expect((await c.list('item:key'))[0]).toMatchObject({ id: x.id, anchor: 'item:key', orphan: true });
    known = null;
    expect((await c.list('item:key'))[0]!.orphan).toBe(false);
    known = new Set(['hall', 'hall.door', 'item:key']);
  });

  it('refuses an empty or long text, an anchor that is no id, a parent that does not exist', async () => {
    const c = make();
    await expect(c.add({ anchor: 'hall', text: '   ' }, ana)).rejects.toMatchObject({ status: 400 });
    await expect(c.add({ anchor: 'hall', text: 'x'.repeat(4001) }, ana)).rejects.toMatchObject({ status: 400 });
    await expect(c.add({ anchor: 'a b', text: 'x' }, ana)).rejects.toMatchObject({ status: 400 });
    await expect(c.add({ text: 'x', parent: 'c-none' }, ana)).rejects.toMatchObject({ status: 404 });
  });

  it("lets only its author change its text; resolves a thread as a whole, a reviewer's own threads only", async () => {
    const c = make();
    const t = await c.add({ anchor: 'hall', text: 'too dark' }, ana);
    const r = await c.add({ text: 'fixed', parent: t.id }, lea);
    await expect(c.update(t.id, { text: 'mine now' }, { id: lea.id, canResolve: true })).rejects.toMatchObject({
      status: 403,
    });
    expect((await c.update(t.id, { text: 'too dark here' }, { id: ana.id, canResolve: false })).edited).not.toBeNull();
    // Léa, a dev, resolves Ana's thread from its reply: the thread is resolved.
    await c.update(r.id, { resolved: true }, { id: lea.id, canResolve: true });
    expect((await c.list('hall')).find((x) => x.id === t.id)!.resolved).toBe(true);
    // A reviewer reopens their own thread, not another's.
    await c.update(t.id, { resolved: false }, { id: ana.id, canResolve: false });
    const other = await c.add({ anchor: 'hall', text: 'by Léa' }, lea);
    await expect(c.update(other.id, { resolved: true }, { id: ana.id, canResolve: false })).rejects.toMatchObject({
      status: 403,
    });
    await expect(c.update(t.id, { resolved: 'yes' }, { id: ana.id, canResolve: false })).rejects.toMatchObject({
      status: 400,
    });
    await expect(c.update('c-none', { resolved: true }, { id: ana.id, canResolve: true })).rejects.toMatchObject({
      status: 404,
    });
    // A reviewer who replied to another's thread does not resolve it through their reply.
    const theirs = await c.add({ anchor: 'hall', text: 'by Léa again' }, lea);
    const reply = await c.add({ text: 'a reviewer answers', parent: theirs.id }, ana);
    await expect(c.update(reply.id, { resolved: true }, { id: ana.id, canResolve: false })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('takes every note of notes.json once, none lost, a note about free text on the game', async () => {
    const c = make();
    const notes = [
      { id: 'n1', about: 'hall', author: 'you', text: 'A note', at: '2026-10-01T10:00:00.000Z' },
      {
        id: 'n2',
        about: 'the mood overall',
        author: 'claude',
        text: 'Darker',
        at: 'not a date',
        edited: '2026-10-02T00:00:00Z',
      },
      { id: 'n3', about: '', author: '', text: '', at: '2026-10-03T00:00:00Z' },
    ];
    expect(await c.importNotes(notes, lea)).toEqual({ imported: 3, already: 0 });
    expect(await c.importNotes(notes, lea)).toEqual({ imported: 0, already: 3 });
    const all = await c.list();
    const of = (t: string) => all.find((x) => x.text === t || x.text.endsWith(t))!;
    expect(of('A note')).toMatchObject({ anchor: 'hall', author: 'you', at: Date.parse('2026-10-01T10:00:00.000Z') });
    expect(of('Darker')).toMatchObject({ anchor: '', text: '(the mood overall) Darker', author: 'claude' });
    expect(of('Darker').edited).toBe(Date.parse('2026-10-02T00:00:00Z'));
    expect(of('(empty)')).toMatchObject({ author: 'someone' });
  });
});
