// Text switches (4.3.0, PLAN-4.3-HERO-CHOICE §3.2, core/text-switch.ts): `{hero}` and `{<flag>?<value>=<text>|…|*=<text>}`
// filled when a text is shown. The parser on its own (properties: a text without a switch comes back unchanged, a
// well-formed switch never leaves a brace), the engine's display sites (a hero line, another character's line, a
// choice, a toast, a caption, a fallback with `{name}`), the validator's checks and `npm run i18n -- status`.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { parseText, pickAlt, renderText, switchFlags } from '@engine/core/text-switch';
import type { Cmd, GameDef } from '@engine/core/types';
import { localeStatus, textPaths } from '@engine/tools/i18n';
import { validate } from '@engine/tools/validate';
import { mini, miniLayouts } from './fixtures/mini';

const noSwitch = fc.string().filter((s) => !/\{[\w.-]+\?/.test(s) && !s.includes('{hero}'));
const flag = fc.stringMatching(/^[a-z][\w.-]{0,8}$/);
const value = fc.stringMatching(/^[^=|{}]{1,6}$/);
const alt = fc.stringMatching(/^[^|{}]{0,10}$/);

describe('the parser', () => {
  it('returns a text without a switch or {hero} unchanged, byte for byte', () => {
    fc.assert(
      fc.property(noSwitch, fc.dictionary(flag, fc.oneof(fc.string(), fc.integer(), fc.boolean())), (s, flags) => {
        expect(renderText(s, flags, 'Sam')).toBe(s);
      }),
    );
    for (const s of ['{item} on {target}', '{code:door} and {hint:door}', '{name}', 'a } b { c', ''])
      expect(renderText(s, { form: 'f' }, 'Sam')).toBe(s);
  });

  it('renders any well-formed switch without braces, for any value of its flag', () => {
    fc.assert(
      fc.property(
        flag,
        fc.uniqueArray(fc.tuple(value, alt), { minLength: 1, maxLength: 5, selector: ([v]) => v }),
        fc.boolean(),
        fc.option(fc.oneof(value, fc.integer(), fc.boolean()), { nil: undefined }),
        (f, alts, star, v) => {
          const body = [
            ...alts.map(([a, t]) => `${a}=${t}`),
            ...(star && !alts.some(([a]) => a === '*') ? ['*=x'] : []),
          ];
          const s = `<{${f}?${body.join('|')}}>`;
          const flags = v === undefined ? {} : { [f]: v };
          const out = renderText(s, flags, 'Sam');
          expect(out).not.toMatch(/[{}]/);
          const p = parseText(s);
          expect(p.malformed).toEqual([]);
          expect(p.switches).toHaveLength(1);
          expect(p.switches[0]!.flag).toBe(f);
        },
      ),
    );
  });

  it('takes the value’s text, else *=, else the first; compares String(value)', () => {
    const s = 'Grandma hugs {form?m=him|f=her|*=them}.';
    expect(renderText(s, { form: 'm' }, '')).toBe('Grandma hugs him.');
    expect(renderText(s, { form: 'f' }, '')).toBe('Grandma hugs her.');
    expect(renderText(s, { form: 'robot' }, '')).toBe('Grandma hugs them.');
    expect(renderText(s, {}, '')).toBe('Grandma hugs them.');
    expect(renderText('{form?m=him|f=her}', {}, '')).toBe('him');
    expect(renderText('content{form?f=e|*=} ?', { form: 'f' }, '')).toBe('contente ?');
    expect(renderText('content{form?f=e|*=} ?', { form: 'm' }, '')).toBe('content ?');
    expect(renderText('{n?1=once|2=twice|*=often}', { n: 2 }, '')).toBe('twice');
    expect(renderText('{done?true=yes|false=no}', { done: false }, '')).toBe('no');
    expect(renderText('{a?x=1}{b?y=2|*=3}', { a: 'x' }, '')).toBe('13');
    expect(renderText('{rank?sir=Sir {hero}|*=x}', { rank: 'sir' }, 'Sam')).toBe('{rank?sir=Sir Sam|*=x}');
    expect(pickAlt({ alts: [{ value: 'a', text: 'A' }] }, 'b')).toBe('A');
  });

  it('fills {hero} and asks for the name only when the text names the hero', () => {
    let asked = 0;
    const name = () => (asked++, 'Samia');
    expect(renderText('Good morning, {hero}! {hero}?', {}, name)).toBe('Good morning, Samia! Samia?');
    expect(renderText('Good morning.', {}, name)).toBe('Good morning.');
    expect(asked).toBe(1);
  });

  it('reads a text of the wrong type as holding nothing, so the validator goes on (4.3.0)', () => {
    expect(parseText(1 as unknown as string)).toEqual({ switches: [], hero: false, malformed: [] });
    expect(renderText(1 as unknown as string, {}, 'Lance')).toBe(1);
  });

  it('leaves a malformed switch as written and says why', () => {
    for (const [s, why] of [
      ['{form?}', 'no alternative'],
      ['{form?m}', 'no "="'],
      ['{form?=x}', 'no value'],
      ['{form?m=a|m=b}', 'listed twice'],
      ['{form?m=a', 'no closing'],
      ['{form?m={item}}', 'no nesting'],
    ] as const) {
      const p = parseText(s);
      expect(p.switches, s).toEqual([]);
      expect(p.malformed[0]?.reason, s).toContain(why);
      expect(renderText(s, { form: 'm' }, 'Sam')).toBe(s);
    }
  });

  it('lists the flags a line depends on, sorted (voice keys, §3.4)', () => {
    expect(switchFlags('{mood?calm=…|*=!} {form?m=him|f=her} {form?m=he|f=she}')).toEqual(['form', 'mood']);
    expect(switchFlags('Hello {hero}')).toEqual([]);
  });
});

const engine = async (patch: (g: GameDef) => void = () => {}) => {
  const g = mini();
  patch(g);
  const ui = new FakePresenter();
  const e = new Engine(g, miniLayouts, ui, new MemoryStore());
  await e.newGame();
  e.state.flags.form = 'f';
  return { e, ui };
};

describe('the engine fills switches where a text is shown', () => {
  it('a hero line, another character’s line, a choice, a toast and a caption', async () => {
    const { e, ui } = await engine();
    ui.picks = [1];
    const cmds: Cmd[] = [
      'I am {hero}, {form?m=a boy|f=a girl}.',
      { say: ['ann', 'Hello {form?m=young man|f=young lady|*=you}!'] },
      { set: ['form', 'm'] },
      { say: ['ann', 'Now {form?m=him|f=her}.'] },
      {
        choice: [
          { text: '{form?m=Sir|*=Madam}', do: [] },
          { text: 'Bye, {hero}.', do: [] },
        ],
      },
      { toast: '{form?m=He|f=She} found it' },
      { sfx: 'ding', caption: '{form?m=his|f=her} phone rings' },
    ];
    ui.log.length = 0;
    await e.exec(cmds, { room: e.room(), fast: false });
    expect(ui.log).toEqual([
      'hero: I am Hero, a girl.',
      'ann: Hello young lady!',
      'ann: Now him.',
      'choose Bye, Hero.',
      'hero: Bye, Hero.',
      'toast He found it',
      'sfx ding [his phone rings]',
    ]);
    expect(ui.asked.at(-1)?.texts).toEqual(['Sir', 'Bye, Hero.']);
    // Text is presentation: the flags are as the commands left them, nothing more.
    expect(e.state.flags).toMatchObject({ form: 'm' });
  });

  it('a fallback with {name} and a switch in one line; a name with a switch', async () => {
    const { e, ui } = await engine((g) => {
      g.rules.fallbacks.look = ['{form?m=He|f=She} stares at the {name}.'];
      g.rooms[0]!.props!.valise!.name = '{form?m=his|f=her} suitcase';
    });
    expect(e.nameOf('valise')).toBe('her suitcase');
    ui.log.length = 0;
    await e.act({ verb: 'look', a: 'valise' });
    expect(ui.log.filter((l) => l.startsWith('hero:'))).toEqual(['hero: She stares at the her suitcase.']);
  });
});

/** The validator's messages about switches (the mini game has other findings of its own). */
const switchFindings = (g: GameDef) => {
  const r = validate(g, miniLayouts);
  const mine = (m: string) => /text switch|\{hero\}/.test(m);
  return { errors: r.errors.filter(mine), warnings: r.warnings.filter(mine) };
};

describe('the validator', () => {
  const withLine = (line: string, patch: (g: GameDef) => void = () => {}) => {
    const g = mini();
    g.rooms[0]!.on!.push({ verb: 'look', a: 'valise', do: [line] });
    g.start.intro = [
      {
        choice: [
          { text: 'A boy', do: [{ set: ['form', 'm'] }] },
          { text: 'A girl', do: [{ set: ['form', 'f'] }] },
        ],
      },
    ];
    patch(g);
    return switchFindings(g);
  };

  it('accepts switches that cover every written value, and {hero}', () => {
    expect(withLine('{hero} sees {form?m=his|f=her} case.')).toEqual({ errors: [], warnings: [] });
    expect(withLine('{form?f=She|*=He} sees it.')).toEqual({ errors: [], warnings: [] });
  });

  it('a malformed switch', () => {
    expect(withLine('{form?m=his|f}').errors).toEqual([
      expect.stringContaining('malformed text switch "{form?m=his|f}": "f" has no "="'),
    ]);
  });

  it('a flag no command sets', () => {
    expect(withLine('{mood?calm=ok|*=no}').errors).toEqual([
      expect.stringContaining('reads flag "mood", which no command sets'),
    ]);
  });

  it('a value listed that no set writes, a value written that is not covered', () => {
    const { errors } = withLine('{form?m=his|x=its}');
    expect(errors).toEqual([
      expect.stringContaining('lists value "x" for "form", which no set writes (written: m, f)'),
      expect.stringContaining('has no text for "form" = "f" (written at start.intro'),
    ]);
  });

  it('counts start flags and checkpoints as written values', () => {
    const { errors } = withLine('{form?m=his|f=her}', (g) => {
      g.start.flags = { form: 'm' };
      g.checkpoints = { robot: { room: 'a', flags: { form: 'robot' } } } as GameDef['checkpoints'];
    });
    expect(errors).toEqual([expect.stringContaining('has no text for "form" = "robot" (written at checkpoints.robot')]);
  });

  it('a counted flag needs *= (a warning), and a switch is a read of its flag', () => {
    const g = mini();
    g.rooms[0]!.on!.push({ verb: 'look', a: 'valise', do: [{ inc: 'n' }, 'Seen {n?1=once|2=twice}.'] });
    const r = validate(g, miniLayouts);
    expect(r.warnings.filter((w) => w.includes('text switch'))).toEqual([
      expect.stringContaining('the values of "n" cannot be listed (counted with inc'),
    ]);
    expect(r.warnings.some((w) => w.includes('flag "n" is set but never read'))).toBe(false);
  });

  it('a minigame’s result is the world’s: set, with values to cover with *=', () => {
    const g = mini();
    g.rooms[0]!.on!.push({
      verb: 'look',
      a: 'valise',
      do: [{ minigame: 'pipes', params: {} }, '{minigame.pipes?won=Done|*=Later}', '{minigame.pipes?won=Done}'],
    });
    expect(switchFindings(g)).toEqual({
      errors: [],
      warnings: [expect.stringContaining('the values of "minigame.pipes" cannot be listed (a minigame\'s result)')],
    });
  });

  it('a switch or {hero} in a text shown as written', () => {
    const { errors } = withLine('fine', (g) => {
      g.title = 'The {form?m=Boy|f=Girl}';
      g.characters.hero!.name = '{hero}';
      g.rooms[0]!.name = '{form?m=His|f=Her} room';
    });
    expect(errors).toHaveLength(3);
    expect(errors.every((e) => e.includes('in a text shown as written'))).toBe(true);
  });

  it("a switch or {hero} in a variant's name: the speech box shows it as written (4.3.0)", () => {
    const { errors } = withLine('fine', (g) => {
      g.characters.hero!.variants = [
        { if: { flag: 'form', eq: 'm' }, name: '{form?m=Sir|*=Dame} Lance' },
        { if: { flag: 'form', eq: 'f' }, name: '{hero}' },
      ];
    });
    expect(errors).toEqual([
      'char:hero/variants[0].name › "{form?m=Sir|*=Dame}" in a text shown as written: switches and {hero} are filled in lines, choices, looks, hints, toasts, captions, item and object names and objective titles only',
      'char:hero/variants[1].name › {hero} in a text shown as written: switches and {hero} are filled in lines, choices, looks, hints, toasts, captions, item and object names and objective titles only',
    ]);
  });
});

describe('npm run i18n', () => {
  const g = (): GameDef => {
    const x = mini();
    x.rooms[0]!.on!.push({ verb: 'look', a: 'valise', id: 'peek', do: ['Grandma hugs {form?m=him|f=her}.'] });
    return x;
  };
  const path = () => textPaths(g()).find((p) => p.text.includes('Grandma'))!.path;

  it('extract keeps the braces as written', () => {
    expect(textPaths(g()).find((p) => p.path === path())?.text).toBe('Grandma hugs {form?m=him|f=her}.');
  });

  it('status reports a translation that drops a choice its source’s switches make', () => {
    const table = Object.fromEntries(textPaths(g()).map((p) => [p.path, p.text]));
    const status = (t: string) => localeStatus(g(), { ...table, [path()]: t }).switches;
    expect(status('Grand-mère {form?f=la|m=le} serre.')).toEqual([]);
    // `*=` covers a value; a switch or a value added for the grammar is the translation's own.
    expect(status('Grand-mère {form?m=le|*=la} serre.')).toEqual([]);
    expect(status('Grand-mère {form?m=le|f=la|n=iel} serre, ravi{form?f=e|*=}.')).toEqual([]);
    expect(status('Grand-mère le serre.')).toEqual([{ path: path(), source: '{form?f|m}', translation: '' }]);
    expect(status('Grand-mère {form?m=le} serre.')).toHaveLength(1);
    expect(status('Grand-mère {mood?m=le|f=la} serre.')).toHaveLength(1);
    expect(status('Grand-mère {form?m=le|f} serre.')).toHaveLength(1);
  });
});
