// Which rooms the diff's captures draw (4.4.0, tools/studio/diff-rooms.ts): a room's layout, its source, its texts in
// a language; a room added or removed by its paths; shared files only, the first room as a sample; what nothing draws
// left out; the list cut past six rooms, and said so.
import { describe, expect, it } from 'vitest';
import { roomsToCapture } from '../tools/studio/diff-rooms';
import type { FileDiff } from '../tools/studio/semantic-diff';

const ROOMS = {
  house: 'rooms/house.ts',
  garden: 'rooms/garden.ts',
  market: 'rooms/market.ts',
  cellar: 'rooms/house.ts',
};
const changed = (path: string, more: Partial<FileDiff> = {}): FileDiff => ({ path, change: 'changed', ...more });

describe('the rooms the captures draw', () => {
  it("names a room by its layout, its source (every room of a shared file) and its texts, in the game's order", () => {
    const values = { added: [], removed: [], changed: ['room:market/name', 'room:garden/look.tank[0]'] };
    expect(
      roomsToCapture(
        [
          changed('layout/garden.json'),
          changed('rooms/house.ts', { opaque: true }),
          changed('locales/fr.json', { values }),
        ],
        ROOMS,
      ),
    ).toEqual({
      rooms: [
        { room: 'house', why: ['rooms/house.ts'] },
        { room: 'garden', why: ['layout/garden.json', 'locales/fr.json'] },
        { room: 'market', why: ['locales/fr.json'] },
        { room: 'cellar', why: ['rooms/house.ts'] },
      ],
    });
  });

  it('names a room added or removed by its paths, after the rooms the head holds', () => {
    expect(
      roomsToCapture(
        [
          { path: 'rooms/attic.ts', change: 'added' },
          { path: 'layout/attic.json', change: 'added' },
        ],
        ROOMS,
      ),
    ).toEqual({ rooms: [{ room: 'attic', why: ['layout/attic.json', 'rooms/attic.ts'] }] });
  });

  it('draws the first room for shared files only, and nothing for what is not drawn', () => {
    expect(roomsToCapture([changed('cast.ts', { opaque: true }), changed('site.json')], ROOMS)).toEqual({
      rooms: [{ room: 'house', why: ['shared: cast.ts', 'shared: site.json'] }],
    });
    // A language's text that names no room (a character's line) is shared too.
    const values = { added: [], removed: [], changed: ['char:grandma/name'] };
    expect(roomsToCapture([changed('locales/en.json', { values })], ROOMS).rooms).toEqual([
      { room: 'house', why: ['shared: locales/en.json'] },
    ]);
    // Shared files beside a room's own: that room alone.
    expect(roomsToCapture([changed('cast.ts'), changed('layout/market.json')], ROOMS).rooms).toEqual([
      { room: 'market', why: ['layout/market.json'] },
    ]);
    const notDrawn = [
      'storyboard.json',
      'groupings.json',
      'notes.json',
      'STORY.md',
      'playtests/a.json',
      'tests/x.test.ts',
      'private/ending.md',
      'art/house/bg.png',
      'audio/x.mp3',
      'ids.paths.json',
      'assets.gen.json',
    ];
    expect(
      roomsToCapture(
        notDrawn.map((p) => changed(p)),
        ROOMS,
      ),
    ).toEqual({ rooms: [] });
    expect(roomsToCapture([changed('cast.ts')], {})).toEqual({ rooms: [] });
  });

  it('cuts past six rooms, and says so', () => {
    const many = Array.from({ length: 8 }, (_, i) => changed(`layout/r${i}.json`));
    const r = roomsToCapture(many, {});
    expect(r.rooms.map((x) => x.room)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
    expect(r.cut).toBe(true);
    expect(roomsToCapture(many, {}, 8).cut).toBeUndefined();
  });
});
