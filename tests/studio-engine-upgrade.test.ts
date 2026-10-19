// The engine's upgrade of a hosted game (4.2.3 PR 8, H6), on a game in the format of a 4.1.x
// (tests/fixtures/game-4.1: schema 2, no stable ids). A game that migrates becomes one revision of the journal and its
// health stays green; a game the migration would break is refused before anything is written, the head intact; the
// migration is taken back by the owner's personal undo, or by restoring a backup taken before, to the head and the
// health of before. The migration and the judge run in the worker's child (localMigrate, localValidate, localDiagnose)
// as on the processing worker; the refusals the solver alone would give are tested with an injected judge.
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate as migrateDb } from '../bridge/src/migrations';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { backupOf, checkBackup, restoreInto } from '../studio-server/src/ops/backup';
import { type BlobStore, fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild, operationContext } from '../studio-server/src/ops/core';
import { HOSTED_SOLVE_MS } from '../studio-server/src/ops/diagnose';
import { StudioError } from '../studio-server/src/ops/errors';
import { Journal } from '../studio-server/src/ops/journal';
import { finishRestore } from '../studio-server/src/ops/ship';
import { spansOf } from '../studio-server/src/ops/spans';
import { PersonalUndo } from '../studio-server/src/ops/undo';
import { Gate } from '../studio-server/src/server/auth/gate';
import { EngineUpgrade } from '../studio-server/src/server/engine-upgrade';
import { judgeBy, type Verdict } from '../studio-server/src/server/health';
import { studioServer } from '../studio-server/src/server/http';
import { exclusiveRunner, Leases } from '../studio-server/src/server/leases';
import { remoteExecutor } from '../studio-server/src/server/remote-executor';
import { newJobKeys } from '../studio-server/src/worker/job';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { localDiagnose, localMigrate, localValidate } from '../studio-server/src/worker/local';
import { migratedShape } from '../studio-server/src/worker/migrate';
import { addSchema3ToGameSource } from '../tools/ids/codemod';
import { overlaySnapshot, packSnapshot, snapshotTexts } from '../studio-server/src/worker/snapshot';
import type { SolveData } from '../tools/studio/types';

const ROOT = join(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'game-4.1');
const MIGRATIONS = new URL('../studio-server/migrations/', import.meta.url);
let tmp: string;
const opened: { close: () => Promise<unknown> }[] = [];

beforeAll(() => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-engine-upgrade-'));
});
afterAll(async () => {
  // Everything opened is closed before the folder goes: Windows deletes no open file.
  for (const o of opened.reverse()) await o.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

/** The worker's judge, as the health and the upgrade use it: the validator, then the solver from a new game. */
const judge = judgeBy({
  validate: (bytes) => localValidate(bytes),
  solve: (bytes) =>
    localDiagnose('solve', bytes, {
      from: null,
      maxStates: 20_000,
      mode: 'witness',
      timeLimitMs: HOSTED_SOLVE_MS,
    }) as Promise<SolveData>,
});

/** A hosted project made of a copy of the fixture, the owner's personal undo, the leases, an upgrade. */
async function project(name: string, o: { judge?: typeof judge; edit?: (dir: string) => void } = {}) {
  const game = join(tmp, name);
  cpSync(FIXTURE, game, { recursive: true });
  o.edit?.(game);
  const db = await openSqliteDb(join(tmp, `${name}.sqlite`));
  await migrateDb(db, { dir: MIGRATIONS });
  const blobs: BlobStore = fsBlobStore(join(tmp, `${name}-blobs`));
  const leases = new Leases(db);
  const journal = await Journal.open({
    db,
    blobs,
    gameDir: game,
    hosted: true,
    claim: async (q, paths) => {
      const c = operationContext.getStore()?.claimant;
      if (!c) throw new StudioError('a write on a shared Studio says who writes', 500);
      await leases.claimPaths(q, c, paths);
    },
    precheck: async (paths) => {
      const c = operationContext.getStore()?.claimant;
      if (c) await leases.check(c, spansOf(paths));
    },
  });
  opened.push(db, journal);
  const personalUndo = new PersonalUndo(db, () => journal.epoch());
  const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, personalUndo });
  const log: string[] = [];
  const up = new EngineUpgrade({
    snapshot: async () => ({ epoch: await journal.epoch(), rev: await journal.revision(), bytes: packSnapshot(game) }),
    migrate: (bytes) => localMigrate(bytes),
    judge: o.judge ?? judge,
    write: async (what, files) => {
      await studio.writeFiles(what, files);
      return journal.revision();
    },
    exclusive: async (fn) => {
      const who = operationContext.getStore()!.claimant!;
      await leases.take(who, ['*']);
      log.push('take *');
      try {
        return await fn();
      } finally {
        await leases.release(who.userId, ['*']);
        log.push('release *');
      }
    },
  });
  const as = <T>(u: string, fn: () => Promise<T>) =>
    operationContext.run({ author: u, claimant: { userId: u, name: u } }, fn);
  const files = () => Object.fromEntries(snapshotTexts(packSnapshot(game)));
  const head = async () =>
    (await db.all("SELECT path, blob FROM studio_files WHERE blob <> 'absent' ORDER BY path")).map(
      (r) => `${r.path}=${r.blob}`,
    );
  return { game, db, blobs, journal, studio, leases, up, as, log, files, head };
}

