// Studio demo mode: the build-time snapshot (tools/studio/snapshot.ts), the browser backend replaying the edits kept in
// localStorage (src/studio/api-browser.ts, run here with a fake storage) and `npm run studio-apply` writing them into a
// copy of games/demo. The browser backend's texts after the edits must match what the server reads back from the
// edited files: same paths, same values.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserApi, type GameModuleLike } from '../src/studio/api-browser';
import type { ListLine } from '@engine/core/types';
import { listText } from '@engine/core/list-lines';
import { patchGame, readPatches, storageKey, type KeyValue } from '../src/studio/demo-patch';
import { applyPatches, parsePatchFile } from '../studio-server/src/ops/apply';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { buildSnapshot } from '../tools/studio/snapshot';
import type { StudioSnapshot } from '../tools/studio/types';

const ROOT = resolve(__dirname, '..');
const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

function copyDemo(): string {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, '.cache', 'studio-demo-test-'));
  temps.push(dir);
  const src = join(ROOT, 'games', 'demo');
  cpSync(src, dir, { recursive: true, filter: (f) => !/[\\/](art|audio|private)([\\/]|$)/.test(f.slice(src.length)) });
  return dir;
}

class FakeStorage implements KeyValue {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const importFresh = (file: string) => importInChild(file, ROOT);
let snapshot: StudioSnapshot;
const loadGame = async (): Promise<GameModuleLike> => {
  const [g, eng] = await Promise.all([import('../games/demo/index'), import('../src/engine/minigames')]);
  const m = g.manifest as unknown as { images: Record<string, [number, number]>; audio?: Record<string, unknown> };
  return {
    game: g.game,
    minigames: { ...eng.minigames, ...g.minigames },
    commands: g.commands,
    locales: g.locales,
    assets: { images: m.images, audio: m.audio },
  };
};
const fresh = (storage = new FakeStorage()) => ({
  storage,
  api: new BrowserApi({ snapshot, storage, loadGame, now: () => new Date('2026-10-01T10:00:00Z') }),
});

beforeAll(async () => {
  snapshot = await buildSnapshot({ gameDir: copyDemo(), root: ROOT, importFresh });
}, 60000);

describe('snapshot', () => {
  it('has the shape the browser backend reads', () => {
    expect(snapshot.format).toBe('web-scumm-studio-snapshot');
    expect(snapshot.game.rooms.map((r) => r.id)).toEqual(['house', 'garden', 'market']);
    for (const r of snapshot.game.rooms) {
      const room = snapshot.rooms[r.id];
      expect(room.def.id).toBe(r.id);
      expect(room.layout).toBeTypeOf('object');
      expect(room.texts.length).toBeGreaterThan(5);
      expect(room.file).toMatch(new RegExp(`rooms/${r.id}\\.ts$`));
    }
    expect(Array.isArray(snapshot.storyboard.boards)).toBe(true);
    expect(snapshot.notes.entries).toBeInstanceOf(Array);
    expect(snapshot.docs.CONTENT_GUIDE).toContain('#');
    // 4.5.0: the wiki's index and its ready pages beside it (never a draft), for search_docs and read_doc by id.
    expect(snapshot.wiki?.index.format).toBe('quest-n-click-docs-index');
    expect(snapshot.wiki?.index.pages.every((p) => p.state === 'ready')).toBe(true);
    expect(snapshot.wiki?.provenance.source).toBe('repository');
    expect(Object.keys(snapshot.game.images).length).toBeGreaterThan(10);
  });
});

describe('browser backend', () => {
  it('replaces, appends and deletes texts, in the texts list and in the definition', async () => {
    const { api, storage } = fresh();
    expect(api.mode).toBe('demo');
    expect((await api.setText('house', 'look.pantry[0]', 'A cupboard. Sardines inside.')).changed).toBe(true);
    expect((await api.setText('house', 'look.pantry[0]', 'A cupboard. Sardines inside.')).changed).toBe(false);
    let room = await api.room('house');
    expect(room.texts.find((t) => t.path === 'look.pantry[0]')?.value).toBe('A cupboard. Sardines inside.');
    expect(listText((room.def.look!.pantry as ListLine[])[0])).toBe('A cupboard. Sardines inside.');

    // Single look line → list.
    await api.setText('house', 'look.shell[+]', 'It smells of the sea.');
    room = await api.room('house');
    expect(room.def.look!.shell).toEqual([snapshot.rooms.house.def.look!.shell, 'It smells of the sea.']);
    expect(
      room.texts
        .filter((t) => t.path.startsWith('look.shell'))
        .map((t) => t.path)
        .sort(),
    ).toEqual(['look.shell[0]', 'look.shell[1]']);

    // Deleting a line shifts the following ones.
    await api.setText('house', 'look.clock[0]', null);
    room = await api.room('house');
    expect(room.def.look!.clock).toEqual((snapshot.rooms.house.def.look!.clock as ListLine[]).slice(1));
    expect(room.texts.find((t) => t.path === 'look.clock[0]')?.value).toBe(
      listText((snapshot.rooms.house.def.look!.clock as ListLine[])[1]),
    );
    expect(room.texts.some((t) => t.path === 'look.clock[2]')).toBe(false);

    // A whole look entry; a hero line in a command list.
    await api.setText('house', 'look.door', null);
    await api.setText('house', 'on[1].do[+]', 'And a sock.');
    room = await api.room('house');
    expect(room.def.look!.door).toBeUndefined();
    expect(room.texts.some((t) => t.path.startsWith('look.door'))).toBe(false);
    expect(room.texts.find((t) => t.value === 'And a sock.')?.kind).toBe('hero');

    // Errors like the server's.
    await expect(api.setText('house', 'look.nothing[0]', 'x')).rejects.toMatchObject({ status: 404 });
    await expect(api.setText('house', 'props.clock.img', 'x')).rejects.toMatchObject({ status: 404 });
    await expect(api.setText('nowhere', 'name', 'x')).rejects.toMatchObject({ status: 404 });

    // Kept in the storage, replayed by a new backend (a reload).
    expect(readPatches(storage, api.gameId).filter((p) => p.kind === 'text')).toHaveLength(5);
    const again = new BrowserApi({ snapshot, storage });
    expect(await again.room('house')).toEqual(room);
  });

  it('keeps layouts, storyboard and notes, compacts what is overridden, and resets', async () => {
    const { api, storage } = fresh();
    const L = structuredClone(snapshot.rooms.house.layout);
    L.props = { ...L.props, clock: { ...(L.props?.clock ?? { x: 0, y: 0, h: 60 }), x: 111, y: 222 } };
    await api.setLayout('house', L);
    await api.setLayout('house', { ...L, props: { ...L.props, clock: { ...L.props!.clock, x: 112 } } });
    expect((await api.room('house')).layout.props!.clock).toMatchObject({ x: 112, y: 222 });

    const sb = await api.storyboardRaw();
    sb.title = 'Edited in the demo';
    expect((await api.setStoryboard(sb)).changed).toBe(true);
    expect((await api.setStoryboard(sb)).changed).toBe(false);
    expect((await api.storyboardRaw()).title).toBe('Edited in the demo');

    const n = await api.addNote({ about: 'house.clock', text: '  Too slow?  ' });
    expect(n).toMatchObject({ about: 'house.clock', author: 'you', text: 'Too slow?' });
    await api.editNote(n.id, { text: 'Too fast?' });
    const n2 = await api.addNote({ text: 'to delete' });
    await api.deleteNote(n2.id);
    expect((await api.notes()).entries.map((x) => x.text)).toEqual([
      ...snapshot.notes.entries.map((x) => x.text),
      'Too fast?',
    ]);
    await expect(api.editNote('nope', { text: 'x' })).rejects.toMatchObject({ status: 404 });

    // One layout, one storyboard, one note (its edit folded in, the deleted one gone).
    expect(readPatches(storage, api.gameId).map((p) => p.kind)).toEqual(['layout', 'storyboard', 'note']);
    const file = api.patchFile();
    expect(parsePatchFile(JSON.parse(JSON.stringify(file))).patches).toHaveLength(3);

    api.reset();
    expect(storage.map.has(storageKey(api.gameId))).toBe(false);
    expect((await api.room('house')).layout).toEqual(snapshot.rooms.house.layout);
    expect((await api.notes()).entries).toEqual(snapshot.notes.entries);
    expect(api.edits).toBe(0);
  });

  it('adds an entity to the definition, the texts and the layout', async () => {
    const { api } = fresh();
    await api.add('house', {
      kind: 'prop',
      id: 'vase',
      name: 'blue vase',
      at: [300, 320],
      look: 'A vase. No sardines in it.',
    });
    const room = await api.room('house');
    expect(room.def.props!.vase).toMatchObject({ name: 'blue vase' });
    expect(room.layout.props!.vase).toEqual({ x: 300, y: 320, h: 60 });
    expect(room.texts.find((t) => t.path === 'look.vase')?.value).toBe('A vase. No sardines in it.');
    await api.setText('house', 'look.vase[+]', 'Still a vase.');
    expect((await api.room('house')).def.look!.vase).toEqual(['A vase. No sardines in it.', 'Still a vase.']);
    await expect(api.add('house', { kind: 'prop', id: 'vase', name: 'x', at: [1, 1] })).rejects.toMatchObject({
      status: 409,
    });
    await expect(api.add('house', { kind: 'prop', id: 'v2', at: [1, 1] })).rejects.toMatchObject({ status: 400 });

    // The engine view gets the same game.
    const { game } = await loadGame();
    const patched = patchGame(game, {}, api.patchFile().patches);
    expect(patched.game.rooms.find((r) => r.id === 'house')!.props!.vase).toBeTruthy();
    expect(patched.layouts.house.props!.vase).toEqual({ x: 300, y: 320, h: 60 });
    expect(game.rooms.find((r) => r.id === 'house')!.props!.vase).toBeUndefined();
  });

  it('validates and solves the edited game in the browser', async () => {
    const { api } = fresh();
    const v0 = await api.validate();
    expect(v0.ok).toBe(true);
    await api.setText('house', 'look.pantry[0]', 'Sardines. '.repeat(20).trim());
    const v1 = await api.validate();
    expect(v1.warnings.length).toBe(v0.warnings.length + 1);
    expect(v1.warnings.some((w) => w.includes('long text'))).toBe(true);
    const s = await api.solve();
    expect(s.finished).toBe(true);
    await expect(api.solve('nope')).rejects.toMatchObject({ status: 400 });
    await expect(api.screenshot()).rejects.toMatchObject({ status: 501 });
  }, 60000);
});

describe('studio-apply', () => {
  it('writes the demo edits into a copy of the game, which reads back as the demo showed them', async () => {
    const { api } = fresh();
    await api.setText('house', 'look.pantry[1]', 'Locked. Of course.');
    await api.setText('house', 'look.shell[+]', 'Shells: the phones of the sea.');
    await api.setText('house', 'look.clock[0]', null);
    await api.setText('garden', 'name', 'The jungle');
    await api.add('house', {
      kind: 'hotspot',
      id: 'rug',
      name: 'rug',
      at: [200, 350],
      look: 'A rug. Cat hair included.',
    });
    const L = { ...(await api.room('house')).layout };
    L.props = { ...L.props, teacup: { ...(L.props?.teacup ?? { x: 0, y: 0, h: 60 }), x: 400, y: 300 } };
    await api.setLayout('house', L);
    const sb = await api.storyboardRaw();
    sb.title = 'Applied';
    await api.setStoryboard(sb);
    await api.addNote({ about: 'house', author: 'demo', text: 'Applied from the demo' });

    const dir = copyDemo();
    const studio = createStudio({ gameDir: dir, root: ROOT, importFresh });
    const sum = await applyPatches(parsePatchFile(JSON.parse(JSON.stringify(api.patchFile()))).patches, studio);
    expect(sum.failed).toEqual([]);
    expect(sum.applied).toBe(8);

    const code = readFileSync(join(dir, 'rooms', 'house.ts'), 'utf8');
    expect(code).toContain('Locked. Of course.');
    expect(code).toContain('Shells: the phones of the sea.');
    for (const id of ['house', 'garden']) {
      const server = await studio.getRoom(id);
      const demo = await api.room(id);
      const pairs = (r: typeof server) => r.texts.map((t) => `${t.path} = ${t.value}`).sort();
      expect(pairs(demo)).toEqual(pairs(server));
      expect(demo.layout).toEqual(server.layout);
      expect(JSON.parse(JSON.stringify(demo.def))).toEqual(JSON.parse(JSON.stringify(server.def)));
    }
    expect(studio.getStoryboard().title).toBe('Applied');
    expect(studio.getNotes().entries.at(-1)).toMatchObject({
      about: 'house',
      author: 'demo',
      text: 'Applied from the demo',
    });
  }, 60000);
});
