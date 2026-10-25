// Voices by value in a translation that adds its own switch (4.3.1): English says "Ready?", French agrees it with the
// hero, `Prêt{form?witch=e|knight=|robot=} ?` (tests/fixtures/voice-locale.ts). The keys of a language come from its
// own text, all along the chain: the export lists the three French clips, the import takes them back, none is an
// orphan, the validator warns when one is missing (the command line, the Studio's server and its in-browser demo
// alike), and the engine plays them. The reverse too: a switch the translation drops asks no clip by value there.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { GameDef } from '@engine/core/types';
import { langVoices } from '@engine/core/voice-key';
import { applyLocale } from '@engine/tools/i18n';
import { validate } from '@engine/tools/validate';
import { mergeSheet, orphanClips, parseCsv, toCsv, voiceIds, voiceTable } from '@engine/tools/voices';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { validateDir } from '../studio-server/src/ops/validate-dir';
import { BrowserApi } from '../src/studio/api-browser';
import type { StudioSnapshot } from '../tools/studio/types';
import { heroesImages, heroesLayouts } from './fixtures/heroes';
import { runTool } from './run-tool';
import { frReady, READY_FR, readyGame } from './fixtures/voice-locale';

const ROOT = resolve(__dirname, '..');
const KEYS = ['ready~form=knight', 'ready~form=witch', 'ready~form=robot'];
const assets = { images: heroesImages };
const voiceWarnings = (ws: string[]) => ws.filter((w) => w.startsWith('voice:'));

/** The game as a French page boots it (src/engine/boot.ts): the texts translated, the French clips in `audio.voices`. */
function frenchPage(g: GameDef): GameDef {
  const t = applyLocale(g, frReady);
  return { ...t, audio: { ...t.audio, voices: langVoices(g, 'fr') ?? t.audio?.voices ?? {} } };
}