describe("the engine's upgrade of a game in the format of a 4.1.x", () => {
  it('migrates it as one revision under the exclusive lease, its health green; a second run has nothing to do', async () => {
    const p = await project('ok');
    const before = p.files();
    const health = await judge(packSnapshot(p.game), { epoch: '', rev: 0 });
    expect(health).toMatchObject({ ok: true, errors: [] });
    const rev = await p.journal.revision();
    const r = await p.as('owner', () => p.up.migrate('owner'));
    expect(r).toMatchObject({
      revision: rev + 1,
      paths: ['game.ts', 'ids.migration.json', 'ids.paths.json', 'rooms/start.ts'],
      schema: { from: 2, to: 3 },
    });
    expect(r.changed).toBe(4);
    expect(await p.journal.revision()).toBe(rev + 1);
    expect(p.log).toEqual(['take *', 'release *']);
    expect((await p.journal.opAt(rev + 1))?.paths.sort()).toEqual([
      'game.ts',
      'ids.migration.json',
      'ids.paths.json',
      'rooms/start.ts',
    ]);
    const gameTs = readFileSync(join(p.game, 'game.ts'), 'utf8');
    expect(gameTs).toContain('schemaVersion: 3');
    expect(gameTs).toContain('saveVersion: 2');
    expect(gameTs).toContain('migrations: [idsMigration]');
    expect(gameTs).toContain("import idsMigration from './ids.migration.json';");
    expect(readFileSync(join(p.game, 'rooms', 'start.ts'), 'utf8')).toContain("id: 'start.");
    expect(JSON.parse(readFileSync(join(p.game, 'ids.migration.json'), 'utf8'))).toMatchObject({ from: 1 });
    // The head's health after it: green, the validator (schema 3: every id there) and the solver both pass.
    expect(await judge(packSnapshot(p.game), { epoch: '', rev: rev + 1 })).toMatchObject({ ok: true, errors: [] });
    expect(await p.as('owner', () => p.up.migrate('owner'))).toEqual({ changed: 0, schema: { from: 3, to: 3 } });
    expect(await p.journal.revision()).toBe(rev + 1);
    // Taken back by the owner's personal undo: the head of before (one more revision, the history kept), its health.
    expect(await p.as('owner', () => p.studio.undo())).toMatchObject({
      ok: true,
      what: expect.stringMatching(/engine upgrade/),
    });
    expect(p.files()).toEqual(before);
    expect(existsSync(join(p.game, 'ids.migration.json'))).toBe(false);
    expect(await judge(packSnapshot(p.game), { epoch: '', rev: rev + 2 })).toEqual({
      ...health,
      ms: expect.any(Number),
    });
  }, 120_000);

  it('refuses a game the migration would break, before anything is written: the head intact', async () => {
    // A 4.1.x game whose rules are built by code: the tool cannot write their ids, and schema 3 needs them.
    const p = await project('spread', {
      edit: (dir) => {
        const f = join(dir, 'rooms', 'start.ts');
        const code = readFileSync(f, 'utf8');
        writeFileSync(
          f,
          code
            .replace(
              'export default defineRoom({',
              'const gate = [\n  { verb: "use", a: "gate", do: ["A gate."] },\n];\n\nexport default defineRoom({',
            )
            .replace('  on: [\n', '  on: [\n    ...gate,\n'),
        );
      },
    });
    const before = await p.head();
    const rev = await p.journal.revision();
    const e = await p.as('owner', () => p.up.migrate('owner')).catch((x: unknown) => x);
    expect(e).toMatchObject({
      status: 422,
      message: expect.stringMatching(/would break the game.*nothing was written/),
    });
    expect((e as { body: { skipped: string[]; errors: string[] } }).body.skipped.join('\n')).toMatch(/spread/);
    expect((e as { body: { errors: string[] } }).body.errors.join('\n')).toMatch(/id/);
    expect(await p.journal.revision()).toBe(rev);
    expect(await p.head()).toEqual(before);
    expect(readFileSync(join(p.game, 'game.ts'), 'utf8')).not.toContain('schemaVersion: 3');
    // The lease is given back: the others write again.
    expect(p.log).toEqual(['take *', 'release *']);
    expect(await p.leases.list()).toEqual([]);
  }, 120_000);

  it('refuses when the solver fails the migrated game, or cannot judge it, and runs one at a time', async () => {
    let verdict: Verdict = { ok: false, errors: ['the game cannot be finished'], warnings: [], ms: 1 };
    const seen: string[] = [];
    const p = await project('solver', {
      judge: async (bytes) => {
        seen.push(snapshotTexts(bytes).get('game.ts')!.includes('schemaVersion: 3') ? 'migrated' : 'head');
        return verdict;
      },
    });
    const before = await p.head();
    const rev = await p.journal.revision();
    await expect(p.as('owner', () => p.up.migrate('owner'))).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/cannot be finished/),
    });
    verdict = { ok: true, errors: [], warnings: [], ms: 1, unknown: 'the solver was cut short (20000 states)' };
    await expect(p.as('owner', () => p.up.migrate('owner'))).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/cannot be judged.*cut short/),
    });
    // The judge saw the migrated game, never the head; nothing was written.
    expect(seen).toEqual(['migrated', 'migrated']);
    expect(await p.journal.revision()).toBe(rev);
    expect(await p.head()).toEqual(before);
    verdict = { ok: true, errors: [], warnings: [], ms: 1 };
    const first = p.as('owner', () => p.up.migrate('owner'));
    await expect(p.as('owner', () => p.up.migrate('owner'))).rejects.toMatchObject({ status: 429 });
    expect(await first).toMatchObject({ revision: rev + 1 });
  }, 120_000);

  it('is taken back by restoring a backup taken before: the head and the health of before', async () => {
    const p = await project('backup');
    const health = await judge(packSnapshot(p.game), { epoch: '', rev: 0 });
    const backup = checkBackup(JSON.parse(JSON.stringify(await backupOf(p.db))));
    const before = await p.head();
    await p.as('owner', () => p.up.migrate('owner'));
    expect(await p.head()).not.toEqual(before);
    const fresh = await openSqliteDb(join(tmp, 'restored.sqlite'));
    opened.push(fresh);
    await migrateDb(fresh, { dir: MIGRATIONS });
    await restoreInto(fresh, p.blobs, backup);
    await finishRestore(fresh);
    const game = join(tmp, 'restored');
    mkdirSync(game);
    const j = await Journal.open({ db: fresh, blobs: p.blobs, gameDir: game, hosted: true });
    opened.push(j);
    expect(await j.revision()).toBe(backup.revision);
    expect(
      (await fresh.all("SELECT path, blob FROM studio_files WHERE blob <> 'absent' ORDER BY path")).map(
        (r) => `${r.path}=${r.blob}`,
      ),
    ).toEqual(before);
    expect(readFileSync(join(game, 'game.ts'), 'utf8')).toBe(readFileSync(join(FIXTURE, 'game.ts'), 'utf8'));
    expect(await judge(packSnapshot(game), { epoch: '', rev: 0 })).toEqual({ ...health, ms: expect.any(Number) });
  }, 120_000);
});

