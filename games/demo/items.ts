import type { ItemDef } from '@engine/core/types';

// Inventory items. `look` as a list = one line per look, cycling.
export const items: Record<string, ItemDef> = {
  shell_phone: {
    name: 'shell phone', icon: 'items/r4c3',
    look: [{ id: 'item.shell-phone.l-grandma-s-shell', text: 'Grandma\'s shell phone. Talk into it and Grandma answers.' }, { id: 'item.shell-phone.l-it-smells-like', text: 'It smells like the sea. And a bit like Grandma.' },
      { id: 'item.shell-phone.l-still-a-shell', text: 'Still a shell. Still a phone.' }, { id: 'item.shell-phone.l-if-i-hold-it-to', text: 'If I hold it to my ear, I hear the ocean. And Grandma knitting.' }],
  },
  token: { name: 'market token', icon: 'items/r2c2', look: 'A market token with a big star. Worth one go at something.' },
  pipe: { name: 'pipe', icon: 'house/r4c1', look: 'A piece of pipe. Water goes in, water goes out. Like me with milk.' },
  bouquet: { name: 'bouquet', icon: 'items/r2c1', look: [{ id: 'item.bouquet.l-a-pretty-bouquet', text: 'A pretty bouquet. Picked with paws.' }, { id: 'item.bouquet.l-not-edible-i', text: 'Not edible. I checked.' }] },
  key: { name: 'pantry key', icon: 'items/r2c4', look: 'The pantry key! It jingles like a tin of sardines.' },
};
