// The engine's upgrade of a hosted game (4.2.3 PR 8, H6): `quest-n-click migrate` as one exclusive operation of the
// owner. Under the project's exclusive lease (`*`: every other write waits, or is refused with the holder's name), the
// head is packed, the worker computes the migration on it (`migrate`, migrate.ts: the files it would change, written
// nowhere), and the migrated game is judged on the worker as the health judges a revision (the validator, then the
// solver from a new game, bounded in time). A game the migration would break, or that cannot be judged (the solver cut
// short), is refused (422) and nothing is written: the head stays as it was. Otherwise the files are written as ONE
// operation of the journal, through the guard (which validates once more), undoable: the owner takes it back by their
// personal undo, or the project goes back by a restore of a backup taken before. In the 4.2.x line the content format
// is frozen (D40): this serves a game imported from a 4.1.x that never migrated.
import type { ValidateResult } from '../../../tools/studio/types';
import { renameImports } from '../../../tools/migrate-name';
import { isGameDoesNotLoad, StudioError } from '../ops/errors';
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
   * The validator alone on a snapshot (the worker's job), for the former name's rename (4.3.0): a GameDoesNotLoad when
   * the game's code does not load.
   */
  validate: (snapshot: Buffer, at: { epoch: string; rev: number }) => Promise<ValidateResult>;
  /**
   * Writes the files as one operation of the journal, guarded and undoable, as the member; `from`: the content each
   * was computed from (a write since is a 409). Returns the revision it made: `writeFiles` gives the paths it changed,
   * not its revision, so the journal's head is read after it, under the exclusive lease (no other write between).
   */
  write: (
    what: string,
    files: { path: string; after: string; from: string | null }[],
    o?: { undo?: boolean },
  ) => Promise<number>;
  /** Takes and gives back the project's exclusive lease for the member. */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  log?: (line: Record<string, unknown>) => void;
}

/** The former name's rename, when there was one (4.3.0): its own revision, written before the schema's migration. */
export interface Renamed {
  revision: number;
  paths: string[];
}

export type UpgradeResult =
  | { changed: 0; schema: { from: number; to: number }; renamed?: Renamed }
  | { changed: number; revision: number; paths: string[]; schema: { from: number; to: number }; renamed?: Renamed };

export const RENAMED_WHAT =
  "engine upgrade: the former name's imports renamed (web-scumm/… or quest-n-click/… → @quest-n-click/engine/…)";

export class EngineUpgrade {
  private busy = false;

  constructor(private o: EngineUpgradeOptions) {}

  /** The upgrade, one at a time: nothing to do, a revision, or a refusal (422) with the migrated game's errors. */
  async migrate(by: string): Promise<UpgradeResult> {
    if (this.busy) throw new StudioError("the engine's upgrade is running: try again when it is done", 429);
    this.busy = true;
    try {
      return await this.o.exclusive(async () => {
        const renamed = await this.renameFormer(by);
        const snap = await this.o.snapshot();
        const at = { epoch: snap.epoch, rev: snap.rev };
        const m = await this.o.migrate(snap.bytes, at);
        const paths = Object.keys(m.files).sort();
        if (!paths.length) {
          if (renamed) return { changed: renamed.paths.length, ...renamed, schema: m.schema, renamed };
          return { changed: 0 as const, schema: m.schema };
        }
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
            {
              body: {
                errors: v.errors.slice(0, 20),
                skipped: m.skipped,
                schema: m.schema,
                rev: snap.rev,
                ...(renamed ? { renamed } : {}),
              },
            },
          );
        }
        const before = snapshotTexts(snap.bytes);
        const revision = await this.o.write(
          `engine upgrade: authoring schema ${m.schema.from} → ${m.schema.to}`,
          paths.map((path) => ({ path, after: m.files[path]!, from: before.get(path) ?? null })),
        );
        this.o.log?.({ event: 'engine-upgraded', rev: revision, by, files: paths.length, schema: m.schema });
        return { changed: paths.length, revision, paths, schema: m.schema, ...(renamed ? { renamed } : {}) };
      });
    } finally {
      this.busy = false;
    }
  }

  /**
   * The former name's imports (4.3.0, D47), renamed by the Studio itself (`renameImports` on the head's own texts, no
   * game code involved) as a revision of its own, before the schema's migration. Judged by what the rename can change:
   * the game loads after it, and, when it loaded before, no validator error is added. Never by the solver, so a game
   * not finished yet is not stuck on a head that does not load. Not undoable: its undo would put back imports that no
   * longer resolve (a backup taken before is the way back).
   */
  private async renameFormer(by: string): Promise<Renamed | undefined> {
    const snap = await this.o.snapshot();
    const at = { epoch: snap.epoch, rev: snap.rev };
    const texts = snapshotTexts(snap.bytes);
    const files: Record<string, string> = {};
    for (const [path, text] of texts) {
      if (!/\.(?:[cm]?ts|tsx)$/.test(path)) continue;
      const next = renameImports(text);
      if (next !== null) files[path] = next;
    }
    const paths = Object.keys(files).sort();
    if (!paths.length) return undefined;
    const refuse = (why: string, errors: string[]) => {
      this.o.log?.({ event: 'engine-upgrade-refused', rev: snap.rev, by, errors: errors.length });
      return Object.assign(new StudioError(`refused: ${why}; nothing was written`, 422), {
        body: { errors: errors.slice(0, 20), rev: snap.rev, renamed: { paths } },
      });
    };
    const was = await this.o.validate(snap.bytes, at).then(
      (v) => new Set(v.errors),
      (e: unknown) => {
        if (isGameDoesNotLoad(e)) return undefined;
        throw e;
      },
    );
    const after = await this.o.validate(overlaySnapshot(snap.bytes, files), at).catch((e: unknown) => {
      throw isGameDoesNotLoad(e)
        ? refuse(`the game still does not load once its imports are renamed (${e.message})`, [e.message])
        : e;
    });
    const added = was ? after.errors.filter((e) => !was.has(e)) : [];
    if (added.length) throw refuse(`renaming the imports adds ${added.length} validation error(s)`, added);
    const revision = await this.o.write(
      RENAMED_WHAT,
      paths.map((path) => ({ path, after: files[path]!, from: texts.get(path) ?? null })),
      { undo: false },
    );
    this.o.log?.({ event: 'engine-upgrade-renamed', rev: revision, by, files: paths.length });
    return { revision, paths };
  }
}
