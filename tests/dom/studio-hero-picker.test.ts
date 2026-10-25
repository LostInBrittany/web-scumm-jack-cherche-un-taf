// @vitest-environment happy-dom
// The Play tab's "Text switches" picker (src/studio/hero-picker.ts, 4.3.0): the flags the game's texts switch on, with
// the values listed and written, as selects; a pick sets the flag in the frame's engine and redraws the room. And the
// Rooms tab's read-only preview under a text holding a switch (rooms-lines.ts `switchPreview`), raw braces kept.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import type { GameDef } from '@engine/core/types';
import type { GameInfo } from '../../src/studio/api';
import { HeroPicker, previewFlags, switchFlags } from '../../src/studio/hero-picker';
import { switchPreview } from '../../src/studio/rooms-lines';
import { mini, miniLayouts } from '../fixtures/mini';

const game = (): GameDef => {
  const g = mini();
  g.rooms[0]!.on!.push(
    { verb: 'look', a: 'valise', id: 'peek', do: ['Grandma hugs {form?m=him|f=her}.'] },
    { verb: 'use', a: 'valise', id: 'pick', do: [{ set: ['form', 'f'] }, '{mood?calm=Fine.|*=Hm.}'] },
  );
  return g;
};

afterEach(() => {
  for (const k of Object.keys(previewFlags)) delete previewFlags[k];
});

describe('switchFlags', () => {
  it('lists each flag a switch reads, sorted, written values first (typed) then the ones only listed', () => {
    expect(switchFlags(game())).toEqual([
      {
        flag: 'form',
        values: [
          { key: 'f', value: 'f' },
          { key: 'm', value: 'm' },
        ],
      },
      { flag: 'mood', values: [{ key: 'calm', value: 'calm' }] },
    ]);
  });

  it('a game without a switch has none', () => {
    expect(switchFlags(mini())).toEqual([]);
  });
});

describe('the picker', () => {
  const frame = async (g: GameDef) => {
    const engine = new Engine(g, miniLayouts, new FakePresenter(), new MemoryStore());
    await engine.newGame();
    const view = { refreshVisibility: vi.fn(), redraw: vi.fn() };
    return { engine, game: g, view };
  };

  it('is hidden for a game without a switch, and without a game', async () => {
    const f = await frame(mini());
    const p = new HeroPicker(() => f);
    p.refresh();
    expect(p.el.hidden).toBe(true);
    expect(new HeroPicker(() => null).el.hidden).toBe(true);
  });

  it('draws a select per flag, follows the frame, and a pick sets the flag and redraws the room', async () => {
    const f = await frame(game());
    const p = new HeroPicker(() => f);
    document.body.append(p.el);
    p.refresh();
    expect(p.el.hidden).toBe(false);
    const form = p.el.querySelector<HTMLSelectElement>('select[aria-label="Flag form"]')!;
    expect([...form.options].map((o) => o.value)).toEqual(['', 'f', 'm']);
    expect(form.value).toBe('');
    expect(p.el.querySelector('h3')!.textContent).toContain(`hero: ${f.engine.text('{hero}')}`);

    f.engine.state.flags.form = 'm';
    p.refresh();
    expect(form.value).toBe('m');

    form.value = 'f';
    form.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(f.view.redraw).toHaveBeenCalledTimes(1));
    expect(f.engine.state.flags.form).toBe('f');
    expect(previewFlags.form).toBe('f');
    expect(f.view.refreshVisibility).toHaveBeenCalled();
    expect(f.engine.text('{form?m=him|f=her}')).toBe('her');

    form.value = '';
    form.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(f.view.redraw).toHaveBeenCalledTimes(2));
    expect('form' in f.engine.state.flags).toBe(false);
    expect('form' in previewFlags).toBe(false);
    p.el.remove();
  });
});

describe('the preview under a text', () => {
  const info = { characters: { lou: { name: 'Lou', color: '#f00' } }, hero: 'lou' } as unknown as GameInfo;

  it('none for a plain text', () => {
    expect(switchPreview({ info }, 'Just a line.')).toBeNull();
  });

  it('the text as read with the picked values, the flags named; updates as one types', () => {
    const s = switchPreview({ info }, '{hero} hugs {form?m=him|f=her}.')!;
    expect(s.el.textContent).toBe('→ Lou hugs him.  (form=?)');
    previewFlags.form = 'f';
    s.update('{hero} hugs {form?m=him|f=her|*=them}!');
    expect(s.el.textContent).toBe('→ Lou hugs her!  (form=f)');
  });
});
