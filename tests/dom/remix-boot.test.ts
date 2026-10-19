// @vitest-environment happy-dom
// After the second reading of 4.1.15 (finding 1): a link to another world never replaces a saved game silently. The
// page starts in the saved game's world (Continue stays), the title asks before the link's world replaces it, and the
// stores keep a save of another world instead of writing over it.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { askWorldConflict, decideWorld, peekSavedWorld, sameWorld } from '@engine/dom/remix-boot';
import { worldOf } from '@engine/dom/remix-menu';
import { LocalStore } from '@engine/dom/storage';
import { IndexedDbSaveStore } from '@engine/dom/save-store';
import { applyVariant } from '@engine/core/remix/apply';
import { saveEnvelope } from '@engine/core/save';
import { encodeSeedCode } from '@engine/core/remix/seed-code';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { game as reference } from '../../games/reference/game';

const a = worldOf(reference, encodeSeedCode(1));
const b = worldOf(reference, encodeSeedCode(2));
const story = worldOf(reference, 'story');

async function stateIn(world: typeof a) {
  const g = applyVariant(reference, world);
  const e = new Engine(structuredClone(g), {}, new FakePresenter(), new MemoryStore());
  await e.checkpoint('night_market');
  return { g, state: e.state };
}

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('the world a page starts in', () => {
  it("the saved game's world first; a link to another one becomes a question, never the world", () => {
    expect(decideWorld({ linked: b, stored: b, saved: a })).toEqual({ world: a, keep: true, conflict: b });
    expect(decideWorld({ linked: a, saved: a, stored: a })).toEqual({ world: a, keep: false, conflict: undefined });
    expect(decideWorld({ linked: story, saved: 'story' })).toEqual({
      world: undefined,
      keep: false,
      conflict: undefined,
    });
    expect(decideWorld({ linked: b, saved: 'story' }).conflict).toEqual(b);
    expect(decideWorld({ linked: b, saved: undefined, stored: a })).toEqual({ world: b, keep: true });
    // The Remix menu's choice, confirmed by the player, starts its world.
    expect(decideWorld({ stored: b, saved: a, start: true })).toEqual({ world: b, keep: false });
    expect(sameWorld(story, { ...story, hash: 'x'.repeat(64) })).toBe(true);
  });
  it('reads the autosave without parsing it', async () => {
    const { g, state } = await stateIn(a);
    localStorage.setItem('reference.save', JSON.stringify(saveEnvelope(g, state)));
    indexedDB.deleteDatabase('web-scumm-saves');
    expect((await peekSavedWorld('reference')) as typeof a).toMatchObject({ hash: a.hash });
  });
});

describe('a save of another world is kept', () => {
  it('the localStorage store neither loads it nor writes over it', async () => {
    const { g, state } = await stateIn(a);
    localStorage.setItem('reference.save', JSON.stringify(saveEnvelope(g, state)));
    const errors: Error[] = [];
    const warnings: string[] = [];
    const other = applyVariant(reference, b);
    const store = new LocalStore(
      'reference.save',
      other,
      (e) => errors.push(e),
      (m) => warnings.push(m),
    );
    expect(store.load()).toBeNull();
    expect(warnings[0]).toMatch(/another world/);
    store.save(state);
    expect(errors[0]!.message).toMatch(/kept, not overwritten/);
    expect(JSON.parse(localStorage.getItem('reference.save')!).variant.hash).toBe(a.hash);
    expect(await store.clear()).toBe(true);
  });
  it('the IndexedDB store keeps it until the player clears it', async () => {
    const { g, state } = await stateIn(a);
    const first = await IndexedDbSaveStore.open(g, (e) => {
      throw e;
    });
    first.save(state);
    await first.whenIdle();
    const errors: Error[] = [];
    const other = applyVariant(reference, b);
    const store = await IndexedDbSaveStore.open(
      other,
      (e) => errors.push(e),
      () => {},
    );
    expect(store.load()).toBeNull();
    store.save(state);
    expect(errors[0]!.message).toMatch(/kept, not overwritten/);
    expect(((await peekSavedWorld('reference')) as typeof a).hash).toBe(a.hash);
    await store.clear();
    store.save(state);
    await store.whenIdle();
    expect(((await peekSavedWorld('reference')) as typeof a).hash).toBe(b.hash);
  });
  it('the title asks: continue the saved game (the default, Escape) or start the link’s world', async () => {
    const t = { title: 'Another world', keep: 'Continue', replace: 'Start' };
    let p = askWorldConflict(document.body, 'WS-A', 'WS-B', t);
    expect(document.querySelector('[role="alertdialog"]')?.getAttribute('aria-label')).toBe('Another world');
    document
      .querySelector('[role="alertdialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toBe(false);
    p = askWorldConflict(document.body, 'WS-A', 'WS-B', t);
    document.querySelector<HTMLButtonElement>('button.warn')!.click();
    expect(await p).toBe(true);
  });
});
