// A translation that adds its own switch (4.3.1, tests/voice-locale.test.ts): the heroes fixture with one more topic,
// Grandma's "Ready?" (id `ready`), which English never agrees. French does: `Prêt{form?witch=e|knight=|robot=} ?`, so
// French records it once per hero (`ready~form=<hero>`, in `audio.voicesByLang.fr`), plus a plain clip for the line
// spoken before the choice. English voices only the sneeze line, as in the heroes fixture.
import type { GameDef } from '@engine/core/types';
import { heroes } from './heroes';

export const READY_FR = 'Prêt{form?witch=e|knight=|robot=} ?';

/** The French table: the topic and the line, the line with its own switch. */
export const frReady: Record<string, string> = {
  'room:hall/talk.grandma[2].topic': 'Prêt ?',
  'room:hall/talk.grandma[2].do.ready.say': READY_FR,
};

export function readyGame(): GameDef {
  const g = heroes();
  g.rooms[0]!.talk!.grandma!.push({ topic: 'Ready?', do: [{ say: ['grandma', 'Ready?'], id: 'ready' }] });
  g.audio!.voicesByLang = {
    fr: {
      'ready~form=knight': 'fr/ready-knight.mp3',
      'ready~form=witch': 'fr/ready-witch.mp3',
      'ready~form=robot': 'fr/ready-robot.mp3',
      ready: 'fr/ready.mp3',
    },
  };
  return g;
}
