// "Who Am I Today?" (games/heroes, 4.4.0): the playable example of choosing the hero. The game as it ships, not a
// fixture: it validates clean (a release included) against its own manifest and French table; the proof finishes for
// every hero; each hero is played through in English and in French with its name, Grandma's words for it and the clip
// recorded for it; a save keeps the hero; `npm run assets` ships the French clips; `npm run voices -- check` reads the
// French text. Its browser playthrough: games/heroes/e2e.mjs.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { GameDef } from '@engine/core/types';
import { langVoices } from '@engine/core/voice-key';
import { applyLocale } from '@engine/tools/i18n';
import { solve } from '@engine/tools/solve';
import { validate } from '@engine/tools/validate';
import { game, layouts, locales, manifest } from '../games/heroes';
import { collectRefs } from '../tools/refs';
import { runTool } from './run-tool';

const ROOT = resolve(__dirname, '..');
const assets = { images: manifest.images as Record<string, [number, number]> };

/** The game as a page in that language boots it (src/engine/boot.ts): the texts, and that language's clips. */
function page(lang: 'en' | 'fr'): GameDef {
  if (lang === 'en') return structuredClone(game);
  const t = applyLocale(structuredClone(game), locales.fr!);
  return { ...t, audio: { ...t.audio, voices: langVoices(game, 'fr') ?? {} } };
}

const HEROES = [
  {
    pick: 0,
    form: 'pixel',
    name: 'Pixel',
    en: { hello: 'Good morning, Pixel! Ready, my little fluffball?', dust: 'it tickles your whiskers.' },
    fr: { hello: 'Bonjour, Pixel ! Prêt, ma petite boule de poils ?', dust: 'elle chatouille tes moustaches.' },
    frBye: 'File, Pixel. Reviens sain et sauf !',
  },
  {
    pick: 1,
    form: 'biscuit',
    name: 'Biscuit',
    en: { hello: 'Good morning, Biscuit! Ready, my big sleepyhead?', dust: 'it tickles your big nose.' },
    fr: { hello: 'Bonjour, Biscuit ! Prêt, mon gros dormeur ?', dust: 'elle chatouille ton gros nez.' },
    frBye: 'File, Biscuit. Reviens sain et sauf !',
  },
  {
    pick: 2,
    form: 'gull',
    name: 'Gaby',
    en: { hello: 'Good morning, Gaby! Ready, my noisy seagull?', dust: 'it tickles your beak.' },
    // French agrees the greeting and the farewell with the gull: switches the English lines do not need.
    fr: { hello: 'Bonjour, Gaby ! Prête, ma mouette braillarde ?', dust: 'elle chatouille ton bec.' },
    frBye: 'File, Gaby. Reviens saine et sauve !',
  },
] as const;

async function play(g: GameDef, pick: number, store = new MemoryStore()) {
  const ui = new FakePresenter();
  const e = new Engine(g, layouts, ui, store);
  ui.picks = [pick];
  await e.newGame();
  return { e, ui, store };
}

describe('the heroes example (games/heroes)', () => {
  it('validates clean, a release included, with its manifest and its French table', () => {
    const r = validate(game, layouts, { assets, locales });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(validate(game, layouts, { assets, locales, release: true, translated: true }).errors).toEqual([]);
  });

  it('the proof finishes, and goes down every answer of the intro', async () => {
    const r = await solve(game, layouts, { mode: 'prove' });
    expect(r.finished).toBe(true);
    expect(r.softlockCount).toBe(0);
    // A gate only one hero may open: still finished, so the search went down that hero's card.
    const gate = (g: GameDef) => g.rooms[0]!.on!.find((x) => x.id === 'garden.use-key-gate')!;
    for (const { form } of HEROES) {
      const g = structuredClone(game);
      gate(g).if = { flag: 'form', eq: form };
      expect((await solve(g, layouts, { mode: 'prove' })).finished, form).toBe(true);
    }
    // A gate no hero may open: no ending.
    const none = structuredClone(game);
    gate(none).if = { flag: 'form', eq: 'dragon' };
    expect((await solve(none, layouts, { mode: 'prove' })).finished).toBe(false);
  });

  for (const lang of ['en', 'fr'] as const)
    for (const h of HEROES)
      it(`${lang}: ${h.name} is chosen on a card, named, greeted, voiced, and finishes`, async () => {
        const { e, ui } = await play(page(lang), h.pick);
        expect(ui.asked[0]!.texts).toEqual(['Pixel', 'Biscuit', 'Gaby']);
        expect(e.state.flags.form).toBe(h.form);
        expect(e.nameOf('hero')).toBe(h.name);
        ui.picks = [0];
        await e.act({ verb: 'talk', a: 'grandma' });
        expect(ui.log).toContain(`grandma: ${h[lang].hello}`);
        ui.picks = [1];
        await e.act({ verb: 'talk', a: 'grandma' });
        expect(ui.log.find((l) => l.startsWith('grandma: ') && l.endsWith(h[lang].dust))).toBeDefined();
        await e.act({ verb: 'take', a: 'can' });
        await e.act({ verb: 'use', a: 'key', b: 'gate' });
        expect(e.state.done).toBe(true);
        expect(ui.log).toContain(`grandma: ${lang === 'en' ? `Off you go, ${h.name}. Come back safe!` : h.frBye}`);
        // The dust line plays this hero's clip; the farewell, one English clip, and in French the gull's own.
        const bye = lang === 'fr' && h.form === 'gull' ? 'garden.bye~form=gull' : 'garden.bye';
        expect(ui.voices).toEqual([`garden.dust~form=${h.form}`, bye]);
        expect(ui.log.join('\n')).not.toMatch(/[{}]/);
      });

  it('a save keeps the hero: continued in a new engine, Gaby is still Gaby, in French', async () => {
    const { e, store } = await play(page('fr'), 2);
    await e.act({ verb: 'take', a: 'can' });
    e.save();
    const ui = new FakePresenter();
    const again = new Engine(page('fr'), layouts, ui, store);
    await again.continueGame();
    expect(again.state.flags.form).toBe('gull');
    expect(again.state.inventory).toEqual(['key']);
    expect(again.nameOf('hero')).toBe('Gaby');
    expect(again.character('hero')?.portrait).toBe('extras/r2c4');
    await again.act({ verb: 'use', a: 'key', b: 'gate' });
    expect(ui.log).toContain('grandma: File, Gaby. Reviens saine et sauve !');
  });

  it('npm run assets ships the French clips too (tools/refs.ts, `<lang>:<id>`)', () => {
    const voices = collectRefs({ game, layouts }).audio.voices ?? {};
    expect(voices['garden.dust~form=gull']).toBe('heroes-dust-gull.mp3');
    expect(voices['fr:garden.dust~form=gull']).toBe('heroes-fr-dust-gull.mp3');
    expect(voices['fr:garden.bye~form=gull']).toBe('heroes-fr-bye-gull.mp3');
    expect(Object.keys(voices)).toHaveLength(9);
  });

  it('npm run voices -- check reads the French text: the gull’s French farewell is no orphan', () => {
    const r = runTool(['tools/voices.ts', 'check'], { cwd: ROOT, env: { ...process.env, GAME: 'heroes' } });
    const out = r.stdout + r.stderr;
    expect(out).not.toMatch(/orphan|no line claims/);
    // Without ffprobe (the Windows runner) the clips cannot be measured: only the orphans are judged there.
    if (spawnSync('ffprobe', ['-version']).status !== 0) return;
    expect(out).toContain('[heroes] voices: 0 error(s), 0 warning(s)');
    expect(r.status).toBe(0);
  });
});