describe("the worker's migrate", () => {
  it('refuses a game whose defineGame is not in game.ts', async () => {
    const dir = join(tmp, 'elsewhere');
    cpSync(FIXTURE, dir, { recursive: true });
    cpSync(join(dir, 'game.ts'), join(dir, 'definition.ts'));
    writeFileSync(join(dir, 'game.ts'), "export { game } from './definition';\n");
    await expect(localMigrate(packSnapshot(dir))).rejects.toThrow(/defineGame\(\{\.\.\.\}\) is not in game\.ts/);
  }, 60_000);

  it('finds nothing to do on a game at schema 3', async () => {
    const m = await localMigrate(packSnapshot(join(ROOT, 'games', '_template')));
    expect(m).toEqual({ schema: { from: 3, to: 3 }, files: {}, skipped: [] });
  }, 60_000);

  it("bounds an answer to the migration's files, those the game has (the game's code shapes it)", () => {
    const has = new Set(['rooms/a.ts', 'game.ts', 'rules.ts', 'items.ts', 'locales/fr.json', 'cast.ts', 'index.ts']);
    const files = {
      'rooms/a.ts': 'x',
      'game.ts': 'g',
      'rules.ts': 'r',
      'items.ts': 'i',
      'locales/fr.json': '{}',
      'ids.paths.json': '{}',
      'ids.migration.json': '{}',
    };
    const ok = { schema: { from: 2, to: 3 }, files };
    expect(migratedShape(ok, has)).toEqual({ ...ok, skipped: [] });
    const at = (f: Record<string, unknown>) => ({ schema: { from: 2, to: 3 }, files: f });
    for (const bad of [
      null,
      { files: {} },
      at([] as never),
      at({ '../x.ts': '' }),
      at({ 'rooms/../x.ts': '' }),
      at({ '.env.json': '' }),
      at({ 'tests/a.ts': '' }),
      at({ 'art/a.png': '' }),
      // Files of the game the migration never writes, even though the game has them.
      at({ 'cast.ts': '' }),
      at({ 'index.ts': '' }),
      at({ 'rooms/sub/a.ts': '' }),
      at({ 'package.json': '' }),
      // A file the migration would write, but that the game does not have.
      at({ 'rooms/b.ts': '' }),
      at({ 'locales/de.json': '{}' }),
      at({ 'game.ts': 3 }),
      at({ 'game.ts': 'x'.repeat(9 * 1024 * 1024) }),
    ])
      expect(migratedShape(bad, has), JSON.stringify(bad).slice(0, 80)).toHaveProperty('refused');
  });

  it("writes game.ts's three lines UPGRADING leaves to the author, or says what it cannot", () => {
    const src = (body: string) =>
      `import { defineGame } from 'web-scumm/content';\n\nexport const game = defineGame({\n${body}\n});\n`;
    const a = addSchema3ToGameSource(src("  id: 'g',\n  saveVersion: 4,"), 4);
    expect(a.skipped).toEqual([]);
    expect(a.code).toBe(
      "import { defineGame } from 'web-scumm/content';\nimport idsMigration from './ids.migration.json';\n\nexport const game = defineGame({\n  schemaVersion: 3,\n  migrations: [idsMigration],\n  id: 'g',\n  saveVersion: 5,\n});\n",
    );
    const b = addSchema3ToGameSource(src('  schemaVersion: 2,\n  saveVersion: 1,\n  migrations: [m1],'), 1);
    expect(b.code).toContain('schemaVersion: 3,\n  saveVersion: 2,\n  migrations: [m1, idsMigration],');
    expect(addSchema3ToGameSource(src('  saveVersion: 1,\n  migrations: [],'), 1).code).toContain(
      'migrations: [idsMigration]',
    );
    expect(addSchema3ToGameSource(src('  saveVersion: 1,\n  migrations: steps,'), 1).code).toContain(
      'migrations: [...steps, idsMigration]',
    );
    // One of the three cannot be written: none is, each is said, and a second run cannot append the step twice.
    const c = addSchema3ToGameSource(src('  saveVersion: V + 1,'), 3);
    expect(c.code).toBe(src('  saveVersion: V + 1,'));
    expect(c.skipped.map((x) => x.path).sort()).toEqual(['migrations', 'saveVersion', 'schemaVersion']);
    expect(c.skipped).toContainEqual(expect.objectContaining({ path: 'saveVersion', expected: '4' }));
    const d = src('  saveVersion: 1,\n  migrations: [m1],\n  schemaVersion,');
    expect(addSchema3ToGameSource(d, 1)).toMatchObject({ code: d, inserted: [] });
    expect(addSchema3ToGameSource('export const x = 1;\n', 1).skipped).toHaveLength(1);
  });

  it('overlays a snapshot with the migrated files', () => {
    const s = packSnapshot(FIXTURE);
    const o = snapshotTexts(overlaySnapshot(s, { 'game.ts': 'new', 'ids.paths.json': '{}' }));
    expect(o.get('game.ts')).toBe('new');
    expect(o.get('ids.paths.json')).toBe('{}');
    expect(o.get('rooms/start.ts')).toBe(snapshotTexts(s).get('rooms/start.ts'));
  });
});

