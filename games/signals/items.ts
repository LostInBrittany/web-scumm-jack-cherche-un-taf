import type { ItemDef } from 'web-scumm/content';

// Inventory items. `look` as a list = one line per look, cycling.
export const items: Record<string, ItemDef> = {
  note: { name: 'note', icon: 'starter/items/note', look: ['A note. It says: "Make a game."', 'Still says the same thing.'] },
  bucket: { name: 'bucket', icon: 'starter/items/bucket', look: 'A red bucket. Fits on a head.' },
};
