// One packed snapshot per revision (4.4.0), shared by the preview, the health, the published builds and the engine's
// upgrade: each confirmed write asked for it two or three times, each time under the instance's lock alone, with the
// folder repaired and walked again. The snapshot is packed as before (`pack`: the lock, the repair, the revision read
// with the bytes, so it is labelled with the revision it was made from); it is then given again while the head is
// still that revision of that epoch, looked at each time (`head`, no lock: two reads of the journal's meta), so a write
// another process confirmed (the CLI's import) is seen too. A confirmed write here forgets it at once. A pack that
// fails is not kept.
import type { EventEmitter } from 'node:events';

export interface PackedSnapshot {
  epoch: string;
  rev: number;
  bytes: Buffer;
}

export function snapshotMemo(o: {
  pack: () => Promise<PackedSnapshot>;
  head: () => Promise<{ epoch: string; rev: number }>;
  /** The journal's events: `confirmed` forgets the snapshot kept. */
  events?: EventEmitter;
}): () => Promise<PackedSnapshot> {
  let memo: Promise<PackedSnapshot> | undefined;
  o.events?.on('confirmed', () => {
    memo = undefined;
  });
  const packed = (): Promise<PackedSnapshot> => {
    const p = o.pack();
    memo = p;
    p.catch(() => {
      if (memo === p) memo = undefined;
    });
    return p;
  };
  const get = async (): Promise<PackedSnapshot> => {
    const m = memo;
    if (!m) return packed();
    const s = await m.catch(() => undefined);
    if (s) {
      const h = await o.head();
      if (h.epoch === s.epoch && h.rev === s.rev) return s;
    }
    // Packed again: by this caller, unless another one did meanwhile (or a write forgot it: then by this one).
    return memo === m ? packed() : get();
  };
  return get;
}
