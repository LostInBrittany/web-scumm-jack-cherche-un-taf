import { describe, expect, it } from 'vitest';
import { DEFAULT_UI, uiFallbacks, uiText } from '@engine/dom/ui-defaults';
import type { GameDef } from '@engine/core/types';
import { game as demo } from '../games/demo/game';

describe('ui defaults', () => {
  it("answers the game's text first, else the English default", () => {
    const ui = { save: 'Sauver' } as unknown as GameDef['ui'];
    expect(uiText(ui, 'save')).toBe('Sauver');
    expect(uiText(ui, 'load')).toBe(DEFAULT_UI.load);
  });
  it('lists exactly the keys a game leaves to the defaults', () => {
    const ui = { save: 'Sauver' } as unknown as GameDef['ui'];
    const fb = uiFallbacks(ui);
    expect(fb.save).toBeUndefined();
    expect(Object.keys(fb).length).toBe(Object.keys(DEFAULT_UI).length - 1);
  });
  it('the sample game leaves none to the defaults (its French build shows no English)', () => {
    expect(Object.keys(uiFallbacks(demo.ui))).toEqual([]);
  });
});
