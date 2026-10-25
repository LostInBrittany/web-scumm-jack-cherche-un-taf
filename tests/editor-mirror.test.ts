// The placement editor's mirrors (dev/mirror.ts, #252): a prop or an actor turned around in the layout, a prop in the
// state shown, an actor whose room sets `facing` told that the room wins.
import { describe, expect, it } from 'vitest';
import type { FolderApi } from 'tweakpane';
import { facingNote, mirrorControls, mirrorOf, setMirror } from '@engine/dev/mirror';
import { roundLayout } from '@engine/dev/save-layout';
import type { Engine } from '@engine/core/engine';
import type { Layout, RoomDef } from '@engine/core/types';

const layout = (): Layout =>
  ({
    props: {
      stool: { x: 100, y: 300, h: 40, states: { pulled: { x: 120, y: 310 }, tipped: { x: 90, y: 300, flip: true } } },
    },
    actors: { cook: { x: 400, y: 340 } },
  }) as Layout;

describe('the placement editor mirrors', () => {
  it('turns an actor around and back, the field gone when off as on the placement page', () => {
    const L = layout();
    expect(mirrorOf(L, 'actor', 'cook', 'flip')).toBe(false);
    setMirror(L, 'actor', 'cook', 'flip', true);
    expect(L.actors?.cook).toEqual({ x: 400, y: 340, flip: true });
    setMirror(L, 'actor', 'cook', 'flip', false);
    expect(L.actors?.cook).toEqual({ x: 400, y: 340 });
  });

  it('offers no vertical mirror on an actor, and nothing for one with no geometry yet', () => {
    const L = layout();
    expect(mirrorOf(L, 'actor', 'cook', 'flipV')).toBeUndefined();
    expect(mirrorOf(L, 'actor', 'ghost', 'flip')).toBeUndefined();
    setMirror(L, 'actor', 'ghost', 'flip', true);
    expect(L.actors?.ghost).toBeUndefined();
  });

  it("writes a prop's own mirror when its state has none, which every such state then shows", () => {
    const L = layout();
    setMirror(L, 'prop', 'stool', 'flipV', true, 'pulled');
    expect(L.props?.stool?.flipV).toBe(true);
    expect(L.props?.stool?.states?.pulled?.flipV).toBeUndefined();
    expect(mirrorOf(L, 'prop', 'stool', 'flipV')).toBe(true);
  });

  it("edits a state's own mirror in that state, keeping false written so it does not fall back to the prop's", () => {
    const L = layout();
    L.props!.stool!.flip = true;
    expect(mirrorOf(L, 'prop', 'stool', 'flip', 'tipped')).toBe(true);
    L.props!.stool!.states!.tipped!.flip = true;
    setMirror(L, 'prop', 'stool', 'flip', false, 'tipped');
    expect(L.props?.stool?.states?.tipped?.flip).toBe(false);
    expect(L.props?.stool?.flip).toBe(true);
    expect(mirrorOf(L, 'prop', 'stool', 'flip', 'tipped')).toBe(false);
  });

  it("says when the room's facing wins over the layout", () => {
    const room = {
      id: 'kitchen',
      actors: { cook: { char: 'cook', facing: 'left' }, maid: { char: 'maid' } },
    } as unknown as RoomDef;
    expect(facingNote(room, 'cook')).toContain("'left'");
    expect(facingNote(room, 'maid')).toBeUndefined();
  });

  it("keeps the mirrors through what the editor writes, a state variant's false included", () => {
    const L = layout();
    setMirror(L, 'actor', 'cook', 'flip', true);
    setMirror(L, 'prop', 'stool', 'flipV', true);
    setMirror(L, 'prop', 'stool', 'flip', false, 'tipped');
    const saved = JSON.parse(JSON.stringify(roundLayout(L))) as Layout;
    expect(saved.actors?.cook?.flip).toBe(true);
    expect(saved.props?.stool?.flipV).toBe(true);
    expect(saved.props?.stool?.states?.tipped?.flip).toBe(false);
    expect(mirrorOf(saved, 'prop', 'stool', 'flip', 'tipped')).toBe(false);
  });

  it('adds the checkboxes to the Selection folder and wires them to the layout and the room', () => {
    type Binding = { label?: string; obj: Record<string, unknown>; key: string; fire: (v: boolean) => void };
    const bindings: Binding[] = [];
    const folder = {
      addBinding(obj: Record<string, unknown>, key: string, opts: { label?: string }) {
        let cb: (ev: { value: boolean }) => void = () => undefined;
        const b = { label: opts.label, obj, key, fire: (v: boolean) => cb({ value: v }) };
        bindings.push(b);
        return { on: (_: string, f: typeof cb) => (cb = f), dispose: () => undefined };
      },
    } as unknown as FolderApi;
    const room = {
      id: 'kitchen',
      props: { stool: { states: { pulled: {}, tipped: {} } } },
      actors: { cook: { char: 'cook', facing: 'left' } },
    } as unknown as RoomDef;
    const engine = {
      state: { props: { 'kitchen.stool': 'tipped' }, actors: { 'kitchen.cook': { facing: 'right' } } },
      propState: (id: string) => (id === 'stool' ? 'tipped' : undefined),
    } as unknown as Engine;
    const L = layout();
    const changed: string[] = [];
    const ctx = { engine, room, L, changed: (h: { t: string }) => changed.push(h.t) };

    expect(mirrorControls(folder, 'hs:door', ctx)).toEqual([]);
    expect(mirrorControls(folder, '(none)', ctx)).toEqual([]);
    expect(bindings).toHaveLength(0);

    expect(mirrorControls(folder, 'prop:stool', ctx)).toHaveLength(2);
    expect(bindings.map((b) => b.label)).toEqual(['mirror ↔', 'mirror ↕']);
    expect(bindings[0]?.obj.flip).toBe(true); // the tipped state's own mirror, the state shown
    bindings[0]?.fire(false);
    expect(L.props?.stool?.states?.tipped?.flip).toBe(false);
    expect(L.props?.stool?.flip).toBeUndefined();
    expect(changed).toEqual(['prop-pos']);

    bindings.length = 0;
    expect(mirrorControls(folder, 'actor:cook', ctx)).toHaveLength(2); // the checkbox and the note
    expect(bindings.map((b) => b.key)).toEqual(['flip', 'note']);
    bindings[0]?.fire(true);
    expect(L.actors?.cook?.flip).toBe(true);
    expect((engine.state.actors as Record<string, { facing?: string }>)['kitchen.cook']?.facing).toBeUndefined();
    expect(changed).toEqual(['prop-pos', 'actor-pos']);
  });
});
