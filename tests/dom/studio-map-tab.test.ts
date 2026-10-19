// @vitest-environment happy-dom
// The Map tab (4.2.3 PR 2, H1): the groupings by kind, each reference with the `file:line` that writes it or "not
// declared", what no grouping names; a grouping added, edited, deleted through the whole groupings file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Api, serverApi, useApi } from '../../src/studio/api';
import { MapTab } from '../../src/studio/map-tab';
import type { GroupingsFile, ScenarioMap } from '../../tools/studio/scenario-map';

const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => {
  useApi({ ...serverApi });
  document.body.replaceChildren();
});

function stub(file: GroupingsFile, map: ScenarioMap) {
  const saved: GroupingsFile[] = [];
  useApi({
    ...serverApi,
    groupings: async () => structuredClone(file),
    map: async () => map,
    setGroupings: vi.fn(async (g: GroupingsFile) => {
      saved.push(g);
      return { ok: true as const, changed: true };
    }),
  } as unknown as Api);
  return saved;
}

const MAP: ScenarioMap = {
  groupings: [
    {
      id: 'the-key',
      kind: 'puzzle',
      title: 'The key',
      refs: [
        { ref: 'hall', kind: 'room', at: { file: 'games/demo/rooms/hall.ts', line: 1 } },
        { ref: 'gone.rule', kind: 'unknown' },
      ],
    },
  ],
  ungrouped: { room: ['yard'], item: ['item:key'] },
};
const FILE: GroupingsFile = {
  groupings: [{ id: 'the-key', kind: 'puzzle', title: 'The key', refs: ['hall', 'gone.rule'] }],
};

