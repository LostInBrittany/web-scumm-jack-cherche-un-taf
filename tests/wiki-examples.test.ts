// The examples and configurations a page shows, run through the product's own validators by `wiki -- check` (4.5.0
// "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.4.3, phase A5): a ```room-example (a room's JSON, alone or with its layout, its
// items and its characters) goes through the engine's validator in a one-room game, as tests/classics.test.ts checks
// the classic mechanics; a ```studio-config goes through the Studio Server's `loadConfig`. A valid block passes; an
// invalid one fails the check with the page, the block's line and the validator's own message. Other fences are not
// run.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkWiki, trackedFiles } from '../tools/wiki/check';
import { roomExampleProblems, studioConfigProblems } from '../tools/wiki/examples';

const BASE = resolve('tests/fixtures/wiki/base');
const TRACKED = trackedFiles();
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

const GARDEN = {
  room: {
    id: 'garden',
    name: 'The garden',
    decor: 'starter/decor/backyard',
    props: { bucket: { name: 'bucket', img: 'starter/items/bucket' } },
    hotspots: { gate: { name: 'gate' } },
    look: { bucket: 'A bucket.', gate: 'The gate.' },
    on: [
      {
        id: 'garden.take-bucket',
        verb: 'take',
        a: 'bucket',
        if: '!bucket_taken',
        do: [{ set: 'bucket_taken' }, { hide: 'bucket' }, { gain: 'bucket' }, 'Mine now.'],
      },
      { id: 'garden.open-gate', verb: 'use', a: 'bucket', b: 'gate', do: ['Opened.', { end: true }] },
    ],
  },
  layout: {
    walk: {
      area: [
        [30, 250],
        [610, 250],
        [630, 395],
        [10, 395],
      ],
    },
    entries: { default: [320, 360] },
    hotspots: { gate: { rect: [480, 160, 70, 120], approach: [515, 300] } },
    props: { bucket: { x: 420, y: 330, h: 34 } },
    actors: {},
  },
  items: { bucket: { name: 'bucket', img: 'starter/items/bucket' } },
};
const CONFIG = {
  publicUrl: 'https://studio.example.fr',
  playUrl: 'https://play.example.fr',
  game: 'demo',
  workDir: '/tmp/studio',
  store: { kind: 'postgres' },
  blobs: { kind: 's3', host: 'cellar-c2.services.clever-cloud.com', bucket: 'studio' },
};

/** The fixture with create.rooms carrying the given fences after its first section, in both languages. */
function check(fences: string) {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-examples-'));
  temps.push(dir);
  cpSync(BASE, dir, { recursive: true });
  for (const lang of ['en', 'fr']) {
    const file = join(dir, lang, 'create.rooms.md');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n${fences}\n`);
  }
  return checkWiki({ wikiDir: dir, tracked: TRACKED, identifiers: [] });
}
const fence = (lang: string, body: unknown) =>
  `\`\`\`${lang}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}\n\`\`\``;
/** The line the added fence opens on: after each fixture page's lines and a blank line. */
const AT = { en: 33, fr: 22 };

describe('room-example blocks, through the engine validator', () => {
  it('passes a valid room, alone or with its layout, items and characters', () => {
    expect(roomExampleProblems(JSON.stringify(GARDEN))).toEqual([]);
    expect(
      roomExampleProblems(
        JSON.stringify({
          id: 'hall',
          name: 'Hall',
          decor: 'd/hall',
          on: [{ id: 'hall.look', verb: 'look', a: 'hall', do: ['A hall.'] }],
        }),
      ).filter((e) => !e.includes('"hall" is neither')),
    ).toEqual([]);
    expect(check(fence('room-example', GARDEN)).errors).toEqual([]);
  });

  it("fails the check with the page, the block's line and the validator's message", () => {
    const broken = structuredClone(GARDEN);
    (broken.room.on[1] as { a: string }).a = 'shovel';
    delete (broken.room.on[0] as { id?: string }).id;
    const r = check(fence('room-example', broken));
    expect(r.errors).toContain(
      `en/create.rooms.md line ${AT.en}: the room-example is refused: garden.on[0] › rule requires a stable "id" in schema v3`,
    );
    expect(r.errors).toContain(
      `fr/create.rooms.md line ${AT.fr}: the room-example is refused: garden.on[1] › "shovel" is neither an item nor something in the room`,
    );
  });

  it("validates a room with the game's own verbs and hero, which the template's verbs would refuse", () => {
    const custom = {
      room: {
        id: 'lab',
        name: 'Lab',
        decor: 'd/lab',
        hotspots: { lever: { name: 'lever' } },
        look: { lever: 'A lever.' },
        on: [{ id: 'lab.yank', verb: 'yank', a: 'lever', do: ['Clunk.', { end: true }] }],
      },
      layout: {
        entries: { default: [320, 360] },
        hotspots: { lever: { rect: [100, 100, 40, 80], approach: [120, 300] } },
      },
      characters: { ada: { name: 'Ada', color: '#fff', sprites: { idle: ['ada/idle'] } } },
      verbs: [
        { id: 'look', label: 'Look', color: '#fff' },
        { id: 'yank', label: 'Yank', color: '#fff' },
      ],
      hero: 'ada',
    };
    expect(roomExampleProblems(JSON.stringify(custom))).toEqual([]);
    const { verbs: _v, ...templateVerbs } = custom;
    expect(roomExampleProblems(JSON.stringify(templateVerbs)).some((e) => e.includes('yank'))).toBe(true);
    expect(roomExampleProblems(JSON.stringify({ ...custom, verbs: [] }))).toEqual([
      '"verbs" is a non-empty list of verbs ({ "id", "label", "color" })',
    ]);
    expect(check(fence('room-example', custom)).errors).toEqual([]);
  });

  it('refuses what is not a room: no JSON, no id, an unknown wrapper key', () => {
    expect(roomExampleProblems('{ id: garden }')[0]).toMatch(/^not JSON: /);
    expect(roomExampleProblems('{"name": "x"}')).toEqual(['the room has no "id"']);
    expect(roomExampleProblems(JSON.stringify({ room: GARDEN.room, cast: {} }))).toEqual([
      'unknown key(s) cast: a wrapper holds room, layout, items, characters, verbs, hero',
    ]);
  });
});

describe("studio-config blocks, through the Studio Server's loader", () => {
  it('passes a configuration the loader accepts', () => {
    expect(studioConfigProblems(JSON.stringify(CONFIG), 'x')).toEqual([]);
    expect(check(fence('studio-config', CONFIG)).errors).toEqual([]);
  });

  it("fails the check with the loader's message", () => {
    const r = check(fence('studio-config', { ...CONFIG, playUrl: CONFIG.publicUrl, debug: true }));
    expect(r.errors).toContain(
      `en/create.rooms.md line ${AT.en}: the studio-config is refused by the Studio Server's loader: en/create.rooms.md:${AT.en}: unknown key "debug"`,
    );
    const same = check(fence('studio-config', { ...CONFIG, playUrl: CONFIG.publicUrl }));
    expect(same.errors).toContain(
      `fr/create.rooms.md line ${AT.fr}: the studio-config is refused by the Studio Server's loader: fr/create.rooms.md:${AT.fr}: playUrl must be another origin than publicUrl (plan §6.1)`,
    );
  });

  it('runs no other fence', () => {
    expect(check(`${fence('json', '{ not json')}\n${fence('sh', 'npm run studio')}`).errors).toEqual([]);
  });
});
