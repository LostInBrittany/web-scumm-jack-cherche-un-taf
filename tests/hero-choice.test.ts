// The hero chosen at New Game (4.3.0 "Hero Choice", PLAN-4.3-HERO-CHOICE §6 step 5): the fixture `heroes` has three
// heroes, one character with two variants (tests/fixtures/heroes.ts). The validator finds nothing; the solver finishes
// and every answer of the intro is a path to the end; each hero is played through with its name, Grandma's switched
// lines and `{hero}`; a French table gives the French words; a save keeps the hero.
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { parseSave, SaveEnvelopeV4Schema, saveEnvelope } from '@engine/core/save';
import type { GameDef } from '@engine/core/types';
import { applyLocale } from '@engine/tools/i18n';
import { lintContent } from '@engine/tools/lint';
import { solve } from '@engine/tools/solve';
import { validate } from '@engine/tools/validate';
import { heroes, heroesImages, heroesLayouts } from './fixtures/heroes';

/** The French table: some lines, the variants' names, the intro's answers; each with its own words in the braces. */
const fr: Record<string, string> = {
  'start/intro[0]': 'Qui suis-je ce matin ?',
  'start/intro[1].choice[0].text': 'Sire Lancelot',
  'start/intro[1].choice[1].text': 'Morwen',
  'start/intro[1].choice[2].text': 'Robo',
  'char:kid/variants[0].name': 'Sire Lancelot',
  'char:grandma/name': 'Grand-mère',
  'room:hall/talk.grandma[0].topic': 'Bonjour, Grand-mère !',
  // French agrees the adjective with the witch: a switch the English line does not need.
  'room:hall/talk.grandma[0].do[0].say':
    'Bonjour, {hero} ! Prêt{form?witch=e|*=}, {form?knight=mon brave chevalier|witch=ma sorcière futée|*=mon robot qui brille} ?',
  'room:hall/talk.grandma[1].do.sneeze.say':
    'Sous le tapis. Attention à la poussière : elle {form?robot=le|witch=la|knight=le} fait éternuer.',
  'room:hall/on[0].do[2]': '{form?robot=Clé acquise.|*=Je l’ai !}',
};

const cases = [
  {
    pick: 0,
    form: 'knight',
    name: 'Sir Lance',
    hello: 'Good morning, Sir Lance! Ready, my brave knight?',
    sneeze: 'it makes him sneeze',
    take: 'Got it!',
    fr: {
      name: 'Sire Lancelot',
      hello: 'Bonjour, Sire Lancelot ! Prêt, mon brave chevalier ?',
      sneeze: 'elle le fait',
    },
  },
  {
    pick: 1,
    form: 'witch',
    name: 'Morwen',
    hello: 'Good morning, Morwen! Ready, my clever witch?',
    sneeze: 'it makes her sneeze',
    take: 'Got it!',
    fr: { name: 'Morwen', hello: 'Bonjour, Morwen ! Prête, ma sorcière futée ?', sneeze: 'elle la fait' },
  },
  {
    pick: 2,
    form: 'robot',
    name: 'Robo',
    hello: 'Good morning, Robo! Ready, my shiny robot?',
    sneeze: 'it makes it sneeze',
    take: 'Key acquired.',
    fr: { name: 'Robo', hello: 'Bonjour, Robo ! Prêt, mon robot qui brille ?', sneeze: 'elle le fait' },
  },
] as const;

async function play(g: GameDef, pick: number, store = new MemoryStore()) {
  const ui = new FakePresenter();
  const e = new Engine(g, heroesLayouts, ui, store);
  ui.picks = [pick];
  await e.newGame();
  return { e, ui, store };
}

