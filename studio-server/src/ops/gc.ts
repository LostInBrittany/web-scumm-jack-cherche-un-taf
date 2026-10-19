// The collection of the blobs no row names any more (4.2.2 PR 7, plan §2.7): a blob is kept while the head, an
// operation (before or after), a preview, a published build or a prepared set names it, and while it is younger than
// the grace period (a write may be storing it now, before its row lands). Listed by default; deleted with `delete`.
// The worker's staging prefix is swept too: a job's objects older than an hour belong to no job any more.
import type { SqlDb } from '../../../bridge/src/store-sql';
import { backupOf } from './backup';
import type { BlobStore } from './blobs';

export interface Collected {
  referenced: number;
  /** Unreferenced and older than the grace period: deleted with `delete`, else only counted. */
  unreferenced: string[];
  removed: number;
  staging: number;
}

export async function collect(
  db: SqlDb,
  blobs: BlobStore,
  o: {
    delete: boolean;
    graceMs?: number;
    now?: number;
    staging?: { list(prefix: string): AsyncIterable<{ key: string; at: number }>; delete(key: string): Promise<void> };
  },
): Promise<Collected> {
  if (!blobs.list || !blobs.remove) throw new Error('gc: this blob store cannot be listed');
  const now = o.now ?? Date.now();
  const grace = o.graceMs ?? 24 * 3_600_000;
  // The rows read once, as a backup reads them: one snapshot of what names a blob.
  const referenced = new Set((await backupOf(db, now)).blobs);
  const unreferenced: string[] = [];
  for await (const b of blobs.list()) if (!referenced.has(b.hash) && b.at < now - grace) unreferenced.push(b.hash);
  let removed = 0;
  if (o.delete)
    for (const h of unreferenced) {
      await blobs.remove(h);
      removed++;
    }
  let staging = 0;
  if (o.staging)
    for await (const s of o.staging.list('staging/'))
      if (s.at < now - 3_600_000) {
        staging++;
        if (o.delete) await o.staging.delete(s.key);
      }
  return { referenced: referenced.size, unreferenced, removed, staging };
}
