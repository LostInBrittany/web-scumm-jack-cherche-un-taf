// One snapshot per revision (4.4.0, studio-server/src/server/snapshot-memo.ts): the preview, the health and the builds
// asking at once pack once; asked again with the head unmoved, it is not packed again; a write (here: `confirmed`;
// elsewhere: the head read) packs again; another epoch packs again; a pack that fails is not kept.
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { type PackedSnapshot, snapshotMemo } from '../studio-server/src/server/snapshot-memo';

function setup() {
  const head = { epoch: 'e1', rev: 1 };
  const events = new EventEmitter();
  let packs = 0;
  let heads = 0;
  /** The packs that fail next. */
  let fail = 0;
  let gate: Promise<void> | null = null;
  const get = snapshotMemo({
    pack: async (): Promise<PackedSnapshot> => {
      packs++;
      const at = { ...head };
      await gate;
      if (fail > 0) {
        fail--;
        throw new Error('the lock is gone');
      }
      return { ...at, bytes: Buffer.from(`rev ${at.rev}`) };
    },
    head: async () => {
      heads++;
      return { ...head };
    },
    events,
  });
  return {
    head,
    events,
    get,
    packs: () => packs,
    heads: () => heads,
    fail: (n: number) => (fail = n),
    gate: (g: Promise<void> | null) => (gate = g),
  };
}

describe('one snapshot per revision', () => {
  it('is packed once for the callers of one revision, at once or later', async () => {
    const s = setup();
    const [a, b, c] = await Promise.all([s.get(), s.get(), s.get()]);
    expect(s.packs()).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a!.bytes.toString()).toBe('rev 1');
    expect(await s.get()).toBe(a);
    expect(s.packs()).toBe(1);
    // The head was looked at by each caller given the kept one, never by the one that packed it.
    expect(s.heads()).toBe(3);
  });

  it('is packed again after a write confirmed here, without a look at the head', async () => {
    const s = setup();
    await s.get();
    s.head.rev = 2;
    s.events.emit('confirmed', { rev: 2 });
    const before = s.heads();
    expect((await s.get()).rev).toBe(2);
    expect(s.packs()).toBe(2);
    expect(s.heads()).toBe(before);
  });

  it("is packed again when the head moved without an event here (another process's write), or the epoch", async () => {
    const s = setup();
    await s.get();
    s.head.rev = 2;
    expect((await s.get()).rev).toBe(2);
    expect(s.packs()).toBe(2);
    s.head.epoch = 'e2';
    expect(await s.get()).toMatchObject({ epoch: 'e2', rev: 2 });
    expect(s.packs()).toBe(3);
    expect(await s.get()).toMatchObject({ epoch: 'e2', rev: 2 });
    expect(s.packs()).toBe(3);
  });

  it('packs once for the callers that find it stale together', async () => {
    const s = setup();
    await s.get();
    s.head.rev = 5;
    const [a, b] = await Promise.all([s.get(), s.get()]);
    expect(a.rev).toBe(5);
    expect(b).toBe(a);
    expect(s.packs()).toBe(2);
  });

  it('is labelled with the revision it was packed at: a write during the pack is packed next time', async () => {
    const s = setup();
    let open!: () => void;
    s.gate(new Promise((ok) => (open = ok)));
    const first = s.get();
    s.head.rev = 2;
    s.events.emit('confirmed', { rev: 2 });
    open();
    expect((await first).rev).toBe(1);
    s.gate(null);
    expect((await s.get()).rev).toBe(2);
    expect(s.packs()).toBe(2);
  });

  it('keeps no failed pack', async () => {
    const s = setup();
    s.fail(1);
    await expect(s.get()).rejects.toThrow('the lock is gone');
    expect((await s.get()).rev).toBe(1);
    expect(s.packs()).toBe(2);
    // A caller that waited on the failed pack packs again itself.
    s.head.rev = 2;
    s.events.emit('confirmed', {});
    s.fail(1);
    let open!: () => void;
    s.gate(new Promise((ok) => (open = ok)));
    const a = s.get();
    const b = s.get();
    open();
    await expect(a).rejects.toThrow();
    expect((await b).rev).toBe(2);
    expect(s.packs()).toBe(4);
  });
});
