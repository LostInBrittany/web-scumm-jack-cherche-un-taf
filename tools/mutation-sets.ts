// The mutation sets (4.1.8): which sources a set mutates, and which tests judge its mutants. One place, read by
// `tools/mutate.ts` (the mutants, the report, the input hash) and by `vitest.mutation.config.ts` (the tests that run
// against each mutant), so the two cannot drift apart.
export const SETS = {
  core: [
    'src/engine/core/cond.ts',
    'src/engine/core/save.ts',
    'src/engine/core/session-runtime.ts',
    'src/engine/core/migrate.ts',
  ],
  reality: [
    'src/engine/core/reality-runtime.ts',
    'src/engine/reality/protocol.ts',
    'src/engine/reality/client.ts',
    'src/engine/reality/http-port.ts',
    'bridge/src/bridge.ts',
    'bridge/src/store.ts',
    'bridge/src/lock.ts',
    'bridge/src/policy.ts',
  ],
  // The connectors' pure parts (4.1.9): a set of its own, so the Reality set does not double in time. Gated since
  // 4.1.18 (D32): its 204 survivors read one by one (tests/connectors-*-mutants.test.ts, or named). Named for what it
  // holds since 4.1.19 (plan §8.1: `connectors` said more than these six files): the SDK, the MIME reader, the line
  // editor, the virtual disk, the badge's crypto and its fetch. `connectors` stays an alias until 4.2.
  'connectors-pure': [
    'connectors/src/sdk.ts',
    'connectors/src/email/mime.ts',
    'connectors/src/terminal/line.ts',
    'connectors/src/terminal/vfs.ts',
    'connectors/src/badges/crypto.ts',
    'connectors/src/badges/fetch.ts',
  ],
  // Remix and Time Attack's contracts (4.1.16, plan §10): a world's seed and its normalisation, its hash, compilation
  // and application, its constraints, a category's world and its leaderboard key, the Daily and Mystery tokens.
  remix: [
    'src/engine/core/remix/seed-code.ts',
    'src/engine/core/remix/compile.ts',
    'src/engine/core/remix/apply.ts',
    'src/engine/core/remix/categories.ts',
    'src/engine/reality/daily.ts',
  ],
  // A run's envelope and `h0`, the recorder and its resume, the verifier (4.1.16).
  speedrun: [
    'src/engine/tools/speedrun/envelope.ts',
    'src/engine/tools/speedrun/recorder.ts',
    'src/engine/tools/speedrun/verify.ts',
  ],
  // The speedrun queue (4.1.17, plan §7): admission, quota, leaderboard ranking. Gated from the start: the bugs 4.1.17
  // fixed there (a board cut before ranking, a count then a write, a quota per process) were in no set.
  runs: ['bridge/src/runs.ts', 'bridge/src/runs-store.ts', 'bridge/src/runs-limiter.ts'],
  // Voices by value and the solver's verdicts (4.3.1): the keys a line's clips go by in each language, the recording
  // table, the validator's check, and the one sentence each status says. 4.3.1 fixed two bugs there that no set held.
  voices: [
    'src/engine/core/voice-key.ts',
    'src/engine/tools/voices.ts',
    'src/engine/tools/validate/voices.ts',
    'src/engine/tools/status.ts',
  ],
  // The Bridge's stores and its fan-out (4.1.10, ADR 0009): measured until 4.1.18, gated since (D32): its 118
  // survivors read one by one, each killed by a short test (tests/reality-store-*-mutants.test.ts) or named.
  'reality-store': [
    'bridge/src/store-memory.ts',
    'bridge/src/store-sql.ts',
    'bridge/src/store-sqlite.ts',
    'bridge/src/migrations.ts',
    'bridge/src/streams.ts',
    'bridge/src/sign.ts',
    // The backup and the restore (4.1.20 PR 1b, plan §6.0): in no set until then.
    'bridge/src/backup/canonical.ts',
    'bridge/src/backup/files.ts',
    'bridge/src/backup/restore.ts',
    'bridge/src/backup/schema.ts',
    'bridge/src/backup/snapshot.ts',
    'bridge/src/backup/tables.ts',
    // The maintenance leases (4.1.20 PR 1c).
    'bridge/src/maintenance.ts',
  ],
  // What `connectors-pure` leaves out (4.1.19, plan §8.1) — configuration and start, the email connector (webhook and
  // IMAP), the badge's verification, the terminal's guard and shell, SSH and Telnet. Gated since 4.1.20 (PR 2b–2e),
  // every survivor killed or named, in four shards.
  'connectors-edge': [
    'connectors/src/config.ts',
    'connectors/src/run.ts',
    'connectors/src/http.ts',
    'connectors/src/registry.ts',
    'connectors/src/email/connector.ts',
    'connectors/src/email/imap.ts',
    'connectors/src/email/parse.ts',
    'connectors/src/badges/verify.ts',
    'connectors/src/badges/connector.ts',
    'connectors/src/terminal/guard.ts',
    'connectors/src/terminal/shell.ts',
    'connectors/src/ssh/connector.ts',
    'connectors/src/telnet/connector.ts',
  ],
  // The Postgres adapter (4.1.19), which `reality-store` does not mutate (it mutates what the adapter rests on,
  // store-sql.ts). Gated since 4.1.20 (PR 2a). Its tests need a database: BRIDGE_PG_URL (the mutation workflow gives
  // one).
  'reality-store-postgres': ['bridge/src/store-postgres.ts'],
  // The Studio Server (4.2.1, plan §11): the journal that loses no confirmed change, and the trust boundaries (who is
  // who, who may write which span, who reaches the game's origin). Measured until their survivors are read.
  'studio-ops': [
    'studio-server/src/ops/journal.ts',
    'studio-server/src/ops/durable.ts',
    'studio-server/src/ops/spans.ts',
  ],
  'studio-auth': [
    'studio-server/src/server/auth/gate.ts',
    'studio-server/src/server/auth/oidc.ts',
    'studio-server/src/server/auth/routes.ts',
    'studio-server/src/server/auth/store.ts',
    'studio-server/src/server/leases.ts',
    'studio-server/src/server/play.ts',
  ],
  // The playable workshop (4.2.2, plan §2.8): the personal undo, the health by revision and its bisection, the previews
  // by revision, the published builds and their signed manifests, the prepared assets, the backup, the journal shipped
  // and the collection. Gated since 4.2.3 (PR 10): its survivors read one by one.
  'studio-workshop': [
    'studio-server/src/ops/undo.ts',
    'studio-server/src/ops/backup.ts',
    'studio-server/src/ops/ship.ts',
    'studio-server/src/ops/gc.ts',
    'studio-server/src/server/health.ts',
    'studio-server/src/server/previews.ts',
    'studio-server/src/server/builds.ts',
    'studio-server/src/server/prepared.ts',
  ],
};
export type MutationSet = keyof typeof SETS;
/** The tests a set's mutants are judged by (vitest `include` globs). */
export const TESTS: Record<MutationSet, string[]> = {
  core: [
    'tests/core.test.ts',
    'tests/core-runtime.test.ts',
    'tests/save-v3.test.ts',
    'tests/save-store.test.ts',
    'tests/stable-ids.test.ts',
    'tests/content-ids.test.ts',
    'tests/replay.test.ts',
    'tests/properties.test.ts',
    'tests/cmds.test.ts',
    'tests/critical-*.test.ts',
    'tests/engine-honesty.test.ts',
    'tests/scheduler.test.ts',
  ],
  reality: ['tests/reality-*.test.ts', 'tests/bridge*.test.ts'],
  // Short unit tests only: the load tools and the Postgres races are integration tests, never under each mutant.
  runs: [
    'tests/bridge-runs.test.ts',
    'tests/bridge-runs-queue.test.ts',
    'tests/bridge-runs-worker.test.ts',
    'tests/bridge-runs-http.test.ts',
    'tests/bridge-runs-store.test.ts',
    'tests/bridge-runs-durable.test.ts',
    'tests/bridge-leaderboard.test.ts',
    'tests/bridge-admission.test.ts',
  ],
  'connectors-pure': ['tests/connectors-*.test.ts'],
  'connectors-edge': ['tests/connectors-*.test.ts'],
  // Every test that runs the Postgres adapter when BRIDGE_PG_URL names a database.
  'reality-store-postgres': [
    'tests/bridge-reality-store.test.ts',
    'tests/bridge-backup.test.ts',
    'tests/bridge-fanout.test.ts',
    'tests/bridge-tenancy.test.ts',
    'tests/bridge-hardening.test.ts',
    'tests/bridge-admission.test.ts',
    'tests/bridge-runs-durable.test.ts',
    'tests/bridge-leaderboard.test.ts',
    'tests/reality-store-postgres-mutants.test.ts',
    'tests/bridge-backup-v4.test.ts',
    'tests/bridge-maintenance.test.ts',
    'tests/reality-store-maintenance-mutants.test.ts',
  ],
  'reality-store': [
    'tests/bridge-reality-store.test.ts',
    'tests/bridge-fanout.test.ts',
    'tests/bridge.test.ts',
    'tests/reality-store-sql-mutants.test.ts',
    'tests/reality-store-sqlite-mutants.test.ts',
    'tests/reality-store-memory-mutants.test.ts',
    'tests/bridge-backup.test.ts',
    'tests/bridge-backup-v4.test.ts',
    'tests/bridge-backup-characterization.test.ts',
    'tests/bridge-ops.test.ts',
    'tests/reality-store-backup-mutants.test.ts',
    'tests/bridge-maintenance.test.ts',
    'tests/reality-store-maintenance-mutants.test.ts',
  ],
  remix: [
    'tests/remix-*.test.ts',
    'tests/speedrun-remix.test.ts',
    'tests/speedrun-daily.test.ts',
    'tests/code-wheel.test.ts',
  ],
  speedrun: ['tests/speedrun-*.test.ts', 'tests/critical-minigame-outcome.test.ts'],
  voices: [
    'tests/voice-key.test.ts',
    'tests/voices.test.ts',
    'tests/voice-locale.test.ts',
    'tests/voices-mutants.test.ts',
    'tests/hero-choice.test.ts',
    'tests/status.test.ts',
  ],
  // studio-server.test.ts's local part opens journals and migrates too: durable.ts's writes are judged there as well.
  'studio-ops': [
    'tests/studio-journal*.test.ts',
    'tests/studio-durable-mutants.test.ts',
    'tests/studio-spans-mutants.test.ts',
    'tests/studio-server.test.ts',
    'tests/studio-collab.test.ts',
  ],
  'studio-auth': [
    'tests/studio-gate-mutants.test.ts',
    'tests/studio-store-mutants.test.ts',
    'tests/studio-routes-mutants.test.ts',
    'tests/studio-oidc-mutants.test.ts',
    'tests/studio-leases-mutants.test.ts',
    'tests/studio-exclusive-mutants.test.ts',
    'tests/studio-play-mutants.test.ts',
    'tests/studio-auth.test.ts',
    'tests/studio-collab.test.ts',
    'tests/studio-play.test.ts',
  ],
  'studio-workshop': [
    'tests/studio-undo.test.ts',
    'tests/studio-health.test.ts',
    'tests/studio-previews.test.ts',
    'tests/studio-builds.test.ts',
    'tests/studio-prepared.test.ts',
    'tests/studio-backup.test.ts',
    // The previews' serving (a range, a 416, what is never served) is tested there, against a real template build.
    'tests/studio-client.test.ts',
    // 4.2.3 PR 10: the survivors' short tests.
    'tests/studio-workshop-backup-mutants.test.ts',
    'tests/studio-workshop-health-mutants.test.ts',
    'tests/studio-workshop-previews-mutants.test.ts',
    'tests/studio-workshop-prepared-mutants.test.ts',
  ],
};

