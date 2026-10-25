// The right-hand column of the phone layout fits its height (#227): rows of verbs, two rows of bag slots and the tools
// row (map, pause, music) are stacked in a column as tall as the screen. Before, the verbs kept 44 to 56 px and the
// slots stayed square whatever the height, so on a wide and short screen (a phone in landscape under its browser's
// bars: 844 x 320, the column is 300 px wide and each slot 87 px tall) the stack outgrew the screen and pushed the
// tools row out at the bottom. Now the slots give up their squareness first, then the verbs their comfort, and the
// tools row always stays in sight.

/** A touch target: 44 px at least where the height allows it (4.1.6, WCAG 2.5.5). */
export const TOUCH = 44;
/** Below this, a verb or a slot is no longer worth showing smaller: the column scrolls instead (style.css). */
export const FLOOR = 24;

export interface SideFitInput {
  /** The column's height (the visible screen, safe areas taken off). */
  height: number;
  /** Everything in the column that is neither a verb row nor a slot row: padding, gaps, the tools row, the bag's
   *  page buttons when they show, the bag's border and padding. */
  chrome: number;
  /** Rows of verbs (3 for 9 verbs). */
  verbRows: number;
  /** Rows of slots in the bag (2). */
  slotRows: number;
  /** A slot's height when it is square (its width). */
  slotSquare: number;
}

export interface SideFit {
  /** Height of a verb button, px. */
  verbH: number;
  /** Maximum height of a slot, px: null when the square slot fits. */
  slotMax: number | null;
}

/** The verb height and the slot height that keep the whole column, tools row included, inside `height`. */
export function fitSide(i: SideFitInput): SideFit {
  const room = i.height - i.chrome;
  const slotsFor = (verbH: number) => Math.floor((room - i.verbRows * verbH) / Math.max(1, i.slotRows));
  const result = (verbH: number, slot: number): SideFit => ({
    verbH,
    slotMax: slot >= i.slotSquare ? null : Math.max(FLOOR, slot),
  });
  // The comfortable verb height (what 4.1.6 gave: 12% of the height, 44 to 56 px), slots square if there is room.
  const comfy = Math.max(TOUCH, Math.min(56, Math.round(i.height * 0.12)));
  let slot = slotsFor(comfy);
  if (slot >= Math.min(TOUCH, i.slotSquare)) return result(comfy, slot);
  // Short: the verbs come down to a touch target, the slots take what is left.
  slot = slotsFor(TOUCH);
  if (slot >= Math.min(TOUCH, i.slotSquare)) return result(TOUCH, slot);
  // Very short: verbs and slots share the room evenly, never under FLOOR (the column scrolls past that).
  const even = Math.max(FLOOR, Math.floor(room / Math.max(1, i.verbRows + i.slotRows)));
  return result(Math.min(TOUCH, even), Math.min(i.slotSquare, even));
}
