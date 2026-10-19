// The daily backup, written to the instance's bucket (4.2.3 PR 9, H9): `studio-server backup --to-bucket [--keep n]`,
// which a Clever Cloud cron runs (`clevercloud/cron.json`, `ops/studio/backup-cron.sh`). The backup is the one of
// `backup <file>` (ops/backup.ts), under `backups/<date>-r<revision>.json`, the date in UTC, ISO 8601 with `-` for `:`
// (a key that sorts by time, and a file name every system accepts). `--keep n` then deletes the older backups past the
// n most recent: only the keys this command writes, never the one it has just written.
//
// The limit: the backups live in the bucket that holds the blobs. They survive the database (the drill restores one
// into a new PostgreSQL add-on), not the loss of the bucket or of its credentials; a copy elsewhere is the operator's.
import type { StudioBackup } from './backup';

/** The bucket as the backups need it: the S3 client (server/s3.ts) or a test's. */
export interface BackupBucket {
  put(key: string, body: Buffer): Promise<void>;
  list(prefix: string): AsyncIterable<{ key: string }>;
  delete(key: string): Promise<void>;
}

export const BACKUP_PREFIX = 'backups/';
/** A key this command writes: nothing else under `backups/` is ever deleted by `--keep`. */
const BACKUP_KEY = /^backups\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-r\d+\.json$/;

/** `backups/2026-10-19T03-00-00Z-r42.json`: the backup's own time and revision. */
export function backupKey(b: Pick<StudioBackup, 'at' | 'revision'>): string {
  const iso = new Date(b.at)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
  return `${BACKUP_PREFIX}${iso}-r${b.revision}.json`;
}

/** `--keep n`: a whole number from 1; anything else is refused before the backup is made. */
export function keepOf(v: string | undefined): number {
  const n = Number(v);
  if (v === undefined || !/^\d{1,4}$/.test(v) || n < 1)
    throw new Error('--keep is the number of backups kept (1 or more)');
  return n;
}

/**
 * Writes the backup to the bucket, then, with `keep`, deletes the backups older than the `keep` most recent (by key,
 * which sorts by time). Returns the key written and the keys deleted.
 */
export async function backupToBucket(
  bucket: BackupBucket,
  b: StudioBackup,
  keep?: number,
): Promise<{ key: string; removed: string[] }> {
  const key = backupKey(b);
  await bucket.put(key, Buffer.from(`${JSON.stringify(b)}\n`));
  const removed: string[] = [];
  if (keep === undefined) return { key, removed };
  const keys: string[] = [];
  for await (const o of bucket.list(BACKUP_PREFIX)) if (BACKUP_KEY.test(o.key) && o.key !== key) keys.push(o.key);
  // The one just written is always kept, and counts as one of the `keep`.
  const older = keys
    .sort()
    .reverse()
    .slice(keep - 1);
  for (const k of older) {
    await bucket.delete(k);
    removed.push(k);
  }
  return { key, removed };
}
