// The hero × language matrix (4.4.0, src/engine/tools/hero-matrix.ts): per line that depends on the hero, what each
// hero reads and hears in each language, and what is wrong (a missing clip, an untranslated line, a lost agreement, a
// value no switch lists). The heroes fixture (three heroes from the intro's choice) and its French "Ready?" line.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { GameDef } from '@engine/core/types';
import { heroMatrix } from '@engine/tools/hero-matrix';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { routes } from '../studio-server/src/ops/routes';
import { BrowserApi } from '../src/studio/api-browser';
import type { StudioSnapshot } from '../tools/studio/types';
import { heroes, heroesLayouts } from './fixtures/heroes';
import { frReady, readyGame } from './fixtures/voice-locale';

const SNEEZE_FR = 'room:hall/talk.grandma[1].do.sneeze.say';
const row = (m: ReturnType<typeof heroMatrix>, id: string) => m.rows.find((r) => r.id === id)!;

describe('heroMatrix', () => {
  it('a column per hero the intro sets, headed by its variant; a row per line with an id that depends on it', () => {
    const m = heroMatrix(heroes());
    expect(m.langs).toEqual(['en']);
    expect(m.columns.map((c) => [c.key, c.hero.names.en, c.hero.portrait, c.hero.variant])).toEqual([
      ['form=knight', 'Sir Lance', 'kid/knight_face', 0],
      ['form=witch', 'Morwen', 'kid/witch_face', 1],
      ['form=robot', 'Robo', 'kid/robot_face', undefined],
    ]);
    expect(m.rows.map((r) => r.id)).toEqual(['sneeze']);
    const s = row(m, 'sneeze');
    expect(s.cells.map((c) => [c[0]!.text, c[0]!.clip, c[0]!.file, c[0]!.missing])).toEqual([
      ['Under the rug. Mind the dust: it makes him sneeze.', 'sneeze~form=knight', 'grandma/sneeze-him.mp3', undefined],
      ['Under the rug. Mind the dust: it makes her sneeze.', 'sneeze~form=witch', 'grandma/sneeze-her.mp3', undefined],
      ['Under the rug. Mind the dust: it makes it sneeze.', 'sneeze~form=robot', 'grandma/sneeze-it.mp3', undefined],
    ]);
    expect(s.problem).toBe(false);
  });

  it('{hero} takes the variant’s name in each language', () => {
    const g = heroes();
    g.rooms[0]!.on!.push({ verb: 'look', a: 'door', do: [{ say: ['kid', 'Bye, {hero}.'], id: 'bye' }] });
    const fr = { 'room:hall/on[3].do.bye.say': 'Salut, {hero}.', 'char:kid/variants[1].name': 'Morgane' };
    const m = heroMatrix(g, { fr });
    expect(m.columns[1]!.hero.names).toEqual({ en: 'Morwen', fr: 'Morgane' });
    expect(row(m, 'bye').cells.map((c) => c.map((x) => x.text))).toEqual([
      ['Bye, Sir Lance.', 'Salut, Sir Lance.'],
      ['Bye, Morwen.', 'Salut, Morgane.'],
      ['Bye, Robo.', 'Salut, Robo.'],
    ]);
  });

  it('a translation’s own switch: the line is a row, each hero’s French clip, the English one missing', () => {
    const m = heroMatrix(readyGame(), { fr: frReady });
    expect(m.langs).toEqual(['en', 'fr']);
    const r = row(m, 'ready');
    expect(r.cells.map((c) => c[1]!.text)).toEqual(['Prêt ?', 'Prête ?', 'Prêt ?']);
    expect(r.cells.map((c) => c[1]!.clip)).toEqual(['ready~form=knight', 'ready~form=witch', 'ready~form=robot']);
    expect(r.cells[0]![0]).toEqual({ text: 'Ready?', want: 'ready', missing: true });
    expect(r.untranslated).toEqual([]);
    expect(r.agreement).toEqual([]);
    expect(r.problem).toBe(true);
    // The sneeze line is not in the French table: untranslated, and French has no clip for it.
    const s = row(m, 'sneeze');
    expect(s.untranslated).toEqual(['fr']);
    expect(s.cells[0]![1]).toMatchObject({ want: 'sneeze~form=knight', missing: true });
    expect(s.cells[0]![1]!.clip).toBeUndefined();
  });

  it('the plain clip as the fallback of a missing keyed one', () => {
    const g = readyGame();
    delete g.audio!.voicesByLang!.fr!['ready~form=witch'];
    const c = row(heroMatrix(g, { fr: frReady }), 'ready').cells[1]![1]!;
    expect(c).toMatchObject({ want: 'ready~form=witch', clip: 'ready', file: 'fr/ready.mp3', fallback: true });
    expect(c.missing).toBe(true);
  });

  it('a translation that drops the source’s switch: a lost agreement; one without clips of its own borrows', () => {
    const lost = heroMatrix(heroes(), { fr: { [SNEEZE_FR]: 'Sous le tapis.' } });
    expect(row(lost, 'sneeze').agreement).toEqual(['fr']);
    const kept = heroMatrix(heroes(), { fr: { [SNEEZE_FR]: 'Ça {form?robot=le|witch=la|knight=le} fait éternuer.' } });
    const s = row(kept, 'sneeze');
    expect(s.agreement).toEqual([]);
    expect(s.untranslated).toEqual([]);
    expect(s.cells[1]![1]).toMatchObject({ text: 'Ça la fait éternuer.', clip: 'sneeze~form=witch', borrowed: true });
    expect(s.problem).toBe(false);
  });

  it('a value no switch lists, without *=: the first text shows, said', () => {
    const g = heroes();
    const say = g.rooms[0]!.talk!.grandma![1]!.do![0] as { say: [string, string] };
    say.say[1] = 'It makes {form?witch=her|knight=him} sneeze.';
    const s = row(heroMatrix(g), 'sneeze');
    expect(s.cells[2]![0]).toMatchObject({ text: 'It makes her sneeze.', unlisted: ['form=robot'] });
    expect(s.cells[0]![0]!.unlisted).toBeUndefined();
    expect(s.problem).toBe(true);
  });

  it('caps the combinations; a game without switches has no column', () => {
    const m = heroMatrix(heroes(), {}, { maxColumns: 2 });
    expect(m.columns.map((c) => c.key)).toEqual(['form=knight', 'form=witch']);
    expect(m.truncated).toBe(1);
    const plain = heroes();
    plain.rooms[0]!.talk!.grandma![1]!.do = [{ say: ['grandma', 'Under the rug.'], id: 'sneeze' }];
    plain.rooms[0]!.look!.grandma = 'Grandma.';
    plain.rooms[0]!.talk!.grandma![0]!.do = ['Hi.'];
    plain.rooms[0]!.on![0]!.do = ['Got it!'];
    plain.rooms[0]!.on![2]!.do = [{ end: true }];
    plain.items.key!.look = 'A key.';
    expect(heroMatrix(plain)).toEqual({ langs: ['en'], flags: [], columns: [], rows: [] });
  });
});

