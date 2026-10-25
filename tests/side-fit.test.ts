// The phone layout's right-hand column fits the screen (dom/side-fit.ts): on a wide and short landscape screen (a phone
// under its browser's bars) the slots stop being square, then the verbs come down to a touch target, then everything
// shares the room; the tools row (map, pause, music) is never pushed out at the bottom.
import { describe, expect, it } from 'vitest';
import { FLOOR, fitSide, TOUCH } from '@engine/dom/side-fit';

// The column as the demo draws it: 9 verbs on 3 rows, 2 rows of slots. `chrome` is padding 16 + 2 gaps of 6 + the
// tools row 40 + verb gaps 4 + bag border and padding 12 + slot gap 4 = 88.
const base = { verbRows: 3, slotRows: 2, chrome: 88 };
const total = (height: number, slotSquare: number) => {
  const f = fitSide({ ...base, height, slotSquare });
  return { f, used: base.chrome + 3 * f.verbH + 2 * (f.slotMax ?? slotSquare) };
};

describe('fitSide', () => {
  it('changes nothing where the column already fits (844 x 390: comfortable verbs, square slots)', () => {
    const { f, used } = total(390, 61);
    expect(f).toEqual({ verbH: 47, slotMax: null });
    expect(used).toBeLessThanOrEqual(390);
  });

  it('keeps the tools row on a wide, short screen (844 x 320: 300 px column, 87 px square slots)', () => {
    const { f, used } = total(320, 87);
    expect(used).toBeLessThanOrEqual(320);
    expect(f.verbH).toBe(TOUCH);
    expect(f.slotMax).toBeGreaterThanOrEqual(TOUCH);
    expect(f.slotMax).toBeLessThan(87);
  });

  it('brings the verbs down to a touch target before shrinking the slots under one', () => {
    const { f, used } = total(320, 46); // 568 x 320
    expect(used).toBeLessThanOrEqual(320);
    expect(f.verbH).toBe(TOUCH);
    expect(f.slotMax).toBeNull();
  });

  it('shares the room evenly when 44 px no longer fits, the tools row still inside', () => {
    for (const h of [300, 280, 260]) {
      const { f, used } = total(h, 87);
      expect(used, `height ${h}`).toBeLessThanOrEqual(h);
      expect(f.verbH).toBeLessThan(TOUCH);
      expect(f.verbH).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  it('never goes under the floor: past it the column scrolls (style.css) rather than drawing unusable buttons', () => {
    const f = fitSide({ ...base, height: 150, slotSquare: 87 });
    expect(f.verbH).toBe(FLOOR);
    expect(f.slotMax).toBe(FLOOR);
  });

  it('counts the rows it is given (12 verbs on 4 rows)', () => {
    const f = fitSide({ verbRows: 4, slotRows: 2, chrome: 92, height: 340, slotSquare: 87 });
    expect(92 + 4 * f.verbH + 2 * (f.slotMax ?? 87)).toBeLessThanOrEqual(340);
  });
});