describe('choosing the hero (the heroes fixture)', () => {
  it('validates clean, with the portraits checked against the manifest', () => {
    const r = validate(heroes(), heroesLayouts, { assets: { images: heroesImages } });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('the lint has nothing to say about the heroes (the robot is the written look, on purpose)', () => {
    const codes = lintContent(heroes(), heroesLayouts).findings.map((f) => f.code);
    expect(codes).not.toContain('hero-looks-default');
    // The intro sets `form`, which only the variants and the switches read: not "decoration for the solver".
    expect(codes).not.toContain('action-dead');
  });

  it('the lint says when two heroes fall back to the written look (a typo in a variant’s condition)', () => {
    const g = heroes();
    g.characters.kid!.variants![1]!.if = { flag: 'form', eq: 'wich' };
    const found = lintContent(g, heroesLayouts).findings.filter((f) => f.code === 'hero-looks-default');
    expect(found.map((f) => [f.severity, f.where.path])).toEqual([
      ['info', 'start.intro[1].choice[1].do[0]'],
      ['info', 'start.intro[1].choice[2].do[0]'],
    ]);
    expect(found[0]!.message).toMatch(/"form" to "witch".*"kid".*"witch", "robot"/);
    // A variant that needs something else besides the flag is not that value's look either.
    const h = heroes();
    h.characters.kid!.variants![0]!.if = { all: [{ flag: 'form', eq: 'knight' }, { has: 'key' }] };
    expect(lintContent(h, heroesLayouts).findings.filter((f) => f.code === 'hero-looks-default')).toHaveLength(2);
    // Written by a room's rule too, and silenced like any finding.
    h.rooms[0]!.on!.push({ verb: 'use', a: 'door', do: [{ set: ['form', 'ghost'] }] });
    const r = lintContent(h, heroesLayouts, { ignore: ['hero-looks-default:start.intro[1].choice[0].do[0]'] });
    expect(r.findings.filter((f) => f.code === 'hero-looks-default').map((f) => f.where.path)).toEqual([
      'start.intro[1].choice[2].do[0]',
      'on[3].do[0]',
    ]);
  });

  it('the solver finishes, and each answer of the intro is a way to the end', async () => {
    const r = await solve(heroes(), heroesLayouts, { mode: 'prove' });
    expect(r.finished).toBe(true);
    expect(r.softlockCount).toBe(0);
    // Only one hero may open the door: the proof still finishes, so the search went down that answer of the intro.
    for (const { form } of cases) {
      const g = heroes();
      const door = g.rooms[0]!.on![2]!;
      door.if = { flag: 'form', eq: form };
      const only = await solve(g, heroesLayouts, { mode: 'prove' });
      expect(only.finished, form).toBe(true);
    }
  });

  for (const c of cases)
    it(`plays through as ${c.name}: the name, Grandma's switched lines, {hero}`, async () => {
      const { e, ui } = await play(heroes(), c.pick);
      expect(ui.asked[0]!.texts).toEqual(['Sir Lance', 'Morwen', 'Robo']);
      expect(e.state.flags.form).toBe(c.form);
      expect(e.character('kid')?.name).toBe(c.name);
      expect(e.nameOf('kid')).toBe(c.name);
      await e.act({ verb: 'look', a: 'grandma' });
      expect(ui.log.at(-1)).toMatch(/^kid: Grandma, knitting a \w+ for my \w+\.$/);
      ui.picks = [0];
      await e.act({ verb: 'talk', a: 'grandma' });
      expect(ui.log).toContain(`grandma: ${c.hello}`);
      ui.picks = [1];
      await e.act({ verb: 'talk', a: 'grandma' });
      expect(ui.log.find((l) => l.startsWith('grandma: Under the rug'))).toContain(c.sneeze);
      // Grandma's switched line plays the clip recorded for this hero.
      expect(ui.voices).toEqual([`sneeze~form=${c.form}`]);
      await e.act({ verb: 'take', a: 'rug' });
      expect(ui.log.at(-1)).toBe(`kid: ${c.take}`);
      await e.act({ verb: 'look', a: 'key' });
      expect(ui.log.at(-1)).toBe(`kid: A brass key, just the size of ${c.name}’s hand.`);
      await e.act({ verb: 'use', a: 'key', b: 'door' });
      expect(ui.log).toContain(`grandma: Off you go, ${c.name}. Come back safe!`);
      expect(ui.log.join('\n')).not.toMatch(/[{}]/);
    });

  for (const c of cases)
    it(`in French, as ${c.fr.name}: the table's own words inside the braces`, async () => {
      const { e, ui } = await play(applyLocale(heroes(), fr), c.pick);
      expect(ui.asked[0]!.texts).toEqual(['Sire Lancelot', 'Morwen', 'Robo']);
      expect(e.nameOf('kid')).toBe(c.fr.name);
      ui.picks = [0];
      await e.act({ verb: 'talk', a: 'grandma' });
      expect(ui.log).toContain(`grandma: ${c.fr.hello}`);
      ui.picks = [1];
      await e.act({ verb: 'talk', a: 'grandma' });
      expect(ui.log.find((l) => l.startsWith('grandma: Sous le tapis'))).toContain(c.fr.sneeze);
      await e.act({ verb: 'take', a: 'rug' });
      expect(ui.log.at(-1)).toBe(c.form === 'robot' ? 'kid: Clé acquise.' : 'kid: Je l’ai !');
    });

  it('a missing clip by value: the validator warns, the engine plays the plain id', async () => {
    const g = heroes();
    delete g.audio!.voices!['sneeze~form=robot'];
    g.audio!.voices!.sneeze = 'grandma/sneeze.mp3';
    expect(validate(g, heroesLayouts, { assets: { images: heroesImages } }).warnings).toEqual([
      expect.stringMatching(/voice:sneeze.*lacks 1 of 3 clip\(s\) by value: sneeze~form=robot/),
    ]);
    for (const [pick, clip] of [
      [2, 'sneeze'],
      [1, 'sneeze~form=witch'],
    ] as const) {
      const { e, ui } = await play(g, pick);
      ui.picks = [1];
      await e.act({ verb: 'talk', a: 'grandma' });
      expect(ui.voices).toEqual([clip]);
    }
  });

  it('a save keeps the hero: loaded in a new engine, Morwen is still Morwen', async () => {
    const { e, store } = await play(heroes(), 1);
    await e.act({ verb: 'take', a: 'rug' });
    e.save();
    const ui = new FakePresenter();
    const again = new Engine(heroes(), heroesLayouts, ui, store);
    await again.continueGame();
    expect(again.state.flags.form).toBe('witch');
    expect(again.state.inventory).toEqual(['key']);
    expect(again.nameOf('kid')).toBe('Morwen');
    expect(again.character('kid')?.portrait).toBe('kid/witch_face');
    await again.act({ verb: 'use', a: 'key', b: 'door' });
    expect(ui.log).toContain('grandma: Off you go, Morwen. Come back safe!');
  });

  it('the hero chosen at New Game goes through the save file and back: the 4.2 envelope, as JSON (4.3.0)', async () => {
    const g = heroes();
    const { e } = await play(g, 0);
    await e.act({ verb: 'take', a: 'rug' });
    // The envelope a 4.2.x player writes (schema 4), unchanged: the hero is a flag like any other.
    const file = JSON.parse(JSON.stringify(saveEnvelope(g, e.state)));
    expect(SaveEnvelopeV4Schema.parse(file).schema).toBe(4);
    expect(file.state.flags.form).toBe('knight');
    // A v3 envelope (before 4.1.15) is read the same way.
    const { variant: _v, ...v3 } = { ...file, schema: 3 };
    for (const env of [file, v3]) {
      const store = new MemoryStore();
      store.save(parseSave(g, env));
      const ui = new FakePresenter();
      const again = new Engine(heroes(), heroesLayouts, ui, store);
      await again.continueGame();
      expect(again.nameOf('kid')).toBe('Sir Lance');
      expect(again.character('kid')?.portrait).toBe('kid/knight_face');
      await again.act({ verb: 'use', a: 'key', b: 'door' });
      expect(ui.log).toContain('grandma: Off you go, Sir Lance. Come back safe!');
    }
  });

  it('a checkpoint names the hero with its flags', async () => {
    const ui = new FakePresenter();
    const e = new Engine(heroes(), heroesLayouts, ui, new MemoryStore());
    await e.checkpoint('knight_key');
    expect(e.nameOf('kid')).toBe('Sir Lance');
    await e.act({ verb: 'use', a: 'key', b: 'door' });
    expect(ui.log).toContain('grandma: Off you go, Sir Lance. Come back safe!');
  });
});
