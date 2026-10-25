// The shapes the Studio's structured forms edit (3.4): every condition and every command of the DSL, and a room's
// stage. Written once here and checked against the types at compile time (`CMD_SPECS` is a Record over every command
// key, `COND_KINDS` covers every condition): a new command without a form does not compile. The forms
// (src/studio/forms.ts) read these to build their fields; what has no simple field (a minigame's params) is JSON.
import type { CmdKey } from '@engine/core/cmds';

/** What an id refers to: the form offers the game's ids of that kind. */
export type Ref =
  | 'item'
  | 'flag'
  | 'room'
  | 'char'
  | 'who'
  | 'prop'
  | 'target'
  | 'sfx'
  | 'music'
  | 'image'
  | 'verb'
  | 'script'
  | 'event'
  | 'checkpoint'
  | 'place'
  | 'minigame'
  | 'command';

export type Field =
  | { k: 'text' }
  | { k: 'id'; ref?: Ref }
  | { k: 'number'; min?: number; max?: number; step?: number }
  | { k: 'bool' }
  | { k: 'enum'; values: readonly string[] }
  | { k: 'point' }
  | { k: 'idOrPoint'; ref?: Ref }
  | { k: 'cond' }
  | { k: 'cmds' }
  | { k: 'tuple'; items: readonly Field[]; labels?: readonly string[] }
  | { k: 'list'; of: Field; label?: string }
  | { k: 'object'; fields: Readonly<Record<string, Field & { optional?: boolean }>> }
  | { k: 'json' };

/** A command: the field of its key, and its other properties. */
export interface CmdSpec {
  label: string;
  value: Field;
  extra?: Readonly<Record<string, Field & { optional?: boolean }>>;
}

const id = (ref?: Ref): Field => ({ k: 'id', ...(ref ? { ref } : {}) });
const opt = <F extends Field>(f: F) => ({ ...f, optional: true });
const n = (min?: number, max?: number, step?: number): Field => ({
  k: 'number',
  ...(min !== undefined ? { min } : {}),
  ...(max !== undefined ? { max } : {}),
  ...(step !== undefined ? { step } : {}),
});
const cmds: Field = { k: 'cmds' };
const block = { id: opt(id()) };

export const CMD_SPECS: Record<CmdKey, CmdSpec> = {
  say: {
    label: 'Say a line',
    value: { k: 'tuple', items: [id('who'), { k: 'text' }], labels: ['who', 'line'] },
    extra: { id: opt(id()), shout: opt({ k: 'bool' }), voice: opt(id()) },
  },
  walk: { label: 'Walk to', value: { k: 'idOrPoint', ref: 'target' }, extra: { who: opt(id('who')) } },
  face: { label: 'Face', value: { k: 'id', ref: 'target' }, extra: { who: opt(id('who')) } },
  pose: { label: 'Pose', value: { k: 'tuple', items: [id('who'), id()], labels: ['who', 'pose'] } },
  anim: {
    label: 'Animate a pose',
    value: { k: 'tuple', items: [id('who'), id()], labels: ['who', 'pose'] },
    extra: { ms: opt(n(0, 10000, 50)), at: opt({ k: 'json' }) },
  },
  place: {
    label: 'Place',
    value: { k: 'tuple', items: [id('who'), { k: 'point' }], labels: ['who', 'at'] },
    extra: { face: opt({ k: 'enum', values: ['left', 'right'] }) },
  },
  wait: { label: 'Wait (ms)', value: n(0, 60000, 50) },
  parallel: { label: 'At the same time', value: { k: 'list', of: cmds, label: 'branch' } },
  camera: { label: 'Camera', value: { k: 'json' } },
  play: {
    label: 'Play a prop animation',
    value: { k: 'tuple', items: [id('prop'), id()], labels: ['prop', 'animation'] },
  },
  stopAnim: { label: 'Stop a prop animation', value: id('prop') },
  launch: {
    label: 'Launch (a flight)',
    value: {
      k: 'object',
      fields: {
        target: id('who'),
        to: { k: 'idOrPoint', ref: 'target' },
        from: opt({ k: 'idOrPoint', ref: 'target' }),
        height: opt(n(0, 400)),
        ms: opt(n(50, 10000, 50)),
        rotate: opt(n(-1440, 1440, 15)),
      },
    },
  },
  spring: {
    label: 'Spring (a swing)',
    value: {
      k: 'object',
      fields: {
        target: id('who'),
        axis: opt({ k: 'enum', values: ['x', 'y', 'rot'] }),
        amplitude: opt(n(0, 200)),
        frequency: opt(n(0.1, 20, 0.1)),
        damping: opt(n(0, 1, 0.05)),
        ms: opt(n(50, 10000, 50)),
      },
    },
  },
  path: {
    label: 'Along a path',
    value: {
      k: 'object',
      fields: {
        target: id('who'),
        points: { k: 'list', of: { k: 'point' }, label: 'point' },
        ms: opt(n(50, 20000, 50)),
        orient: opt({ k: 'bool' }),
      },
    },
  },
  follow: {
    label: 'Follow',
    value: {
      k: 'object',
      fields: { target: id('who'), leader: id('who'), offset: opt({ k: 'point' }), ms: n(50, 60000, 50) },
    },
  },
  prop: { label: 'Prop state', value: { k: 'tuple', items: [id('prop'), id()], labels: ['prop', 'state'] } },
  show: { label: 'Show', value: id('target'), extra: { fade: opt(n(0, 5000, 50)) } },
  hide: { label: 'Hide', value: id('target'), extra: { fade: opt(n(0, 5000, 50)) } },
  gain: { label: 'Gain an item', value: id('item') },
  lose: { label: 'Lose an item', value: id('item') },
  used: { label: 'Mark used', value: id('item') },
  set: { label: 'Set a flag', value: id('flag') },
  unset: { label: 'Unset a flag', value: id('flag') },
  inc: { label: 'Count up', value: id('flag'), extra: { by: opt(n(-100, 100)) } },
  unlock: { label: 'Unlock a place', value: id('place') },
  goto: { label: 'Go to a room', value: id('room'), extra: { at: opt({ k: 'idOrPoint' }) } },
  map: { label: 'Open the map', value: { k: 'bool' } },
  moveActor: {
    label: 'Move a character',
    value: { k: 'tuple', items: [id('char'), id('room')], labels: ['who', 'room'] },
    extra: { at: opt({ k: 'idOrPoint' }) },
  },
  emit: { label: 'Emit an event', value: id('event') },
  waitUntil: { label: 'Wait until', value: { k: 'cond' } },
  waitEvent: { label: 'Wait for an event', value: id('event') },
  switchPlayer: { label: 'Switch character', value: id('char') },
  transfer: { label: 'Hand an item', value: { k: 'tuple', items: [id('item'), id('char')], labels: ['item', 'to'] } },
  custom: { label: 'Custom command', value: id('command'), extra: { args: opt({ k: 'json' }) } },
  startScript: { label: 'Start a script', value: id('script') },
  stopScript: { label: 'Stop a script', value: id('script') },
  sfx: { label: 'Sound effect', value: id('sfx'), extra: { caption: opt({ k: 'text' }) } },
  music: { label: 'Music', value: { k: 'json' } },
  toast: { label: 'Toast', value: { k: 'text' }, extra: { id: opt(id()) } },
  shake: { label: 'Shake (ms)', value: n(0, 5000, 50) },
  if: { label: 'If', value: { k: 'cond' }, extra: { then: cmds, else: opt(cmds) } },
  once: { label: 'Once', value: cmds, extra: block },
  nth: { label: 'Each time, the next', value: { k: 'list', of: cmds, label: 'time' }, extra: block },
  cycle: { label: 'In turn', value: { k: 'list', of: cmds, label: 'turn' }, extra: block },
  random: { label: 'At random', value: { k: 'list', of: cmds, label: 'branch' }, extra: block },
  cutscene: { label: 'Cutscene', value: cmds },
  choice: {
    label: 'A choice',
    value: {
      k: 'list',
      label: 'option',
      of: {
        k: 'object',
        fields: {
          id: opt(id()),
          text: { k: 'text' },
          img: opt(id('image')),
          if: opt({ k: 'cond' }),
          once: opt({ k: 'bool' }),
          do: cmds,
        },
      },
    },
  },
  minigame: { label: 'Minigame', value: id('minigame'), extra: { params: opt({ k: 'json' }), then: opt(cmds) } },
  phone: { label: 'Phone call', value: id('char'), extra: { do: cmds } },
  guide: {
    label: 'Guided step',
    value: { k: 'object', fields: { verb: id('verb'), target: id('target'), say: { k: 'text' } } },
    extra: { id: opt(id()) },
  },
  talk: { label: 'Open a conversation', value: id('char') },
  hint: { label: 'Give a hint', value: { k: 'bool' } },
  ending: { label: 'The ending', value: { k: 'bool' }, extra: { after: opt(cmds) } },
  reveal: { label: 'Reveal the sealed ending', value: { k: 'bool' }, extra: { after: opt(cmds) } },
  end: { label: 'End the game', value: { k: 'bool' } },
};

