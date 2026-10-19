// @vitest-environment happy-dom
// The Rooms tab's sheets (src/studio/rooms-sheet.ts, 4.1.8): the selected entity's (header, facts, look lines,
// reactions, talk topics) and the room's (name, stage, painter, hints, on enter, scripts, events). The tab is a fake
// host; the texts come from a small room.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomDef } from '@engine/core/types';
import { type GameInfo, type RoomData, type TextRef } from '../../src/studio/api';
import { entitySheet, roomSheet, type SheetHost } from '../../src/studio/rooms-sheet';

if (typeof ResizeObserver === 'undefined')
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );

const info: GameInfo = {
  id: 'g',
  title: 'G',
  rooms: [{ id: 'kitchen', name: 'Kitchen', decor: 'kitchen' }],
  characters: { lou: { name: 'Lou', color: '#f00' }, grandma: { name: 'Grandma', color: '#0f0' } },
  items: {},
  verbs: [{ id: 'use', label: 'Use', color: '#fff' }],
  checkpoints: {},
  hero: 'lou',
  images: {},
};
const file = 'games/demo/rooms/kitchen.ts';
const def: RoomDef = {
  id: 'kitchen',
  name: 'Kitchen',
  decor: 'kitchen',
  props: { piano: { name: 'piano', img: 'piano', visible: { has: 'key' } }, dust: {} },
  actors: { gm: { char: 'grandma', pose: 'sit', interactive: false } },
  hotspots: { door: { name: 'door' } },
  look: { piano: 'A dusty piano.' },
  on: [{ verb: 'use', a: 'key', b: 'door', if: 'awake', do: [{ say: ['lou', 'Click.'] }] }],
  talk: { gm: [{ topic: 'Tea?', do: [{ say: ['grandma', 'Of course.'] }] }] },
  hints: [{ until: { has: 'key' }, lines: ['Look around.'] }],
  scripts: [{ id: 'tick', loop: true, while: 'awake', do: [{ wait: 100 }] }],
};
const texts: TextRef[] = [
  { path: 'name', value: 'Kitchen', file, line: 3, kind: 'name' },
  { path: 'props.piano.name', value: 'piano', file, line: 5, kind: 'name' },
  { path: 'look.piano', value: 'A dusty piano.', file, line: 9, kind: 'look' },
  { path: 'talk.gm[0].topic', value: 'Tea?', file, line: 12, kind: 'topic' },
  { path: 'hints[0].lines[0]', value: 'Look around.', file, line: 20, kind: 'hint' },
];

function host(data: RoomData | null = { def, layout: {}, texts, file }) {
  const byPath = new Map((data?.texts ?? []).map((t) => [t.path, t]));
  const spies = {
    flushEditor: vi.fn(async () => undefined),
    ownWrite: vi.fn(),
    saved: vi.fn(),
    reload: vi.fn(async () => undefined),
    renderIfPending: vi.fn(),
    writeValue: vi.fn(),
    editRule: vi.fn(),
    editStage: vi.fn(),
  };
  const h: SheetHost = { info, room: 'kitchen', data, textAt: (p) => byPath.get(p), ...spies };
  return { h, spies };
}
const text = (els: HTMLElement[], sel: string) =>
  [...els.flatMap((e) => [...e.querySelectorAll(sel)])].map((e) => e.textContent);
const heads = (els: HTMLElement[]) =>
  els.filter((e) => e.tagName === 'SECTION').map((e) => e.querySelector('h3')?.firstChild?.textContent);

/** Between tests: the body emptied, but the toasts' stack kept (src/studio/ui.ts holds it in a module variable). */
const reset = () => {
  for (const c of [...document.body.children]) c.classList.contains('toasts') ? c.replaceChildren() : c.remove();
};

