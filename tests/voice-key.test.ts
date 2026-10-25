// Voices by value (4.3.0, PLAN-4.3-HERO-CHOICE §3.4, core/voice-key.ts): a line with switches plays `<id>~<flag>=<value>`
// (flags sorted) before its plain id; an unset flag means the plain id; the voice table lists a clip per value; the
// validator warns about a voiced line missing one; a translated game's clips (`voicesByLang`, swapped in at boot)
// follow the same keys; the asset graph warms the keyed clips.
import { describe, expect, it } from 'vitest';
import { assetGraph } from '@engine/core/asset-graph';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { Cmd, GameDef } from '@engine/core/types';
import { langVoices, lineClip, voiceBase, voiceKey, voiceVariants } from '@engine/core/voice-key';
import { validate } from '@engine/tools/validate';
import { mergeSheet, orphanClips, voiceIds, voiceTable } from '@engine/tools/voices';
import { routes } from '../studio-server/src/ops/routes';
import { mini, miniLayouts } from './fixtures/mini';

const LINE = 'Grandma saw {form?m=him|f=her}.';
const TWO = '{mood?calm=Fine|angry=Grr}, {form?m=sir|f=madam|*=you}.';

describe('the key', () => {
  it('one switch: <id>~flag=value; several: flags sorted, values as String(v)', () => {
    expect(voiceKey('l1', LINE, { form: 'f' })).toBe('l1~form=f');
    expect(voiceKey('l2', TWO, { mood: 'calm', form: 'm' })).toBe('l2~form=m~mood=calm');
    expect(voiceKey('l3', '{lit?true=Light|false=Dark}', { lit: true })).toBe('l3~lit=true');
    expect(voiceKey('l4', '{n?2=two|*=many}', { n: 2 })).toBe('l4~n=2');
  });
  it('no switch, or a flag it reads unset: no keyed lookup', () => {
    expect(voiceKey('l1', 'Hello {hero}.', { form: 'f' })).toBeUndefined();
    expect(voiceKey('l1', LINE, {})).toBeUndefined();
    expect(voiceKey('l2', TWO, { form: 'f' })).toBeUndefined();
  });
  it('the lookup: the keyed clip, else the plain id, else nothing', () => {
    const v = { l1: 'l1.mp3', 'l1~form=f': 'l1-f.mp3' };
    expect(lineClip(v, 'l1', LINE, { form: 'f' })).toBe('l1~form=f');
    expect(lineClip(v, 'l1', LINE, { form: 'm' })).toBe('l1');
    expect(lineClip(v, 'l1', LINE, {})).toBe('l1');
    expect(lineClip({ 'l1~form=f': 'x' }, 'l1', LINE, { form: 'm' })).toBeUndefined();
    expect(lineClip(v, undefined, LINE, { form: 'f' })).toBeUndefined();
    expect(voiceBase('l2~form=m~mood=calm')).toBe('l2');
    expect(voiceBase('l2')).toBe('l2');
  });
  it('the variants: the cartesian product of the listed values, then the plain id when a switch has *=', () => {
    expect(voiceVariants('l1', LINE).map((v) => v.key)).toEqual(['l1~form=m', 'l1~form=f']);
    expect(voiceVariants('l2', TWO).map((v) => v.key)).toEqual([
      'l2~form=m~mood=calm',
      'l2~form=m~mood=angry',
      'l2~form=f~mood=calm',
      'l2~form=f~mood=angry',
      'l2',
    ]);
    expect(voiceVariants('l5', '{form?m=he|f=she} and {form?f=her|x=its}').map((v) => v.key)).toEqual([
      'l5~form=m',
      'l5~form=f',
      'l5~form=x',
    ]);
    expect(voiceVariants('l6', 'Plain.')).toEqual([{ key: 'l6' }]);
  });
});