/** The kinds of a condition, as the form offers them (a bare string is a flag, `!flag` its negation). */
export const COND_KINDS = [
  'flag',
  'notflag',
  'has',
  'flagvalue',
  'not',
  'all',
  'any',
  'visited',
  'room',
  'prop',
  'unlocked',
  'seen',
  'actorIn',
  'player',
] as const;
export type CondKind = (typeof COND_KINDS)[number];

/** A room's stage, as a form (`RoomDef.stage`; the geometry is the layout's, placed in the view). */
export const STAGE_FIELDS: Readonly<Record<string, Field & { optional?: boolean }>> = {
  layers: opt({
    k: 'list',
    label: 'layer',
    of: {
      k: 'object',
      fields: {
        id: id(),
        image: id('image'),
        role: { k: 'enum', values: ['backdrop', 'scenery', 'foreground', 'effect'] },
        visible: opt({ k: 'cond' }),
      },
    },
  }),
  lights: opt({
    k: 'list',
    label: 'light',
    of: {
      k: 'object',
      fields: {
        id: id(),
        kind: { k: 'enum', values: ['radial', 'ambient'] },
        color: { k: 'text' },
        intensity: opt(n(0, 1, 0.05)),
        blend: opt({ k: 'enum', values: ['screen', 'multiply'] }),
        visible: opt({ k: 'cond' }),
      },
    },
  }),
  emitters: opt({
    k: 'list',
    label: 'particles',
    of: {
      k: 'object',
      fields: {
        id: id(),
        kind: { k: 'enum', values: ['dust', 'rain', 'snow', 'sparks', 'smoke', 'leaves'] },
        image: opt(id('image')),
        color: opt({ k: 'text' }),
        rate: opt(n(0, 400)),
        visible: opt({ k: 'cond' }),
      },
    },
  }),
  transition: opt({ k: 'enum', values: ['cut', 'fade', 'wipe'] }),
  links: opt({ k: 'json' }),
};

/** A reaction (`RoomDef.on[i]`), as a form. */
export const RULE_FIELDS: Readonly<Record<string, Field & { optional?: boolean }>> = {
  id: opt(id()),
  verb: id('verb'),
  a: id('target'),
  b: opt(id('target')),
  if: opt({ k: 'cond' }),
  do: cmds,
};