describe('entitySheet', () => {
  afterEach(() => {
    reset();
  });

  it('is a hint when nothing is selected, the room is not loaded, or the selection is not in the room', () => {
    const hint = 'Select a prop, an actor or a hotspot in the list or in the view.';
    expect(entitySheet(host().h, null).map((e) => e.textContent)).toEqual([hint]);
    expect(entitySheet(host(null).h, { kind: 'prop', id: 'piano' }).map((e) => e.textContent)).toEqual([hint]);
    expect(entitySheet(host().h, { kind: 'actor', id: 'piano' })[0]?.className).toBe('muted hint');
  });

  it('a prop: its kind, id, editable name, image and visibility facts, its look line and the reactions touching it', () => {
    const parts = entitySheet(host().h, { kind: 'prop', id: 'piano' });
    const head = parts[0] as HTMLElement;
    expect(head.className).toBe('sheethead');
    expect(head.querySelector('.kind')?.textContent).toBe('Prop');
    expect(head.querySelector('h2')?.textContent).toBe('piano');
    expect(head.querySelector('.muted')).toBeNull(); // the name equals the id: not repeated
    expect(parts[1]?.dataset.path).toBe('props.piano.name');
    expect(text(parts, '.fact b')).toEqual(['image', 'visible']);
    expect(parts[2]?.querySelector('img.thumb')?.getAttribute('src')).toBe('/assets/img/piano.webp');
    expect(text(parts, '.fact code')).toEqual(['piano', 'has key']);
    expect(heads(parts)).toEqual(['Look ', 'Reactions ']);
    expect(parts[3]?.querySelector('[data-path="look.piano"] textarea')).not.toBeNull();
    expect(parts[3]?.querySelector('.line.add input')?.getAttribute('placeholder')).toBe('New look line…');
    expect(parts[4]?.querySelector('h3 .muted')?.textContent).toBe('0');
    expect(parts[4]?.querySelector('p.muted')?.textContent).toBe(
      "None in this room: the game's fallback answers apply.",
    );
  });

  it('a nameless prop is scenery and warns when it has no look line; + Reaction opens a blank look rule after the last', () => {
    const { h, spies } = host();
    const parts = entitySheet(h, { kind: 'prop', id: 'dust' });
    expect(text(parts, '.fact.muted')).toEqual(['No name: scenery, not clickable.']);
    expect(text(parts, '.fact code')).toEqual([]);
    expect(text(parts, '.fact')[1]).toBe('visiblealways');
    expect(parts[2]?.querySelector('p.warn')?.textContent).toBe(
      'No look line yet: everything visible should have one.',
    );
    const add = [...(parts[3]?.querySelectorAll('button') ?? [])].find((b) => b.textContent === '+ Reaction');
    add?.click();
    expect(spies.editRule).toHaveBeenCalledWith(1, { verb: 'look', a: 'dust', do: [] });
  });

  it('a hotspot lists the reactions that touch it, with their head, condition and an Edit… button', () => {
    const { h, spies } = host();
    const parts = entitySheet(h, { kind: 'hotspot', id: 'door' });
    const rules = parts[3] as HTMLElement;
    expect(rules.querySelector('h3 .muted')?.textContent).toBe('1');
    expect(rules.querySelector('.rulehead span')?.textContent).toBe('Use key → door');
    expect(rules.querySelector('.rulehead code.cond')?.textContent).toBe('if awake');
    expect(rules.querySelector('.rulehead .muted')?.textContent).toBe('on[0]');
    expect(rules.querySelector('.cmds .chip')?.textContent).toBe('say lou → Click.'); // no literal for it in `texts`
    const edit = [...rules.querySelectorAll('button')].find((b) => b.textContent === 'Edit…');
    edit?.click();
    expect(spies.editRule).toHaveBeenCalledWith(0);
  });

  it("an exit's hotspot offers what a single tap does (#188): the game's setting, go through, or walk there", () => {
    const { h, spies } = host({
      def: { ...def, exits: { door: { name: 'door', to: 'hall', onTap: 'walk' } } },
      layout: {},
      texts,
      file,
    });
    const tap = entitySheet(h, { kind: 'hotspot', id: 'door' })
      .flatMap((e) => [...e.querySelectorAll('select')])
      .at(0) as HTMLSelectElement;
    expect([...tap.options].map((o) => o.value)).toEqual(['', 'go', 'walk']);
    tap.value = 'go';
    tap.dispatchEvent(new Event('change'));
    expect(spies.writeValue).toHaveBeenCalledWith('exits.door.onTap', 'go');
    tap.value = '';
    tap.dispatchEvent(new Event('change'));
    expect(spies.writeValue).toHaveBeenLastCalledWith('exits.door.onTap', undefined);
    // A hotspot that is no exit has no such field.
    expect(entitySheet(host().h, { kind: 'hotspot', id: 'door' }).some((e) => e.querySelector('select'))).toBe(false);
  });

  it('an actor: its character facts, and its talk topics as a list or a tree', () => {
    const parts = entitySheet(host().h, { kind: 'actor', id: 'gm' });
    const head = parts[0] as HTMLElement;
    expect(head.querySelector('.kind')?.textContent).toBe('Actor');
    expect(head.querySelector('.muted')?.textContent).toBe('Grandma');
    expect(text(parts, '.fact')[0]).toBe('charactergrandma pose sit (not interactive)');
    expect(heads(parts)).toEqual(['Look ', 'Reactions ', 'Talk topics ']);
    const talk = parts[parts.length - 1] as HTMLElement;
    expect(talk.querySelector('h3 .muted')?.textContent).toBe('1');
    expect(talk.querySelector('[data-path="talk.gm[0].topic"] textarea')).not.toBeNull();
    const list = talk.children[1] as HTMLElement;
    const tree = talk.querySelector('.dtree') as HTMLElement;
    expect(tree.hidden).toBe(true);
    expect([...tree.querySelectorAll('li')].map((li) => li.className)).toEqual(['d-topic', 'd-line']);
    expect(text([tree], '.dnode')).toEqual(['"Tea?"', 'grandma: Of course.']);
    const toggle = talk.querySelector('h3 button') as HTMLButtonElement;
    toggle.click();
    expect(tree.hidden).toBe(false);
    expect(list.hidden).toBe(true);
    expect(toggle.textContent).toBe('List');
  });
});