describe('a translation that adds a switch', () => {
  it('export, import, orphans: the French clips are the French text’s', () => {
    const g = readyGame();
    const fr = applyLocale(g, frReady);
    const rows = voiceTable(g, {}, 'fr', fr).filter((r) => r.id.startsWith('ready'));
    expect(rows.map((r) => [r.id, r.text, r.file])).toEqual([
      ['ready~form=witch', 'Prête ?', 'fr/ready-witch.mp3'],
      ['ready~form=knight', 'Prêt ?', 'fr/ready-knight.mp3'],
      ['ready~form=robot', 'Prêt ?', 'fr/ready-robot.mp3'],
      ['ready', expect.any(String), 'fr/ready.mp3'],
    ]);
    // The actors' table comes back with statuses: every row is known.
    const back = parseCsv(toCsv(rows.map((r) => ({ ...r, status: 'approved' as const }))));
    const m = mergeSheet({}, 'fr', back, voiceIds(fr));
    expect(m.unknown).toEqual([]);
    expect(Object.keys(m.sheet.fr!).sort()).toEqual([...KEYS, 'ready'].sort());
    expect(orphanClips(g, 'fr', fr)).toEqual([]);
    // The source's text alone knows none of them: the bug of 4.3.0.
    expect(KEYS.some((k) => voiceIds(g).has(k))).toBe(false);
    expect(orphanClips(g, 'fr')).toHaveLength(3);
  });

  it('the validator warns, in French only, when a French clip by value is missing', () => {
    const g = readyGame();
    const locales = { fr: frReady };
    expect(voiceWarnings(validate(g, heroesLayouts, { assets, locales }).warnings)).toEqual([]);
    delete g.audio!.voicesByLang!.fr!['ready~form=knight'];
    expect(voiceWarnings(validate(g, heroesLayouts, { assets, locales }).warnings)).toEqual([
      expect.stringMatching(
        /^voice:ready › .*lacks 1 of 3 clip\(s\) by value \(fr\): ready~form=knight \(the plain id/,
      ),
    ]);
  });

  it('the engine plays each hero’s French clip, and the plain one before the choice', async () => {
    for (const [pick, form] of [
      [0, 'knight'],
      [1, 'witch'],
      [2, 'robot'],
    ] as const) {
      const page = frenchPage(readyGame());
      const ui = new FakePresenter();
      const e = new Engine(page, heroesLayouts, ui, new MemoryStore());
      expect(e.voiceOf({ id: 'ready' }, READY_FR)).toBe('ready');
      ui.picks = [pick];
      await e.newGame();
      ui.picks = [2];
      await e.act({ verb: 'talk', a: 'grandma' });
      expect(ui.log).toContain(`grandma: ${form === 'witch' ? 'Prête ?' : 'Prêt ?'}`);
      expect(ui.voices).toEqual([`ready~form=${form}`]);
      expect(page.audio!.voices![`ready~form=${form}`]).toBe(`fr/ready-${form}.mp3`);
    }
  });

  it('the English game is left as it was', () => {
    const g = readyGame();
    const before = structuredClone(g);
    const en = { rows: voiceTable(g, {}, 'en'), orphans: orphanClips(g, 'en') };
    const fr = applyLocale(g, frReady);
    voiceTable(g, {}, 'fr', fr);
    orphanClips(g, 'fr', fr);
    mergeSheet({}, 'fr', [{ id: 'ready~form=witch', status: 'record' }], voiceIds(fr));
    validate(g, heroesLayouts, { assets, locales: { fr: frReady } });
    frenchPage(g);
    expect(g).toEqual(before);
    expect({ rows: voiceTable(g, {}, 'en'), orphans: orphanClips(g, 'en') }).toEqual(en);
    expect(en.rows.some((r) => r.id.startsWith('ready~'))).toBe(false);
  });

  it('the reverse: a switch the translation drops asks no clip by value in that language', () => {
    const g = readyGame();
    g.audio!.voicesByLang = { fr: { sneeze: 'fr/sneeze.mp3' } };
    const table = {
      'room:hall/talk.grandma[1].do.sneeze.say': 'Sous le tapis. Attention à la poussière, ça fait éternuer.',
    };
    const fr = applyLocale(g, table);
    expect(voiceWarnings(validate(g, heroesLayouts, { assets, locales: { fr: table } }).warnings)).toEqual([]);
    expect(orphanClips(g, 'fr', fr)).toEqual([]);
    expect(
      voiceTable(g, {}, 'fr', fr)
        .filter((r) => r.id.startsWith('sneeze'))
        .map((r) => r.id),
    ).toEqual(['sneeze']);
    // Without the table, the source's switches would ask three French clips: what 4.3.0 said.
    expect(voiceWarnings(validate(g, heroesLayouts, { assets }).warnings)).toHaveLength(1);
  });
});

describe('the same verdict everywhere', () => {
  const temps: string[] = [];
  afterAll(() => {
    for (const d of temps) rmSync(d, { recursive: true, force: true });
  });
  /** A game folder whose French clip `ready~form=knight` is missing. */
  function gameDir(): string {
    mkdirSync(join(ROOT, '.cache'), { recursive: true });
    const dir = mkdtempSync(join(ROOT, '.cache', 'voice-locale-'));
    temps.push(dir);
    const fixture = JSON.stringify(pathToFileURL(join(ROOT, 'tests', 'fixtures', 'voice-locale.ts')).href);
    const heroesFile = JSON.stringify(pathToFileURL(join(ROOT, 'tests', 'fixtures', 'heroes.ts')).href);
    writeFileSync(
      join(dir, 'index.ts'),
      `import { readyGame } from ${fixture};
import { heroesLayouts } from ${heroesFile};
const g = readyGame();
delete g.audio!.voicesByLang!.fr!['ready~form=knight'];
export const game = g;
export const layouts = heroesLayouts;
export const manifest = {};
`,
    );
    mkdirSync(join(dir, 'layout'));
    writeFileSync(join(dir, 'layout', 'hall.json'), JSON.stringify(heroesLayouts.hall));
    mkdirSync(join(dir, 'locales'));
    writeFileSync(join(dir, 'locales', 'fr.json'), JSON.stringify(frReady));
    writeFileSync(join(dir, 'voices.json'), '{}\n');
    return dir;
  }
  const importFresh = (file: string) => importInChild(file, ROOT);

  it('the command line, the Studio’s server and its in-browser demo warn the same', async () => {
    const dir = gameDir();
    const want = expect.stringMatching(/^voice:ready › .*\(fr\): ready~form=knight /);
    // The command line.
    const cli = runTool(['tools/validate.ts'], { cwd: ROOT, env: { ...process.env, GAME_DIR: dir } });
    const cliVoice = cli.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('voice:'));
    expect(cliVoice, cli.stdout + cli.stderr).toEqual([want]);
    // The Studio's server (its guard and the processing worker share validateDir).
    const server = await validateDir(dir, { root: ROOT, importFresh });
    expect(voiceWarnings(server.warnings)).toEqual(cliVoice);
    // The in-browser demo, on the same game and its French table (the snapshot gives only the rooms' layouts here).
    const mod = (await importFresh(join(dir, 'index.ts'))) as { game: GameDef };
    const snapshot = {
      game: { id: mod.game.id },
      rooms: { hall: { layout: heroesLayouts.hall } },
    } as unknown as StudioSnapshot;
    const api = new BrowserApi({ snapshot, loadGame: async () => ({ game: mod.game, locales: { fr: frReady } }) });
    expect(voiceWarnings((await api.validate()).warnings)).toEqual(cliVoice);
  }, 120_000);

  it('the Studio takes a status for a French clip by value', async () => {
    const dir = gameDir();
    const studio = createStudio({ gameDir: dir, root: ROOT, importFresh });
    await expect(studio.setVoice('fr', 'ready~form=witch', { status: 'record' })).resolves.toEqual({ ok: true });
    await expect(studio.setVoice('fr', 'ready~form=nobody~x=y', { status: 'record' })).rejects.toThrow(/no line/);
    const v = await studio.voices('fr');
    expect(v.rows.find((r) => r.id === 'ready~form=witch')?.status).toBe('record');
  }, 120_000);
});