describe('the Map tab', () => {
  it('shows each grouping under its kind, its references written where, or not declared, then what is left', async () => {
    stub(FILE, MAP);
    const tab = new MapTab();
    document.body.append(tab.el);
    await tab.load();
    const heads = [...tab.el.querySelectorAll('h3')].map((h) => h.textContent);
    expect(heads).toEqual(['Chapters', 'Puzzles', 'Characters', 'Not in any grouping']);
    const g = tab.el.querySelector('details.grouping')!;
    expect(g.textContent).toContain('The key');
    expect(g.textContent).toContain('games/demo/rooms/hall.ts:1');
    expect(g.querySelector('.warn')?.textContent).toBe('not declared');
    expect(tab.el.querySelector('.ungrouped')!.textContent).toBe('roomyarditemitem:key');
    expect(tab.el.textContent).toContain('None yet.');
  });

  it('adds, edits and deletes a grouping by writing the whole groupings file', async () => {
    const saved = stub(FILE, MAP);
    const tab = new MapTab();
    document.body.append(tab.el);
    await tab.load();
    // A new one.
    [...tab.el.querySelectorAll('button')].find((b) => b.textContent === 'New grouping')!.click();
    let d = document.querySelector('[role="dialog"]')!;
    const [id, title] = [...d.querySelectorAll('input')];
    id!.value = 'lou';
    title!.value = 'Lou';
    d.querySelector('select')!.value = 'character';
    d.querySelector('textarea')!.value = 'char:lou\n\n  hall.lou.hello  \n';
    [...d.querySelectorAll('button')].find((b) => b.textContent === 'Save')!.click();
    await flush();
    await flush();
    expect(saved.at(-1)).toEqual({
      groupings: [
        FILE.groupings[0],
        { id: 'lou', kind: 'character', title: 'Lou', refs: ['char:lou', 'hall.lou.hello'] },
      ],
    });
    // Edit the existing one: its id stays; then delete it.
    [...tab.el.querySelectorAll('button')].find((b) => b.textContent === 'Edit')!.click();
    d = document.querySelector('[role="dialog"]')!;
    expect((d.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    (d.querySelectorAll('input')[1] as HTMLInputElement).value = 'The brass key';
    [...d.querySelectorAll('button')].find((b) => b.textContent === 'Save')!.click();
    await flush();
    await flush();
    expect(saved.at(-1)!.groupings.map((g) => g.title)).toEqual(['The brass key']);
    [...tab.el.querySelectorAll('button')].find((b) => b.textContent === 'Edit')!.click();
    d = document.querySelector('[role="dialog"]')!;
    [...d.querySelectorAll('button')].find((b) => b.textContent === 'Delete the grouping')!.click();
    await flush();
    await flush();
    expect(saved.at(-1)).toEqual({ groupings: [] });
  });

  it('says when a write is refused, and when the map cannot be had', async () => {
    useApi({
      ...serverApi,
      groupings: async () => ({ groupings: [] }),
      map: async () => ({ groupings: [], ungrouped: {} }),
      setGroupings: async () => Promise.reject(new Error('groupings[0].id must be lowercase letters, digits and -')),
    } as unknown as Api);
    const tab = new MapTab();
    document.body.append(tab.el);
    await tab.load();
    expect(tab.el.textContent).toContain('Everything is in a grouping.');
    [...tab.el.querySelectorAll('button')].find((b) => b.textContent === 'New grouping')!.click();
    const d = document.querySelector('[role="dialog"]')!;
    [...d.querySelectorAll('button')].find((b) => b.textContent === 'Save')!.click();
    await flush();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain('must be lowercase');
    useApi({
      ...serverApi,
      groupings: async () => ({ groupings: [] }),
      map: async () => Promise.reject(new Error('the game does not load')),
    } as unknown as Api);
    await tab.load();
    expect(tab.el.querySelector('.error')!.textContent).toBe('the game does not load');
    useApi({ ...serverApi, map: undefined, groupings: undefined } as unknown as Api);
    await tab.load();
    expect(tab.el.textContent).toContain('needs the dev server');
  });
});

describe('the Map tab, round two', () => {
  it('never replaces a grouping by a new one of the same id, and keeps an edited one in its place', async () => {
    const two: GroupingsFile = {
      groupings: [FILE.groupings[0]!, { id: 'lou', kind: 'character', title: 'Lou', refs: [] }],
    };
    const saved = stub(two, MAP);
    const tab = new MapTab();
    document.body.append(tab.el);
    await tab.load();
    [...tab.el.querySelectorAll('button')].find((b) => b.textContent === 'New grouping')!.click();
    let d = document.querySelector('[role="dialog"]')!;
    d.querySelectorAll('input')[0]!.value = 'the-key';
    d.querySelectorAll('input')[1]!.value = 'Another key';
    [...d.querySelectorAll('button')].find((b) => b.textContent === 'Save')!.click();
    await flush();
    // Both sent: the server refuses the id used twice, nothing is dropped here.
    expect(saved.at(-1)!.groupings.map((g) => g.id)).toEqual(['the-key', 'lou', 'the-key']);
    document.body.replaceChildren(tab.el);
    const edit = [...tab.el.querySelectorAll('button')].find((b) => b.textContent === 'Edit')!;
    const details = edit.closest('details')!;
    edit.click();
    // The button edits, and does not fold the grouping as well.
    expect(details.open).toBe(true);
    d = document.querySelector('[role="dialog"]')!;
    d.querySelectorAll('input')[1]!.value = 'The brass key';
    [...d.querySelectorAll('button')].find((b) => b.textContent === 'Save')!.click();
    await flush();
    expect(saved.at(-1)!.groupings.map((g) => `${g.id}:${g.title}`)).toEqual(['the-key:The brass key', 'lou:Lou']);
  });

  it('is read only for a reviewer, says what a hand-edited file holds that it cannot read, and follows changes', async () => {
    const reads = vi.fn(async () => ({ ...structuredClone(FILE), skipped: ['groupings[1] must be an object'] }));
    useApi({ ...serverApi, groupings: reads, map: async () => MAP } as unknown as Api);
    const tab = new MapTab(true);
    // Not opened yet: a change reads nothing.
    tab.onFileChanged('groupings.json');
    expect(reads).not.toHaveBeenCalled();
    await tab.load();
    const labels = [...tab.el.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).not.toContain('New grouping');
    expect(labels).not.toContain('Edit');
    expect(tab.el.querySelector('.warn li')?.textContent).toBe('groupings[1] must be an object');
    tab.onFileChanged('notes.json');
    expect(reads).toHaveBeenCalledTimes(1);
    tab.onFileChanged('groupings.json');
    tab.onFileChanged('rooms/hall.ts');
    await flush();
    expect(reads).toHaveBeenCalledTimes(3);
  });
});
