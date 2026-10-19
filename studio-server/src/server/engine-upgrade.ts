// The engine's upgrade of a hosted game (4.2.3 PR 8, H6): `web-scumm migrate` as one exclusive operation of the
// owner. Under the project's exclusive lease (`*`: every other write waits, or is refused with the holder's name), the
// head is packed, the worker computes the migration on it (`migrate`, migrate.ts: the files it would change, written
// nowhere), and the migrated game is judged on the worker as the health judges a revision (the validator, then the
// solver from a new game, bounded in time). A game the migration would break, or that cannot be judged (the solver cut
// short), is refused (422) and nothing is written: the head stays as it was. Otherwise the files are written as ONE
// operation of the journal, through the guard (which validates once more), undoable: the owner takes it back by their
// personal undo, or the project goes back by a restore of a backup taken before. In the 4.2.x line the content format
// is frozen (D40): this serves a game imported from a 4.1.x that never migrated.
import { StudioError } from '../ops/errors';
import type { Migrated } from '../worker/migrate';
import { overlaySnapshot, snapshotTexts } from '../worker/snapshot';
import type { Verdict } from './health';

export interface EngineUpgradeOptions {
  /** The head packed (a version 1 snapshot), holding the instance's lock. */
  snapshot: () => Promise<{ epoch: string; rev: number; bytes: Buffer }>;
  /** The worker's `migrate` on a snapshot. */
  migrate: (snapshot: Buffer, at: { epoch: string; rev: number }) => Promise<Migrated>;
  /** The verdict on a snapshot: the validator, then the solver (health.ts `judgeBy`, the worker's jobs). */
  judge: (snapshot: Buffer, at: { epoch: string; rev: number }) => Promise<Verdict>;
  /**
   * Writes the files as one operation of the journal, guarded and undoable, as the member; `from`: the content each
   * was computed from (a write since is a 409). Returns the revision it made: `writeFiles` gives the paths it changed,
   * not its revision, so the journal's head is read after it, under the exclusive lease (no other write between).
   */
  write: (what: string, files: { path: string; after: string; from: string | null }[]) => Promise<number>;
  /** Takes and gives back the project's exclusive lease for the member. */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  log?: (line: Record<string, unknown>) => void;
}

export type UpgradeResult =
  | { changed: 0; schema: { from: number; to: number } }
  | { changed: number; revision: number; paths: string[]; schema: { from: number; to: number } };

export class EngineUpgrade {
  private busy = false;

  constructor(private o: EngineUpgradeOptions) {}

  /** The upgrade, one at a time: nothing to do, a revision, or a refusal (422) with the migrated game's errors. */
  async migrate(by: string): Promise<UpgradeResult> {
    if (this.busy) throw new StudioError("the engine's upgrade is running: try again when it is done", 429);
    this.busy = true;
    try {
      return await this.o.exclusive(async () => {
        const snap = await this.o.snapshot();
        const at = { epoch: snap.epoch, rev: snap.rev };
        const m = await this.o.migrate(snap.bytes, at);
        const paths = Object.keys(m.files).sort();
        if (!paths.length) return { changed: 0 as const, schema: m.schema };
        const v = await this.o.judge(overlaySnapshot(snap.bytes, m.files), at);
        if (!v.ok || v.unknown) {
          this.o.log?.({ event: 'engine-upgrade-refused', rev: snap.rev, by, errors: v.errors.length });
          throw Object.assign(
            new StudioError(
              v.unknown
                ? `refused: the migrated game cannot be judged (${v.unknown}); nothing was written`
                : `refused: the migration would break the game (${v.errors.slice(0, 3).join('; ')}); nothing was written`,
              422,
            ),
            { body: { errors: v.errors.slice(0, 20), skipped: m.skipped, schema: m.schema, rev: snap.rev } },
          );
        }
        const before = snapshotTexts(snap.bytes);
        const revision = await this.o.write(
          `engine upgrade: authoring schema ${m.schema.from} → ${m.schema.to}`,
          paths.map((path) => ({ path, after: m.files[path]!, from: before.get(path) ?? null })),
        );
        this.o.log?.({ event: 'engine-upgraded', rev: revision, by, files: paths.length, schema: m.schema });
        return { changed: paths.length, revision, paths, schema: m.schema };
      });
    } finally {
      this.busy = false;
    }
  }
}