/** The mini game with two voiced lines: a say command and a look list line, each with a switch. */
const voiced = (clips: Record<string, string>) => {
  const g = mini();
  g.rooms[0]!.on!.push({
    verb: 'look',
    a: 'valise',
    do: [{ say: ['hero', TWO], id: 'two' }] as Cmd[],
  });
  g.rooms[0]!.look = { ...g.rooms[0]!.look, badge: [{ id: 'grandma', text: LINE }] };
  g.start.intro = [
    {
      choice: [
        { text: 'A boy', do: [{ set: ['form', 'm'] }] },
        { text: 'A girl', do: [{ set: ['form', 'f'] }] },
      ],
    },
    { set: ['mood', 'calm'] },
    { if: { flag: 'x' }, then: [{ set: ['mood', 'angry'] }] },
  ];
  g.audio = { ...g.audio, voices: clips };
  return g;
};

const play = async (g: GameDef, flags: Record<string, string>) => {
  const ui = new FakePresenter();
  const e = new Engine(g, miniLayouts, ui, new MemoryStore());
  await e.newGame();
  for (const k of ['form', 'mood']) delete e.state.flags[k];
  Object.assign(e.state.flags, flags);
  ui.voices.length = 0;
  await e.exec([{ say: ['hero', TWO], id: 'two' }], { room: e.room(), fast: false });
  await e.exec([{ say: ['hero', LINE], id: 'grandma' }], { room: e.room(), fast: false });
  return ui.voices;
};

describe('the engine', () => {
  const clips = {
    two: 'two.mp3',
    'two~form=f~mood=calm': 'two-f-calm.mp3',
    'grandma~form=f': 'grandma-f.mp3',
    'grandma~form=m': 'grandma-m.mp3',
  };
  it('plays the keyed clip for the flags as they stand, else the plain id', async () => {
    expect(await play(voiced(clips), { form: 'f', mood: 'calm' })).toEqual(['two~form=f~mood=calm', 'grandma~form=f']);
    expect(await play(voiced(clips), { form: 'm', mood: 'calm' })).toEqual(['two', 'grandma~form=m']);
  });
  it('an unset flag: the plain id (or no clip when the line has none)', async () => {
    expect(await play(voiced(clips), { mood: 'calm' })).toEqual(['two']);
  });
  it('a look list line and an answer by kind follow the same rule', async () => {
    const g = voiced(clips);
    const ui = new FakePresenter();
    const e = new Engine(g, miniLayouts, ui, new MemoryStore());
    await e.newGame();
    e.state.flags.form = 'm';
    if (!e.state.inventory.includes('badge')) e.state.inventory.push('badge');
    ui.voices.length = 0;
    await e.act({ verb: 'look', a: 'badge' });
    expect(ui.voices).toEqual(['grandma~form=m']);
    expect(e.voiceOf({ id: 'grandma' }, LINE)).toBe('grandma~form=m');
  });
  it('a translated game: boot swaps audio.voices for voicesByLang[lang], the keys stay the same', async () => {
    const g = voiced(clips);
    g.audio!.voicesByLang = { fr: { 'grandma~form=f': 'fr/grandma-f.mp3', grandma: 'fr/grandma.mp3' } };
    // What bootGame does for a translated language (src/engine/boot.ts).
    expect(langVoices(g, 'en')).toBeUndefined();
    expect(langVoices(g, 'de')).toBeUndefined();
    expect(langVoices({ ...g, lang: 'fr' }, 'fr')).toBeUndefined();
    const fr = { ...g, audio: { ...g.audio, voices: langVoices(g, 'fr') } };
    expect(await play(fr, { form: 'f', mood: 'calm' })).toEqual(['grandma~form=f']);
    expect(await play(fr, { form: 'm', mood: 'calm' })).toEqual(['grandma']);
  });
  it('the asset graph warms every keyed clip of a line', () => {
    const files = assetGraph(voiced(clips), { manifest: { images: {} } }).offline;
    expect(files).toEqual(expect.arrayContaining(['voice:grandma-f.mp3', 'voice:grandma-m.mp3']));
  });
});

