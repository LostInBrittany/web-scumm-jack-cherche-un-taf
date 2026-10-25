// The runs' store in the browser (4.1.14 "Time Attack", ADR 0016): IndexedDB `web-scumm-runs`, apart from the saves.
// `heads` holds each run's head, `chunks` its closed chunks (`<runId>:<index>`), `records` the player's local records
// per game and category (personal bests, best segments, attempts: tools/speedrun/records.ts). A chunk and its head are
// written in ONE transaction, so a page closed mid-write leaves the run at its previous chunk, never half a chunk.
import type { ChunkStore, RunHead, StoredChunk } from '../core/journal-chunks';

// The database's name from web-scumm, kept so existing runs are still found (D47).
const DB = 'web-scumm-runs';
const HEADS = 'heads';
const CHUNKS = 'chunks';
const RECORDS = 'records';

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

/** The runs' IndexedDB store: chunks and heads (`ChunkStore`), and the local records. */
export class IndexedDbRunStore implements ChunkStore {
  private constructor(private db: IDBDatabase) {}

  static async open(name = DB): Promise<IndexedDbRunStore> {
    if (!globalThis.indexedDB) throw new Error('IndexedDB is unavailable');
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const s of [HEADS, CHUNKS, RECORDS]) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    return new IndexedDbRunStore(await request(open));
  }

  async putChunk(chunk: StoredChunk, head: RunHead): Promise<void> {
    const tx = this.db.transaction([CHUNKS, HEADS], 'readwrite');
    tx.objectStore(CHUNKS).put(chunk, `${head.runId}:${chunk.index}`);
    tx.objectStore(HEADS).put(head, head.runId);
    await done(tx);
  }

  async putHead(head: RunHead): Promise<void> {
    const tx = this.db.transaction(HEADS, 'readwrite');
    tx.objectStore(HEADS).put(head, head.runId);
    await done(tx);
  }

  async head(runId: string): Promise<RunHead | undefined> {
    const tx = this.db.transaction(HEADS, 'readonly');
    const h = await request(tx.objectStore(HEADS).get(runId));
    await done(tx);
    return h as RunHead | undefined;
  }

  async chunks(runId: string): Promise<StoredChunk[]> {
    const tx = this.db.transaction(CHUNKS, 'readonly');
    const range = IDBKeyRange.bound(`${runId}:`, `${runId}:￿`);
    const all = (await request(tx.objectStore(CHUNKS).getAll(range))) as StoredChunk[];
    await done(tx);
    return all.sort((a, b) => a.index - b.index);
  }

  async runs(): Promise<RunHead[]> {
    const tx = this.db.transaction(HEADS, 'readonly');
    const all = (await request(tx.objectStore(HEADS).getAll())) as RunHead[];
    await done(tx);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async deleteRun(runId: string): Promise<void> {
    const tx = this.db.transaction([CHUNKS, HEADS], 'readwrite');
    tx.objectStore(CHUNKS).delete(IDBKeyRange.bound(`${runId}:`, `${runId}:￿`));
    tx.objectStore(HEADS).delete(runId);
    await done(tx);
  }

  /** A record (any structured-clonable value) by its key (`<game>:<category>`). */
  async getRecord<T>(key: string): Promise<T | undefined> {
    const tx = this.db.transaction(RECORDS, 'readonly');
    const v = await request(tx.objectStore(RECORDS).get(key));
    await done(tx);
    return v as T | undefined;
  }

  async putRecord<T>(key: string, value: T): Promise<void> {
    const tx = this.db.transaction(RECORDS, 'readwrite');
    tx.objectStore(RECORDS).put(value, key);
    await done(tx);
  }

  close(): void {
    this.db.close();
  }
}
