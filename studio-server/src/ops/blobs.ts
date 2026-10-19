// Content-addressed blobs (4.2.1, plan P1 and §4): the "after" content of every file an operation writes is stored
// here, under its sha256, before the operation is logged. A recovery rolls an operation forward from them. The local
// store keeps them on the disk; the hosted one (Cellar) comes with the server.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { sha256, writeDurable } from './durable';

export interface BlobStore {
  /**
   * Stores `bytes` (durably) and returns their sha256. Storing the same bytes twice is one blob, written anew: its
   * date is the last time it was stored, so the collection's grace period covers a write naming an old blob again.
   */
  put(bytes: Buffer): Promise<string>;
  /** The bytes of a blob, checked against their hash; throws when it is missing or damaged. */
  get(hash: string): Promise<Buffer>;
  has(hash: string): Promise<boolean>;
  /** Every blob, with when it was written (4.2.2: the collection of the unreferenced). */
  list?(): AsyncIterable<{ hash: string; at: number }>;
  /** Deletes one blob (the collection only). */
  remove?(hash: string): Promise<void>;
}

const HEX = /^[0-9a-f]{64}$/;

/** Blobs as files: `<dir>/<first two hex digits>/<the rest>`. */
export function fsBlobStore(dir: string): BlobStore {
  const path = (hash: string) => {
    if (!HEX.test(hash)) throw new Error(`not a blob hash: "${hash}"`);
    return join(dir, hash.slice(0, 2), hash.slice(2));
  };
  return {
    async put(bytes) {
      const hash = sha256(bytes);
      const file = path(hash);
      if (!existsSync(file)) writeDurable(file, bytes);
      else {
        const now = new Date();
        utimesSync(file, now, now);
      }
      return hash;
    },
    async get(hash) {
      const file = path(hash);
      if (!existsSync(file)) throw new Error(`blob ${hash} is missing`);
      const bytes = readFileSync(file);
      if (sha256(bytes) !== hash) throw new Error(`blob ${hash} is damaged`);
      return bytes;
    },
    async has(hash) {
      return existsSync(path(hash));
    },
    async *list() {
      if (!existsSync(dir)) return;
      for (const a of readdirSync(dir))
        if (/^[0-9a-f]{2}$/.test(a))
          for (const b of readdirSync(join(dir, a)))
            if (/^[0-9a-f]{62}$/.test(b)) yield { hash: a + b, at: statSync(join(dir, a, b)).mtimeMs };
    },
    async remove(hash) {
      rmSync(path(hash), { force: true });
    },
  };
}
