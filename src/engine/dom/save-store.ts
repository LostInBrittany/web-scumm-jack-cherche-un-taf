import type { SaveStore, SlotMeta, SlotStore } from '../core/ports';
import type { GameDef, GameState } from '../core/types';
import { parseSave, parseSlot, SaveWorldMismatch, saveEnvelope, type SlotRecord } from '../core/save';

// The database's name from web-scumm, kept so existing saves are still found (D47).
const DB = 'web-scumm-saves';
const STORE = 'slots';

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
const transaction = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;

/**
 * IndexedDB-backed autosave with a synchronously readable cache for the deterministic core, and the manual slots
 * (`<game>:slot:<n>`) in the same object store. Writes are serialised and verified by reading the committed envelope
 * back. Errors are never swallowed.
 */
export class IndexedDbSaveStore implements SaveStore, SlotStore {
  private value: GameState | null = null;
  private pending: Promise<void> = Promise.resolve();
  private lastError: Error | null = null;
  /** The autosave belongs to another world (4.1.15): kept, never overwritten until `clear()` (the player's choice). */
  private foreign: SaveWorldMismatch | null = null;
  private constructor(
    private db: IDBDatabase,
    private game: GameDef,
    private fail: (error: Error) => void,
  ) {}

  static async open(
    game: GameDef,
    fail: (error: Error) => void,
    warn: (message: string) => void = console.warn,
  ): Promise<IndexedDbSaveStore> {
    if (!globalThis.indexedDB) throw new Error('IndexedDB is unavailable');
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
    };
    const db = await request(open);
    const out = new IndexedDbSaveStore(db, game, fail);
    const tx = db.transaction(STORE, 'readonly');
    const saved = await request(tx.objectStore(STORE).get(`${game.id}:auto`));
    await transaction(tx);
    if (saved !== undefined)
      try {
        out.value = parseSave(game, saved, { warn });
      } catch (e) {
        // A save of another world (4.1.15): kept as it is; this page cannot resume it, nor write over it.
        if (!(e instanceof SaveWorldMismatch)) throw e;
        out.foreign = e;
        warn(e.message);
      }
    else {
      // One-time import of the v2 localStorage autosave. It is removed only after IndexedDB verifies the copy.
      let legacy: string | null = null;
      try {
        legacy = localStorage.getItem(`${game.id}.save`);
      } catch {
        /* unavailable localStorage is fine */
      }
      if (legacy) {
        out.value = parseSave(game, JSON.parse(legacy), { warn });
        await out.write(out.value);
        try {
          localStorage.removeItem(`${game.id}.save`);
        } catch {
          /* the durable copy already exists */
        }
      }
    }
    // One-time import of the v2 localStorage slots, each removed only after IndexedDB verified its copy.
    for (let n = 1; n <= (game.saves?.slots ?? 0); n++) {
      let legacy: string | null = null;
      try {
        legacy = localStorage.getItem(`${game.id}.slot.${n}`);
      } catch {
        break;
      }
      if (!legacy) continue;
      try {
        const { meta, state } = parseSlot(game, JSON.parse(legacy), { warn });
        await out.writeSlot(n, state, meta);
        try {
          localStorage.removeItem(`${game.id}.slot.${n}`);
        } catch {
          /* the durable copy already exists */
        }
      } catch (e) {
        warn(`slot ${n} could not be imported: ${(e as Error).message}`);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ manual slots

  private slotKey(n: number) {
    return `${this.game.id}:slot:${n}`;
  }

  async listSlots(count: number): Promise<(SlotMeta | null)[]> {
    await this.pending.catch(() => undefined);
    const tx = this.db.transaction(STORE, 'readonly');
    const out: (SlotMeta | null)[] = [];
    for (let n = 1; n <= count; n++) {
      const raw = await request(tx.objectStore(STORE).get(this.slotKey(n)));
      try {
        out.push(raw === undefined ? null : parseSlot(this.game, raw).meta);
      } catch (e) {
        this.fail(e as Error);
        out.push(null);
      }
    }
    await transaction(tx);
    return out;
  }

  async getSlot(n: number): Promise<GameState | null> {
    await this.pending.catch(() => undefined);
    const tx = this.db.transaction(STORE, 'readonly');
    const raw = await request(tx.objectStore(STORE).get(this.slotKey(n)));
    await transaction(tx);
    if (raw === undefined) return null;
    try {
      return parseSlot(this.game, raw).state;
    } catch (e) {
      this.fail(e as Error);
      return null;
    }
  }

  putSlot(n: number, state: GameState, meta: SlotMeta): Promise<boolean> {
    const snapshot = structuredClone(state);
    const done = this.pending
      .then(() => this.writeSlot(n, snapshot, meta))
      .then(
        () => true,
        (e) => {
          this.fail(e instanceof Error ? e : new Error(String(e)));
          return false;
        },
      );
    this.pending = done.then(() => undefined);
    return done;
  }

  clearSlot(n: number): Promise<boolean> {
    const done = this.pending
      .then(async () => {
        const tx = this.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(this.slotKey(n));
        await transaction(tx);
        return true;
      })
      .catch((e) => {
        this.fail(e instanceof Error ? e : new Error(String(e)));
        return false;
      });
    this.pending = done.then(() => undefined);
    return done;
  }

  private async writeSlot(n: number, state: GameState, meta: SlotMeta) {
    const record: SlotRecord = { meta, envelope: saveEnvelope(this.game, state) };
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, this.slotKey(n));
    await transaction(tx);
    const checkTx = this.db.transaction(STORE, 'readonly');
    const committed = await request(checkTx.objectStore(STORE).get(this.slotKey(n)));
    await transaction(checkTx);
    const verified = parseSlot(this.game, committed).state;
    if (JSON.stringify(canonical(verified)) !== JSON.stringify(canonical(state)))
      throw new Error(`IndexedDB slot ${n} verification failed`);
  }

  load(): GameState | null {
    return this.value ? structuredClone(this.value) : null;
  }

  save(state: GameState): void {
    if (this.foreign) {
      this.fail(new Error(`${this.foreign.message}; it is kept, not overwritten`));
      return;
    }
    this.value = structuredClone(state);
    const snapshot = structuredClone(state);
    this.lastError = null;
    this.pending = this.pending
      .then(() => this.write(snapshot))
      .catch((e) => {
        this.lastError = e instanceof Error ? e : new Error(String(e));
        this.fail(this.lastError);
      });
  }

  clear(): Promise<boolean> {
    const previous = this.value;
    this.foreign = null;
    this.value = null;
    this.lastError = null;
    const done = this.pending
      .then(async () => {
        const tx = this.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(`${this.game.id}:auto`);
        await transaction(tx);
        return true;
      })
      .catch((e) => {
        // The durable save is still there: the cache says so too, and the failure is reported like a failed write.
        this.value = previous;
        this.lastError = e instanceof Error ? e : new Error(String(e));
        this.fail(this.lastError);
        return false;
      });
    this.pending = done.then(() => undefined);
    return done;
  }

  /** Tests and shutdown flows can await the latest verified write. */
  async whenIdle(): Promise<void> {
    await this.pending;
    if (this.lastError) throw this.lastError;
  }

  private async write(state: GameState) {
    const envelope = saveEnvelope(this.game, state);
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(envelope, `${this.game.id}:auto`);
    await transaction(tx);
    const checkTx = this.db.transaction(STORE, 'readonly');
    const committed = await request(checkTx.objectStore(STORE).get(`${this.game.id}:auto`));
    await transaction(checkTx);
    const verified = parseSave(this.game, committed);
    if (JSON.stringify(canonical(verified)) !== JSON.stringify(canonical(state)))
      throw new Error('IndexedDB autosave verification failed');
  }
}
