// The semantic diff (4.2.3 PR 4, plan H3): between two revisions, by what the game names. A source by the ids of its
// objects and the fields that changed; a JSON by the paths of its values; anything else, or what is not text, "file
// changed"; a long list cut and said so. Over a journal: the files the operations between the revisions wrote.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, type Studio } from '../studio-server/src/ops/core';
import { Journal } from '../studio-server/src/ops/journal';
import { diffFile, idsOf } from '../tools/studio/semantic-diff';

const ROOT = join(import.meta.dirname, '..');
const text = (t: string) => ({ present: true, text: t });
const gone = { present: false, text: null };

describe('the diff of one file', () => {
  it('names the ids a source added, removed and changed, with the fields that changed', () => {
    const a = `export default [{ id: 'r1', verb: 'take', a: 'key' }, { id: 'r2', say: 'hi' }, { id: 'r3', do: [{ id: 'r3.l1', text: 'x' }] }];`;
    const b = `export default [{ id: 'r1', verb: 'use', a: 'key', b: 'door' }, { id: 'r4', say: 'new' }, { id: 'r3', do: [{ id: 'r3.l1', text: 'y' }] }];`;
    expect(diffFile('rooms/hall.ts', text(a), text(b))).toEqual({
      path: 'rooms/hall.ts',
      change: 'changed',
      ids: {
        added: ['r4'],
        removed: ['r2'],
        // r3's field `do` holds r3.l1, which changed: said once, as r3.l1's.
        changed: [
          { id: 'r1', fields: ['b', 'verb'] },
          { id: 'r3.l1', fields: ['text'] },
        ],
      },
    });
    // A field shows the objects with ids of their own as their ids: a child added or removed is the field's change.
    expect(idsOf('x.ts', `[{ id: 'p', kids: [{ id: 'c1', t: 1 }] }]`).get('p')).toEqual(
      new Map([['kids', 'kids: [#c1]']]),
    );
  });

  it('tells an id written twice in a file by occurrence, and says a change outside every id as a file that changed', () => {
    const a = `export default { variants: [{ id: 'daily', w: 1 }], categories: [{ id: 'daily', rank: 1 }] };`;
    const b = `export default { variants: [{ id: 'daily', w: 1 }], categories: [{ id: 'daily', rank: 2 }] };`;
    expect(diffFile('game.ts', text(a), text(b)).ids!.changed).toEqual([{ id: 'daily#2', fields: ['rank'] }]);
    expect(diffFile('game.ts', text(`export default { title: 'A' };`), text(`export default { title: 'B' };`))).toEqual(
      {
        path: 'game.ts',
        change: 'changed',
        opaque: true,
      },
    );
  });

  it('names the value paths a JSON added, removed and changed', () => {
    const a = JSON.stringify({ walk: [1, 2], props: { lamp: { x: 1 } }, empty: {} });
    const b = JSON.stringify({ walk: [1, 3, 4], props: { lamp: { x: 2 }, desk: { x: 0 } }, list: [] });
    expect(diffFile('layout/hall.json', text(a), text(b)).values).toEqual({
      added: ['list', 'props.desk.x', 'walk[2]'],
      removed: ['empty'],
      changed: ['props.lamp.x', 'walk[1]'],
    });
  });

  it('says a file added or removed, and what it cannot read as a file that changed', () => {
    expect(diffFile('rooms/new.ts', gone, text(`[{ id: 'a' }]`))).toMatchObject({
      change: 'added',
      ids: { added: ['a'] },
    });
    expect(diffFile('notes.json', text('{"a":1}'), gone)).toMatchObject({
      change: 'removed',
      values: { removed: ['a'] },
    });
    expect(diffFile('art/x.png', text('a'), text('b'))).toEqual({ path: 'art/x.png', change: 'changed', opaque: true });
    expect(diffFile('rooms/hall.ts', { present: true, text: null }, text('x'))).toMatchObject({ opaque: true });
    expect(diffFile('broken.json', text('{'), text('{}'))).toMatchObject({ opaque: true });
  });

  it('cuts a list past 500 entries, and says so', () => {
    const many = JSON.stringify(Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`k${i}`, i])));
    const d = diffFile('big.json', text('{}'), text(many));
    expect(d.values!.added).toHaveLength(500);
    expect(d.cut).toBe(true);
  });
});

describe('the diff between two revisions', () => {
  let tmp: string, db: SqlDb, journal: Journal, studio: Studio;
  beforeAll(async () => {
    mkdirSync(join(ROOT, '.cache'), { recursive: true });
    tmp = mkdtempSync(join(ROOT, '.cache', 'studio-diff-'));
    const game = join(tmp, 'game');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    db = await openSqliteDb(join(tmp, 'j.sqlite'));
    journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir: game, hosted: true });
    studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild });
  }, 60_000);
  afterAll(async () => {
    await journal.close();
    await db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('names what the operations between them changed, file by file; a file written back is no change', async () => {
    const from = await journal.revision();
    const room = readFileSync(join(studio.gameDir, 'rooms', 'start.ts'), 'utf8');
    await studio.writeFiles(
      'w',
      [{ path: 'rooms/start.ts', after: room.replace("'Mine now.'", "'Mine, all mine.'") }],
      {
        undo: false,
      },
    );
    // The game's private files are a reviewer's to read nowhere: left out.
    await studio.writeFiles('w', [{ path: 'private/ending.md', after: 'sealed' }], { undo: false, guard: false });
    await studio.writeFiles('w', [{ path: 'notes.md', after: 'temporary' }], { undo: false, guard: false });
    await studio.writeFiles('w', [{ path: 'notes.md', after: null }], { undo: false, guard: false });
    const to = await journal.revision();
    const d = await studio.diff(from, to);
    expect(d.files).toEqual([
      {
        path: 'rooms/start.ts',
        change: 'changed',
        ids: { added: [], removed: [], changed: [{ id: 'start.take-bucket', fields: ['do'] }] },
      },
    ]);
    await expect(studio.diff(to, from)).rejects.toMatchObject({ status: 400 });
    await expect(studio.diff(0, to + 5)).rejects.toMatchObject({ status: 404 });
    await expect(studio.diff(0, 3_000)).rejects.toMatchObject({ status: 400 });
  });
});