describe("the owner's exclusive lease around a long operation", () => {
  it("is renewed while it runs, and given back by the last of the same member's operations only", async () => {
    const calls: string[] = [];
    let held = false;
    const leases = {
      list: async () => (held ? [{ span: '*', holder: 'owner' }] : []) as never,
      take: async () => {
        calls.push('take');
        held = true;
        return {};
      },
      renew: async () => (calls.push('renew'), 1),
      release: async () => {
        calls.push('release');
        held = false;
      },
    };
    let who: { userId: string; name: string } | undefined = { userId: 'owner', name: 'owner' };
    const run = exclusiveRunner(leases, () => who, { everyMs: 10 });
    let end1!: () => void, end2!: () => void;
    const one = run(() => new Promise<void>((ok) => (end1 = ok)));
    await new Promise((ok) => setTimeout(ok, 5));
    const two = run(() => new Promise<void>((ok) => (end2 = ok)));
    await new Promise((ok) => setTimeout(ok, 40));
    expect(calls.filter((c) => c === 'renew').length).toBeGreaterThanOrEqual(2);
    end1();
    await one;
    // The first out does not release the lease the second still runs under.
    expect(calls).not.toContain('release');
    end2();
    await two;
    expect(calls.filter((c) => c === 'release')).toEqual(['release']);
    const renewed = calls.length;
    await new Promise((ok) => setTimeout(ok, 30));
    expect(calls.length).toBe(renewed);
    // Held before it began: kept after it ends.
    held = true;
    calls.length = 0;
    await run(async () => undefined);
    expect(calls).toEqual([]);
    expect(held).toBe(true);
    // Nobody asks: the operation alone.
    who = undefined;
    expect(await run(async () => 7)).toBe(7);
  });
});