/** The sets `all` runs and the gate judges: every set, each a job of its own in ci, the nightly, the candidate and the release. */
// `remix` and `speedrun` (4.1.16, measured) joined in 4.1.17; `connectors` and `reality-store` in 4.1.18 (D32, plan
// §6): their survivors read one by one, each killed by a test or named in docs/dev/mutants.json.
export const GATED: MutationSet[] = [
  'core',
  'reality',
  'runs',
  'remix',
  'speedrun',
  'connectors-pure',
  'reality-store',
  // 4.1.20 PR 2a: its 41 mutants read on a real Postgres, 40 killed (tests/reality-store-postgres-mutants.test.ts), one
  // named; every job that mutates it has a Postgres service.
  'reality-store-postgres',
  // 4.1.20 PR 2b–2e: its 488 survivors read family by family (badges, email, terminal, the rest): 473 killed by
  // tests/connectors-*-edge-mutants.test.ts, 15 named (docs/dev/mutants.json). Run in 4 shards.
  'connectors-edge',
  // 4.2.1: its survivors read (168 of 181 killed, 13 named in docs/dev/mutants.json), its tests
  // tests/studio-journal-mutants and tests/studio-durable-mutants.
  'studio-ops',
  // 4.2.1: its survivors read (564 of 577 killed, 13 named in docs/dev/mutants.json), its unit tests
  // tests/studio-{gate,store,routes,oidc,leases,play}-mutants.
  'studio-auth',
  // 4.2.3 PR 10: its 104 survivors read (94 killed by tests/studio-workshop-{backup,health,previews,prepared}-mutants,
  // 10 named in docs/dev/mutants.json).
  'studio-workshop',
  // 4.3.1: gated from the start, its survivors read before it joined (186 of 193 killed, 7 named in
  // docs/dev/mutants.json, each read again in a second context, which found one a bug: a `*=`-only line's sheet text).
  'voices',
];
/** Measured on demand (`gh workflow run mutation -f set=…`) and every night, gating nothing until their survivors are read. */
// Empty in 4.1.20 (plan §7.5): every set was gated; a set added later is measured here until its survivors are read.
// Empty again since 4.2.1: the Studio Server's two sets are gated. 4.2.2's workshop was measured here until 4.2.3
// (PR 10) read its survivors.
export const MEASURED: MutationSet[] = [];

