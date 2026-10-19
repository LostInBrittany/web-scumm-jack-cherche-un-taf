// The cutscene timeline, read from the DSL: durations, lanes, open ends.
import { describe, expect, it } from 'vitest';
import type { Cmd, GameDef } from '@engine/core/types';
import { timeline, timelineText } from '@engine/tools/timeline';
import { sayMs, ANIM_MS, CAMERA_MS } from '@engine/core/timing';
import { game as demo } from '../games/demo/game';
import house from '../games/demo/layout/house.json';

const game = {
  ...demo,
  characters: { ...demo.characters, fast: { name: 'Fast', color: '#fff', sprites: { idle: ['f/1'] }, fps: 20 } },
} as GameDef;

describe('timeline', () => {
  it('lays commands end to end, parallel branches on their own lanes', () => {
    const cmds: Cmd[] = [
      'Hello there.',
      { wait: 500 },
      { parallel: [[{ anim: ['hero', 'wave'] }], [{ say: ['grandma', 'Hi'] }, { camera: { pan: 100 } }]] },
      { sfx: 'ding' },
    ];
    const t = timeline(cmds, { game, path: 'on[0].do' });
    expect(t.lanes).toBe(2);
    expect(t.openEnded).toBe(false);
    const say = t.items.find((x) => x.kind === 'say' && x.lane === 0)!;
    expect(say).toMatchObject({ start: 0, end: sayMs('Hello there.'), path: 'on[0].do[0]' });
    const wait = t.items.find((x) => x.kind === 'wait')!;
    expect(wait.start).toBe(say.end);
    const anim = t.items.find((x) => x.kind === 'anim')!;
    const hi = t.items.find((x) => x.kind === 'say' && x.lane === 1)!;
    expect(anim.start).toBe(hi.start);
    expect(anim.end - anim.start).toBe(ANIM_MS);
    const cam = t.items.find((x) => x.kind === 'camera')!;
    expect(cam.start).toBe(hi.end);
    expect(cam.end - cam.start).toBe(CAMERA_MS);
    const sfx = t.items.find((x) => x.kind === 'cmd')!;
    expect(sfx.start).toBe(Math.max(anim.end, cam.end));
    expect(t.total).toBe(sfx.start);
  });
  it("estimates walks from the layout, marks the player's turns as open", () => {
    const room = demo.rooms.find((r) => r.id === 'house')!;
    const t = timeline(
      [
        { walk: 'armchair' },
        { walk: [10, 10], who: 'ghost' },
        {
          choice: [
            { text: 'Yes', do: ['Fine.'] },
            { text: 'No', do: [] },
          ],
        },
        'After.',
      ],
      { game, room, layout: house as never, path: 'x' },
    );
    const walk = t.items.find((x) => x.kind === 'walk' && !x.estimated)!;
    expect(walk.end).toBeGreaterThan(0);
    expect(t.items.find((x) => x.kind === 'walk' && x.estimated)).toBeDefined();
    expect(t.openEnded).toBe(true);
    const open = t.items.find((x) => x.open)!;
    expect(open.path).toBe('x[2]');
    expect(t.items.find((x) => x.path === 'x[2].choice[0].do[0]')!.lane).toBe(1);
    expect(timelineText(t)).toContain('then the player');
  });
  it("frame events follow the character's fps", () => {
    const t = timeline([{ anim: ['fast', 'hit'], ms: 1000, at: { 10: [{ sfx: 'thud' }] } }], { game, path: 'p' });
    expect(t.items.find((x) => x.path === 'p[0].at[10][0]')!.start).toBe(500);
  });
});