describe("the Studio's side of the worker's migrate", () => {
  it('answers the migration, or says why not: the game failing, the deadline, an answer refused, no answer', async () => {
    const objects = new Map<string, Buffer>();
    const s3 = {
      put: async (k: string, b: Buffer) => void objects.set(k, b),
      get: async (k: string) => objects.get(k),
      delete: async (k: string) => void objects.delete(k),
      presign: (method: string, k: string) => `mem://${method}/${k}`,
    };
    // A worker that answers each job as the test says, writing its result where the job names it.
    let answer: ((job: { id: string; kind: string }) => Record<string, unknown> | undefined) | 'refuse' = () =>
      undefined;
    const worker = createServer(async (req, res) => {
      let raw = '';
      for await (const c of req) raw += c;
      const token = (JSON.parse(raw) as { token: string }).token;
      const job = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as {
        id: string;
        kind: string;
        dest: string;
      };
      if (answer === 'refuse') {
        res.writeHead(500).end();
        return;
      }
      const r = answer(job);
      if (r)
        objects.set(
          `${job.dest}result.json`,
          Buffer.from(JSON.stringify({ job: job.id, kind: job.kind, ms: 1, ...r })),
        );
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    });
    await new Promise<void>((ok) => worker.listen(0, '127.0.0.1', ok));
    opened.push({ close: async () => void worker.close() });
    const ex = remoteExecutor({
      s3,
      workerUrl: `http://127.0.0.1:${(worker.address() as AddressInfo).port}/`,
      privateKeyPem: newJobKeys().privatePem,
      instance: 'studio-a',
      at: () => ({ epoch: 'e1', rev: 3 }),
    });
    const snap = packSnapshot(FIXTURE);
    const at = { epoch: 'e1', rev: 3 };
    const data = { schema: { from: 2, to: 3 }, files: { 'game.ts': 'migrated', 'ids.paths.json': '{}' }, skipped: [] };
    answer = () => ({ data });
    expect(await ex.migrate(snap, at)).toEqual(data);
    answer = () => ({ failed: 'the game does not load (exit 1)' });
    await expect(ex.migrate(snap, at)).rejects.toMatchObject({
      status: 422,
      message: 'the migration cannot run: the game does not load (exit 1)',
    });
    answer = () => ({ failed: "the game's code did not finish within 60000 ms", timedOut: true });
    await expect(ex.migrate(snap, at)).rejects.toMatchObject({
      status: 504,
      message: expect.stringMatching(/try again/),
    });
    // The game's code shaped the answer: a file the migration never writes is refused, and nothing comes back.
    answer = () => ({ data: { ...data, files: { 'cast.ts': 'export const evil = 1;' } } });
    await expect(ex.migrate(snap, at)).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/the migration is refused: a file the migration may not write: cast\.ts/),
    });
    answer = () => ({ data: { ...data, files: { 'rooms/nowhere.ts': '' } } });
    await expect(ex.migrate(snap, at)).rejects.toMatchObject({ message: expect.stringMatching(/does not have/) });
    answer = () => undefined;
    await expect(ex.migrate(snap, at)).rejects.toThrow(/left no usable result/);
    answer = 'refuse';
    await expect(ex.migrate(snap, at)).rejects.toThrow(/refused the job \(500\)/);
    // Every job's staging is gone, whatever its end.
    expect([...objects.keys()]).toEqual([]);
  });
});