/**
 * The shards a set's mutation runs in (4.1.20 PR 2a, plan §7.3), one job each, merged into the set's report. A set not
 * named here is one shard. `connectors-edge` ran 2 h 02 in one job; `reality` was the candidate's longest (79 min).
 */
export const SHARDS: Partial<Record<MutationSet, number>> = { 'connectors-edge': 4, reality: 2, 'reality-store': 2 };

/** The sets whose test files run one after the other: their tests share a real Postgres server (4.1.20 PR 2a). */
export const SERIAL: (MutationSet | 'all')[] = ['reality-store-postgres'];

/** Old names still taken (4.1.19): `connectors` is `connectors-pure` until 4.2. */
export const ALIASES: Record<string, MutationSet> = { connectors: 'connectors-pure' };

/** A set's name as given on a command line, its alias resolved; throws on a name that is no set. */
export function setNamed(name: string): MutationSet | 'all' {
  if (name === 'all' || name in SETS) return name as MutationSet | 'all';
  const alias = ALIASES[name];
  if (alias) return alias;
  throw new Error(`no mutation set "${name}": ${[...Object.keys(SETS), ...Object.keys(ALIASES)].join(', ')}`);
}

export const setsOf = (set: MutationSet | 'all'): MutationSet[] => (set === 'all' ? GATED : [set]);

// `npx tsx tools/mutation-sets.ts --tests=<set>` prints the test files that judge a set, one per line (4.1.20 PR 2a):
// CI's `bridge-postgres` job runs exactly the files of `reality-store-postgres` from here, never a list of its own.
if (process.argv[1]?.endsWith('mutation-sets.ts')) {
  const name = process.argv.find((a) => a.startsWith('--tests='))?.slice('--tests='.length);
  if (!name) {
    console.error('usage: tsx tools/mutation-sets.ts --tests=<set>');
    process.exit(2);
  }
  try {
    console.log(
      setsOf(setNamed(name))
        .flatMap((k) => TESTS[k])
        .join('\n'),
    );
  } catch (e) {
    console.error(`✖  ${(e as Error).message}`);
    process.exit(2);
  }
}