describe('the Studio’s matrix', () => {
  const ROOT = resolve(__dirname, '..');
  const temps: string[] = [];
  afterAll(() => {
    for (const d of temps) rmSync(d, { recursive: true, force: true });
  });

  it('the server, its route and the in-browser demo give the same matrix', async () => {
    mkdirSync(join(ROOT, '.cache'), { recursive: true });
    const dir = mkdtempSync(join(ROOT, '.cache', 'hero-matrix-'));
    temps.push(dir);
    const fixture = JSON.stringify(pathToFileURL(join(ROOT, 'tests', 'fixtures', 'voice-locale.ts')).href);
    const heroesFile = JSON.stringify(pathToFileURL(join(ROOT, 'tests', 'fixtures', 'heroes.ts')).href);
    writeFileSync(
      join(dir, 'index.ts'),
      `import { readyGame } from ${fixture};
import { heroesLayouts } from ${heroesFile};
export const game = readyGame();
export const layouts = heroesLayouts;
export const manifest = {};
`,
    );
    mkdirSync(join(dir, 'layout'));
    writeFileSync(join(dir, 'layout', 'hall.json'), JSON.stringify(heroesLayouts.hall));
    mkdirSync(join(dir, 'locales'));
    writeFileSync(join(dir, 'locales', 'fr.json'), JSON.stringify(frReady));
    const importFresh = (file: string) => importInChild(file, ROOT);
    const studio = createStudio({ gameDir: dir, root: ROOT, importFresh });
    const want = heroMatrix(readyGame(), { fr: frReady });
    expect(await studio.heroMatrix()).toEqual(want);
    const route = routes(studio).find(([m, re]) => m === 'GET' && re.test('/hero-matrix'))!;
    expect(await route[2](route[1].exec('/hero-matrix')!, {}, { baseUrl: '' })).toEqual(want);
    const mod = (await importFresh(join(dir, 'index.ts'))) as { game: GameDef };
    const snapshot = {
      game: { id: mod.game.id },
      rooms: { hall: { layout: heroesLayouts.hall } },
    } as unknown as StudioSnapshot;
    const api = new BrowserApi({ snapshot, loadGame: async () => ({ game: mod.game, locales: { fr: frReady } }) });
    expect(await api.heroMatrix()).toEqual(want);
  }, 120_000);
});