describe('the exclusive lease, its edges', () => {
  const fake = (o: { renew?: () => Promise<number>; take?: () => Promise<never> } = {}) => {
    const calls: string[] = [];
    return {
      calls,
      leases: {
        list: async () => [] as never,
        take: o.take ?? (async () => (calls.push('take'), {})),
        renew: o.renew ?? (async () => (calls.push('renew'), 1)),
        release: async () => void calls.push('release'),
      },
    };
  };
  const owner = () => ({ userId: 'owner', name: 'owner' });
  const tick = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

  it('says a renewal that fails, and goes on; without a log, says nothing', async () => {
    const lines: Record<string, unknown>[] = [];
    let n = 0;
    const f = fake({
      renew: async () => {
        n++;
        throw n === 1 ? new Error('the database is away') : 'a string';
      },
    });
    await exclusiveRunner(f.leases, owner, { everyMs: 5, log: (l) => void lines.push(l) })(() => tick(30));
    expect(lines[0]).toEqual({ event: 'lease-renew-failed', message: 'the database is away' });
    expect(lines[1]).toEqual({ event: 'lease-renew-failed', message: 'a string' });
    expect(f.calls).toEqual(['take', 'release']);
    n = 0;
    await exclusiveRunner(f.leases, owner, { everyMs: 5 })(() => tick(20));
    expect(n).toBeGreaterThan(0);
  });

  it('counts operations that start together, releases once, and once when the take is refused', async () => {
    const f = fake();
    const run = exclusiveRunner(f.leases, owner);
    // Both look for the lease before either is counted: they share one run.
    const [a, b] = await Promise.all([run(async () => 'a'), run(async () => 'b')]);
    expect([a, b]).toEqual(['a', 'b']);
    expect(f.calls.filter((c) => c === 'release')).toEqual(['release']);
    const refused = fake({
      take: async () => {
        throw new StudioError('someone holds a span', 423);
      },
    });
    const r = exclusiveRunner(refused.leases, owner);
    await expect(r(async () => 1)).rejects.toMatchObject({ status: 423 });
    expect(refused.calls).toEqual(['release']);
    // The count was given back: the next run takes it again.
    await expect(r(async () => 1)).rejects.toMatchObject({ status: 423 });
    expect(refused.calls).toEqual(['release', 'release']);
  });
});

