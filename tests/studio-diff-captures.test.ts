// The diff's captures (4.4.0, studio-server/src/ops/diff-captures.ts), end to end on the demo game over a journal: a
// prop moved in a room's layout gives that room two different captures; a text nothing shows (a look line) gives two
// equal ones (the captures are deterministic); a revision is the folder with the later operations undone; a hosted
// Studio says the captures are unavailable. Each revision is really built (the worker's child) and drawn in Chromium
// (CI: the `studio-hosted` job, which installs it).
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, type Studio } from '../studio-server/src/ops/core';
import { snapshotAt } from '../studio-server/src/ops/diff-captures';
import { Journal } from '../studio-server/src/ops/journal';
import { snapshotTexts } from '../studio-server/src/worker/snapshot';
import type { DiffCaptures } from '../tools/studio/types';

const ROOT = join(import.meta.dirname, '..');
// Chromium: the unit jobs do not install it (the drawing is skipped there); `studio-hosted` does, and requires it.
const drawn = existsSync(chromium.executablePath()) || process.env.STUDIO_TEST_CAPTURES === '1';
type Ready = Exclude<DiffCaptures, { unavailable: true }>;

describe("the diff's captures", () => {
  let tmp: string, db: SqlDb, journal: Journal, studio: Studio;
  let r0: number, r1: number, r2: number;
  beforeAll(async () => {
    mkdirSync(join(ROOT, '.cache'), { recursive: true });
    tmp = mkdtempSync(join(ROOT, '.cache', 'studio-diff-captures-'));
    const game = join(tmp, 'game');
    cpSync(join(ROOT, 'games', 'demo'), game, { recursive: true });
    db = await openSqliteDb(join(tmp, 'j.sqlite'));
    journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir: game, hosted: true });
    studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild });
    r0 = await journal.revision();
    // r1: the garden's tank moved 200 px to the left.
    const layout = studio.getLayout('garden');
    const tank = layout.props!.tank!;
    await studio.setLayout('garden', { ...layout, props: { ...layout.props, tank: { ...tank, x: tank.x - 200 } } });
    r1 = await journal.revision();
    // r2: a look line of the market, which no capture shows.
    const market = readFileSync(join(game, 'rooms', 'market.ts'), 'utf8');
    await studio.writeFiles('w', [{ path: 'rooms/market.ts', after: market.replace('Still oranges.', 'Oranges.') }], {
      undo: false,
    });
    r2 = await journal.revision();
  }, 120_000);
  afterAll(async () => {
    await journal.close();
    await db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('puts a revision back: the folder with the later operations undone', async () => {
    const at0 = snapshotTexts(await snapshotAt(journal, studio.gameDir, r0));
    const at1 = snapshotTexts(await snapshotAt(journal, studio.gameDir, r1));
    const x = (t: Map<string, string>) => JSON.parse(t.get('layout/garden.json')!).props.tank.x as number;
    expect(x(at0) - x(at1)).toBe(200);
    expect(at1.get('rooms/market.ts')).toContain('Still oranges.');
    expect(snapshotTexts(await snapshotAt(journal, studio.gameDir, r2)).get('rooms/market.ts')).not.toContain(
      'Still oranges.',
    );
  });

  it.runIf(drawn)(
    'draws a moved prop as two different captures, and a text nothing shows as two equal ones',
    async () => {
      const c = (await studio.diffCaptures(r0, r2)) as Ready;
      expect(c.rooms.map((r) => [r.room, r.why])).toEqual([
        ['garden', ['layout/garden.json']],
        ['market', ['rooms/market.ts']],
      ]);
      const [garden, market] = c.rooms;
      for (const r of c.rooms) {
        expect(r.before, JSON.stringify(r.before)).toHaveProperty('url');
        expect(r.after, JSON.stringify(r.after)).toHaveProperty('url');
      }
      const png = (s: (typeof c.rooms)[number]['before']) => readFileSync(join(tmp, (s as { file: string }).file));
      expect(png(garden!.before).subarray(1, 4).toString()).toBe('PNG');
      expect(png(garden!.before).equals(png(garden!.after))).toBe(false);
      // Where they differ: the tank's two places, in the scene (above the verbs, from y 450), nothing else.
      const [x, y, w, h] = garden!.box!;
      expect(garden!.same).toBeUndefined();
      expect(y + h).toBeLessThan(450);
      expect(w).toBeGreaterThan(200);
      expect(x).toBeGreaterThan(123);
      // The look line is never drawn: no pixel off by more than the tolerance (an anti-aliased edge may move by 2).
      expect(market!.box).toBeUndefined();
      expect(market!.same).toBe(true);
      expect(c.size).toEqual([960, 600]);
      expect(existsSync(join(tmp, '.cache', 'studio', `game-diff-${r0}-${r2}`, `garden-r${r0}.png`))).toBe(true);
    },
    300_000,
  );

  it('says a hosted Studio has no captures', async () => {
    const hosted = createStudio({
      gameDir: studio.gameDir,
      root: tmp,
      journal,
      executor: { validate: async () => ({ ok: true, errors: [], warnings: [], ms: 0 }), load: async () => ({}) },
    });
    expect(await hosted.diffCaptures(r0, r1)).toMatchObject({ unavailable: true });
  });
});
