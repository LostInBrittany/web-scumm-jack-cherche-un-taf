// The verb a double tap uses (4.0, core/default-verb.ts): through an exit, talk to a character, look at the rest; with
// an item picked from the bag, give it to a character, use it on anything else; what the content names wins; never a
// verb the game does not have.
import { describe, expect, it } from 'vitest';
import { defaultVerb } from '@engine/core/default-verb';
import { compileGame } from '@engine/core/define';
import { game as reference } from '../games/reference';
import type { GameDef } from '@engine/core/types';

const g = compileGame(reference) as GameDef;
const room = (id: string) => g.rooms.find((r) => r.id === id)!;

describe('the default verb of a double tap', () => {
  it('an exit is gone through, a character talked to, anything else looked at', () => {
    expect(defaultVerb(g, room('street'), 'hall_door')).toBe('use');
    expect(defaultVerb(g, room('hall'), 'neighbor')).toBe('talk');
    expect(defaultVerb(g, room('street'), 'fusebox')).toBe('look');
  });

  it('with an item from the bag: given to a character, used on the rest', () => {
    expect(defaultVerb(g, room('hall'), 'neighbor', 'cable')).toBe('give');
    expect(defaultVerb(g, room('street'), 'fusebox', 'cable')).toBe('use');
  });

  it('the content names it (defaultVerb), and a verb the game lacks is never chosen', () => {
    const street = room('street');
    const named = {
      ...street,
      hotspots: { ...street.hotspots, fusebox: { ...street.hotspots!.fusebox, defaultVerb: 'open' } },
    };
    expect(defaultVerb(g, named, 'fusebox')).toBe('open');
    const noTalk = { ...g, verbs: g.verbs.filter((v) => v.id !== 'talk' && v.id !== 'give') };
    expect(defaultVerb(noTalk, room('hall'), 'neighbor')).toBe('look');
    expect(defaultVerb(noTalk, room('hall'), 'neighbor', 'cable')).toBe('use');
    expect(defaultVerb({ ...g, verbs: [] }, room('street'), 'fusebox')).toBeNull();
  });
});