describe('the route', () => {
  it("is a hosted Studio's (404 otherwise), an owner's, a POST", async () => {
    const game = join(tmp, 'http-game');
    cpSync(FIXTURE, game, { recursive: true });
    const db = await openSqliteDb(join(tmp, 'http.sqlite'));
    const journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'http-blobs')), gameDir: game });
    const lease = new ServiceLease(db, 30_000, 10_000);
    await lease.tick();
    opened.push(db, journal, { close: () => lease.release() });
    const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, author: 'test' });
    const calls: string[] = [];
    const engineUpgrade = {
      migrate: async (by: string) => {
        calls.push(`${by} ${operationContext.getStore()?.claimant?.userId}`);
        return { changed: 4, revision: 2, schema: { from: 2, to: 3 } };
      },
    };
    // A gate that takes the role from a header: the route's own check is what is tested.
    const gate = {
      authenticate: async (req: { headers: Record<string, string | undefined> }) => ({
        role: req.headers['x-role'],
        user: { id: `u-${req.headers['x-role']}`, name: 'Léa', email: 'lea@example.org' },
      }),
      require: Gate.prototype.require,
      revocations: new EventEmitter(),
    };
    const listen = async (o: object) => {
      const s = studioServer({ studio, journal, db, lease, log: () => {}, ...o });
      await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
      opened.push({ close: async () => void s.close() });
      return `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/engine/migrate`;
    };
    const post = (url: string, role?: string) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(role ? { 'x-role': role } : {}) },
        body: '{}',
      });
    expect((await post(await listen({}))).status).toBe(404);
    const url = await listen({ engineUpgrade, auth: { gate, handle: async () => false } });
    expect((await post(url, 'dev')).status).toBe(403);
    expect((await fetch(url, { headers: { 'x-role': 'owner' } })).status).toBe(404);
    const r = await post(url, 'owner');
    expect(await r.json()).toEqual({ changed: 4, revision: 2, schema: { from: 2, to: 3 } });
    expect(calls).toEqual(['Léa u-owner']);
  }, 60_000);
});