describe('roomSheet', () => {
  afterEach(() => {
    reset();
  });

  it('is nothing before the room is loaded', () => {
    expect(roomSheet(host(null).h)).toBeNull();
  });

  it('names the room and its file, offers the stage form and the painter, lists hints, on enter, scripts and events', () => {
    const { h, spies } = host();
    const parts = roomSheet(h) as HTMLElement[];
    expect(heads(parts)).toEqual(['Room ', 'Hints ', 'On enter', 'Scripts ', 'Events ']);
    expect(parts[0]?.querySelector('h3 .muted')?.textContent).toBe(file);
    expect(parts[0]?.querySelector('[data-path="name"] textarea')).not.toBeNull();
    const stage = parts[0]?.querySelector('.row button') as HTMLButtonElement;
    expect(stage.textContent).toBe('Stage…');
    stage.click();
    expect(spies.editStage).toHaveBeenCalledTimes(1);
    const painter = parts[0]?.querySelector('select') as HTMLSelectElement;
    expect([...painter.options].map((o) => o.textContent)).toEqual(['game (dom)', 'DOM', 'canvas']);
    painter.value = 'canvas';
    painter.dispatchEvent(new Event('change'));
    expect(spies.writeValue).toHaveBeenCalledWith('renderer', 'canvas');
    painter.value = '';
    painter.dispatchEvent(new Event('change'));
    expect(spies.writeValue).toHaveBeenLastCalledWith('renderer', undefined);
    expect(parts[1]?.querySelector('code.cond')?.textContent).toBe('until has key');
    expect(parts[1]?.querySelector('[data-path="hints[0].lines[0]"] .del')).toBeNull(); // a single line is kept
    expect(parts[1]?.querySelector('.line.add input')?.getAttribute('placeholder')).toBe('New hint line…');
    expect(parts[2]?.querySelector('p.muted')?.textContent).toBe('Nothing happens on entering.');
    expect(parts[2]?.querySelector('.rulehead')).toBeNull(); // nothing happens on entering: no rule head
    expect(parts[3]?.querySelector('.rulehead code')?.textContent).toBe('tick');
    expect(parts[3]?.querySelector('.rulehead .muted')?.textContent).toBe('loop while awake');
    expect(parts[3]?.querySelector('.timed')).not.toBeNull();
    expect(parts[4]?.querySelector('p.muted')?.textContent).toBe('No listeners in this room.');
  });

  it('shows the stage with its layers, and says so when there are no hints or scripts', () => {
    const bare: RoomDef = {
      id: 'attic',
      name: 'Attic',
      decor: 'attic',
      stage: {
        layers: [
          { id: 'a', image: 'a', role: 'backdrop' },
          { id: 'b', image: 'b', role: 'scenery' },
        ],
      },
    };
    const parts = roomSheet(host({ def: bare, layout: {}, texts: [], file }).h) as HTMLElement[];
    expect(parts[0]?.querySelector('p')?.textContent).toBe('Attic'); // no literal: the name is read-only
    expect(parts[0]?.querySelector('.row button')?.textContent).toBe('Stage… (2 layers)');
    expect(parts[1]?.querySelector('p.muted')?.textContent).toBe('No hints in this room.');
    expect(parts[3]?.querySelector('p.muted')?.textContent).toBe('No scripts in this room.');
  });
});
