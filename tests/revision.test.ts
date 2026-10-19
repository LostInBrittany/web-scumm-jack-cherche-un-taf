// Saves across revisions (4.2.2, ADR 0026): a build that declares its revision records where each save was made, and
// asks before resuming one made in other content; the same content (another revision number) asks nothing; Stay goes
// to the save's revision; the autosave's record follows its saves and its erasure; a slot keeps a well-formed record
// only. The dialog itself runs in a real preview (scripts/e2e-studio-hosted.ts).
import { describe, expect, it } from 'vitest';
import { Engine } from '@engine/core/engine';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { parseSlot, saveEnvelope } from '@engine/core/save';
import type { GameState } from '@engine/core/types';
import { RevisionGuard, type ResumeChoice, type SavedRevision, savedRevision } from '@engine/dom/revision';
import { mini, miniLayouts } from './fixtures/mini';

const memory = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

const guard = (o: {
  rev?: number;
  fingerprint?: string;
  answer?: ResumeChoice;
  storage?: ReturnType<typeof memory>;
}) => {
  const asked: [SavedRevision, SavedRevision][] = [];
  const went: string[] = [];
  const g = new RevisionGuard({
    game: 'demo',
    build: { rev: o.rev ?? 7, url: (r) => `/preview/${r}/?dev` },
    fingerprint: o.fingerprint ?? 'fp-7',
    ask: async (saved, here) => {
      asked.push([saved, here]);
      return o.answer ?? 'resume';
    },
    go: (u) => went.push(u),
    storage: o.storage ?? memory(),
  });
  return { g, asked, went };
};

describe('saves across revisions', () => {
  it('resumes without a question a save of the same content, or one that says nothing of where it was made', async () => {
    const { g, asked } = guard({});
    expect(await g.resume(undefined)).toBe('resume');
    expect(await g.resume({ rev: 7, fingerprint: 'fp-7' })).toBe('resume');
    // Another revision number, the same content (a revision that changed only notes): nothing to ask.
    expect(await g.resume({ rev: 5, fingerprint: 'fp-7' })).toBe('resume');
    expect(asked).toEqual([]);
  });

  it('asks before a save made in other content, and follows each choice', async () => {
    for (const answer of ['resume', 'restart', 'stay', 'cancel'] as const) {
      const { g, asked, went } = guard({ answer });
      expect(await g.resume({ rev: 3, fingerprint: 'fp-3' })).toBe(answer);
      expect(asked).toEqual([
        [
          { rev: 3, fingerprint: 'fp-3' },
          { rev: 7, fingerprint: 'fp-7' },
        ],
      ]);
      // Stay: the save's own revision, by its URL; nothing else leaves the page.
      expect(went).toEqual(answer === 'stay' ? ['/preview/3/?dev'] : []);
    }
  });

  it("records the autosave's revision with each save, and forgets it with the save", async () => {
    const storage = memory();
    const { g } = guard({ storage });
    const store = new MemoryStore();
    g.watch(store);
    expect(g.autosave()).toBeUndefined();
    store.save({ room: 'garden' } as unknown as GameState);
    expect(store.data).toEqual({ room: 'garden' });
    expect(g.autosave()).toEqual({ rev: 7, fingerprint: 'fp-7' });
    // A later build of the same page reads it back.
    expect(guard({ rev: 9, fingerprint: 'fp-9', storage }).g.autosave()).toEqual({ rev: 7, fingerprint: 'fp-7' });
    expect(await store.clear()).toBe(true);
    expect(g.autosave()).toBeUndefined();
    // Storage refused: the save is still made, and nothing is asked later (as before 4.2.2).
    const refusing = new RevisionGuard({
      game: 'demo',
      build: { rev: 1, url: String },
      fingerprint: 'f',
      ask: async () => 'restart',
      storage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
      },
    });
    const s2 = new MemoryStore();
    refusing.watch(s2);
    s2.save({ room: 'x' } as unknown as GameState);
    expect(s2.data).toEqual({ room: 'x' });
    expect(refusing.autosave()).toBeUndefined();
    expect(await s2.clear()).toBe(true);
  });

  it('records the autosave only once a store that verifies its writes has written it', async () => {
    const storage = memory();
    const { g } = guard({ storage });
    let idle: Promise<void> = Promise.resolve();
    const store = Object.assign(new MemoryStore(), { whenIdle: () => idle });
    g.watch(store);
    idle = Promise.reject(new Error('quota'));
    idle.catch(() => undefined);
    store.save({ room: 'a' } as unknown as GameState);
    await new Promise((ok) => setTimeout(ok, 0));
    expect(g.autosave()).toBeUndefined();
    idle = Promise.resolve();
    store.save({ room: 'b' } as unknown as GameState);
    expect(g.autosave()).toBeUndefined();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(g.autosave()).toEqual({ rev: 7, fingerprint: 'fp-7' });
  });

  it('reads a record only when it is well formed', () => {
    expect(savedRevision({ rev: 2, fingerprint: 'a-b' })).toEqual({ rev: 2, fingerprint: 'a-b' });
    for (const bad of [null, 'x', {}, { rev: -1, fingerprint: 'a' }, { rev: 1.5, fingerprint: 'a' }, { rev: 1 }])
      expect(savedRevision(bad), JSON.stringify(bad)).toBeUndefined();
    expect(savedRevision({ rev: 1, fingerprint: '' })).toBeUndefined();
    expect(savedRevision({ rev: 1, fingerprint: 'x'.repeat(401) })).toBeUndefined();
  });

  it("keeps a slot's revision through the store's reading, and only a well-formed one", async () => {
    const game = mini();
    const engine = new Engine(game, miniLayouts, new FakePresenter(), new MemoryStore());
    await engine.newGame();
    const envelope = saveEnvelope(game, engine.state);
    const raw = (revision: unknown) =>
      JSON.parse(
        JSON.stringify({
          meta: { at: 1, room: engine.state.room, roomName: 'Garden', v: engine.state.v, revision },
          envelope,
        }),
      );
    expect(parseSlot(game, raw({ rev: 4, fingerprint: 'fp-4' })).meta.revision).toEqual({
      rev: 4,
      fingerprint: 'fp-4',
    });
    // A malformed one is kept as stored, and the guard reads it as no record: no question.
    const bad = parseSlot(game, raw({ rev: 'x', fingerprint: 'fp' })).meta.revision;
    const { g, asked } = guard({});
    expect(await g.resume(bad)).toBe('resume');
    expect(asked).toEqual([]);
    expect(parseSlot(game, raw(undefined)).meta.revision).toBeUndefined();
  });
});
