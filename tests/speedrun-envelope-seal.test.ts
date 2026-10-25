// How a run is sealed (4.1.17, the `speedrun` mutation set): the head hashes the world's proof (another proof, another
// head), the chain cuts its links into chunks of CHUNK_SIZE with no empty one, and an envelope writes `loads`,
// `realitySignals` and `inputsUsed` only when it has some — the same run is the same bytes.
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '@engine/core/journal-chunks';
import type { TapeLink } from '@engine/core/run-tape';
import { chainChunks, exportEnvelope, headHash } from '@engine/tools/speedrun/envelope';
import { ROUTE } from './fixtures/speedrun-game';
import { playRun } from './fixtures/speedrun-run';

describe('the head', () => {
  it("hashes the world's proof: another proof, another head; none is not an empty one", async () => {
    const { envelope, fingerprint } = await playRun();
    const category = { id: 'any%', fingerprint: ['logic' as const] };
    const world = (evidence?: unknown) => ({
      variant: envelope.schema === 2 ? envelope.variant : (null as never),
      policy: { policy: 'daily' as const, mode: 'daily' },
      ...(evidence ? { evidence: evidence as never } : {}),
    });
    const h = (evidence?: unknown) =>
      headHash({ fingerprint, category, rulesVersion: 1, seed: 's', world: world(evidence) });
    const a = await h({ kind: 'daily', token: 'a.b.c' });
    expect(await h({ kind: 'daily', token: 'a.b.d' })).not.toBe(a);
    expect(await h()).not.toBe(a);
    expect(await h({ kind: 'daily', token: 'a.b.c' })).toBe(a);
  });
});

describe('the chain', () => {
  const link = (index: number): TapeLink => ({
    index,
    entry: { act: { verb: 'look', a: 'x' } } as never,
    events: [],
    logicalSteps: String(index),
    logicalTime: String(index),
    activeTime: String(index),
  });
  it('cuts its links in chunks of CHUNK_SIZE, never an empty one', async () => {
    expect((await chainChunks('h0', [])).chunks).toEqual([]);
    const full = Array.from({ length: CHUNK_SIZE }, (_, i) => link(i));
    expect((await chainChunks('h0', full)).chunks.map((c) => c.entries.length)).toEqual([CHUNK_SIZE]);
    const more = [...full, link(CHUNK_SIZE)];
    const c = (await chainChunks('h0', more)).chunks;
    expect(c.map((x) => x.entries.length)).toEqual([CHUNK_SIZE, 1]);
    expect(c[1]!.prevHash).toBe(c[0]!.hash);
  });
});

describe('the envelope', () => {
  it('writes loads, signals and inputs only when it has some', async () => {
    const { envelope } = await playRun();
    const text = exportEnvelope(envelope);
    for (const k of ['"loads"', '"realitySignals"', '"inputsUsed"']) expect(text).not.toContain(k);
    const loaded = await playRun('any%', [ROUTE[0]!, { load: 'last-save' }, ...ROUTE]);
    expect(exportEnvelope(loaded.envelope)).toContain('"loads"');
  });

  it('a run without a world proof has no worldEvidence key, in memory as in its file (4.5.0)', async () => {
    // Kills envelope.ts sealEnvelope's `o.world.evidence ?` → `true`: the envelope a `sealed` listener and the
    // speedrun UI hold would carry an own `worldEvidence: undefined` the file drops.
    const { envelope } = await playRun();
    expect(Object.keys(envelope)).not.toContain('worldEvidence');
    expect(exportEnvelope(envelope)).not.toContain('"worldEvidence"');
  });

  it('lists the inputs a run used, and a recorder without an engine needs its world given', async () => {
    const { Engine } = await import('@engine/core/engine');
    const { FakePresenter, MemoryStore } = await import('@engine/core/ports');
    const { MemoryChunkStore } = await import('@engine/core/journal-chunks');
    const { SpeedrunRecorder } = await import('@engine/tools/speedrun/recorder');
    const { speedrunGame, speedrunLayouts } = await import('./fixtures/speedrun-game');
    const { fixtureFingerprint, ENGINE_VERSION } = await import('./fixtures/speedrun-run');
    const game = speedrunGame();
    const opts = async (engine: unknown) => ({
      engine: engine as never,
      gameId: game.id,
      manifest: game.speedrun!,
      category: game.speedrun!.categories.find((c) => c.id === 'any%')!,
      store: new MemoryChunkStore(),
      fingerprint: await fixtureFingerprint(game),
      engineVersion: ENGINE_VERSION,
      now: () => 0,
    });
    const engine = new Engine(game, speedrunLayouts, new FakePresenter(), new MemoryStore());
    const rec = new SpeedrunRecorder(await opts(engine));
    await rec.start();
    rec.input('keyboard');
    rec.input('mouse');
    for (const a of ROUTE) await engine.act({ ...a });
    expect([...(await rec.seal()).inputsUsed!].sort()).toEqual(['keyboard', 'mouse']);
    const bare = new SpeedrunRecorder(await opts(null));
    await expect(bare.prepare()).rejects.toThrow(/without an engine is given the world/);
  });
});