describe('the voice table', () => {
  it('one row per value for a line with switches (its text as it reads then), the plain id as the fallback', () => {
    const g = voiced({ 'grandma~form=f': 'grandma-f.mp3', 'grandma~form=m~mood=calm': 'stale.mp3', ghost: 'g.mp3' });
    const rows = voiceTable(g, { en: { 'grandma~form=m': { status: 'record', actor: 'Ann' } } }, 'en');
    const grandma = rows.filter((r) => r.id.startsWith('grandma'));
    expect(grandma).toEqual([
      { id: 'grandma~form=m', who: 'hero', text: 'Grandma saw him.', status: 'record', actor: 'Ann' },
      { id: 'grandma~form=f', who: 'hero', text: 'Grandma saw her.', status: 'recorded', file: 'grandma-f.mp3' },
    ]);
    const two = rows.filter((r) => r.id.startsWith('two')).map((r) => [r.id, r.text]);
    expect(two).toEqual([
      ['two~form=m~mood=calm', 'Fine, sir.'],
      ['two~form=m~mood=angry', 'Grr, sir.'],
      ['two~form=f~mood=calm', 'Fine, madam.'],
      ['two~form=f~mood=angry', 'Grr, madam.'],
      ['two', 'Fine, you.'],
    ]);
    // A keyed clip of a line with switches is claimed (the engine keys by the value, listed or not); `ghost` is not.
    expect(orphanClips(g, 'en')).toEqual([{ id: 'ghost', file: 'g.mp3' }]);
    expect(orphanClips({ ...g, audio: { voices: { 'nope~form=f': 'n.mp3' } } }, 'en')).toHaveLength(1);
    const ids = voiceIds(g);
    expect(ids.has('grandma~form=f') && ids.has('two') && ids.has('grandma')).toBe(true);
    const m = mergeSheet({}, 'en', [{ id: 'two~form=f~mood=angry', status: 'approved' }], ids);
    expect(m.unknown).toEqual([]);
    expect(m.sheet.en!['two~form=f~mood=angry']).toEqual({ status: 'approved' });
  });
});

describe('the Studio route', () => {
  it('PUT voices/<lang>/<id> takes a keyed id as the client encodes it', async () => {
    const seen: string[] = [];
    const table = routes({ setVoice: (_l: string, id: string) => (seen.push(id), { ok: true }) } as never);
    const put = (path: string) => {
      const r = table.find(([m, re]) => m === 'PUT' && re.test(path) && re.source.includes('voices'));
      return r?.[2](path.match(r[1])!, { status: 'record' }, { baseUrl: '' } as never);
    };
    await put(`/voices/fr/${encodeURIComponent('two~form=f~mood=calm')}`);
    await put('/voices/fr/grandma');
    expect(seen).toEqual(['two~form=f~mood=calm', 'grandma']);
    expect(() => put('/voices/fr/bad%E0')).toThrow(/malformed voice id/);
  });
});

describe('the validator', () => {
  const findings = (g: GameDef) => validate(g, miniLayouts).warnings.filter((w) => w.includes('clip(s) by value'));
  it('warns when a voiced line with switches lacks a value’s clip, per language', () => {
    const g = voiced({ 'grandma~form=f': 'grandma-f.mp3' });
    g.audio!.voicesByLang = { fr: { grandma: 'fr/grandma.mp3', 'grandma~form=m': 'a', 'grandma~form=f': 'b' } };
    const w = findings(g);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('grandma~form=m');
    expect(w[0]).toContain('no clip either');
  });
  it('a line without any clip, or with all of them, is fine', () => {
    expect(findings(voiced({ 'grandma~form=f': 'a', 'grandma~form=m': 'b' }))).toEqual([]);
    expect(findings(voiced({ other: 'x' }))).toEqual([]);
  });
});
