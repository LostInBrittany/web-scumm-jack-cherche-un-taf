// The verifier's later guards, reached as a forger reaches them (4.1.17, plan §9: the survivors of verify.ts). Most
// checks run after the chain, so an envelope edited by hand stops at `chunk-hash` or `chain`: here each dishonest run
// is recorded with the real recorder (a save where saves are forbidden, a menu, a declared input, a laxer copy of the
// category whose start or finish the approved one does not share, a signal whose proof is missing or is another's),
// or edited only where the check runs before the chain (the seed, the chunks, the loads, the world, the signals). Each
// case names its verdict, its code, and its reason where two branches share a code. A game that cannot make the world
// a run names is the verifier's failure (`inconclusive`), never the player's forgery.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyRoutes } from '../bridge/src/daily';
import { Engine } from '@engine/core/engine';
import { fingerprintGame, type GameFingerprint } from '@engine/core/fingerprint';
import { MemoryChunkStore } from '@engine/core/journal-chunks';
import { FakePresenter, MemoryStore } from '@engine/core/ports';
import { compileGameManifest } from '@engine/core/remix/apply';
import { compileVariant, type WorldVariant } from '@engine/core/remix/compile';
import { encodeSeedCode } from '@engine/core/remix/seed-code';
import { variantHash } from '@engine/core/remix/story';
import type { ExternalEntry, GameDef, MinigameResult, SpeedrunCategory } from '@engine/core/types';
import { b64url, importBridgeKey, signSignal, verifySignal } from '@engine/reality/protocol';
import { exportEnvelope, type SpeedrunEnvelope } from '@engine/tools/speedrun/envelope';
import { SpeedrunRecorder } from '@engine/tools/speedrun/recorder';
import { verifyRun, type VerifyContext } from '@engine/tools/speedrun/verify';
import { game as reference } from '../games/reference/game';
import { signals, signalsLayouts } from './fixtures/signals';
import { ROUTE, speedrunGame, speedrunLayouts } from './fixtures/speedrun-game';
import { ENGINE_VERSION, fixtureFingerprint, playRun, verifyContext } from './fixtures/speedrun-run';

type Env = SpeedrunEnvelope & Record<string, unknown>;
const json = (e: SpeedrunEnvelope) => JSON.parse(exportEnvelope(e)) as Env;
const verdictOf = (r: { verdict: string; code: string }) => [r.verdict, r.code];

/**
 * Records a run of `categoryId` on `game` with the live recorder: `drive` plays it (the recorder at hand to declare a
 * save, an interval, an input). `claimed` is what a forger's recorder says the category is (its own copy, same id).
 */
async function record(
  categoryId: string,
  drive: (engine: Engine, rec: SpeedrunRecorder) => Promise<void>,
  o: {
    game?: GameDef;
    claimed?: Partial<SpeedrunCategory>;
    minigame?: (id: string) => MinigameResult | undefined;
  } = {},
) {
  const game = o.game ?? speedrunGame();
  const fingerprint = await fixtureFingerprint(game);
  const p = new FakePresenter();
  if (o.minigame) {
    const f = o.minigame;
    p.minigame = async (id) => f(id);
  }
  const engine = new Engine(game, speedrunLayouts, p, new MemoryStore());
  const category = { ...game.speedrun!.categories.find((c) => c.id === categoryId)!, ...o.claimed };
  const rec = new SpeedrunRecorder({
    engine,
    gameId: game.id,
    manifest: game.speedrun!,
    category,
    store: new MemoryChunkStore(),
    fingerprint,
    engineVersion: ENGINE_VERSION,
    now: () => 0,
  });
  await rec.start();
  await drive(engine, rec);
  const envelope = await rec.seal();
  return { envelope, verify: (input: unknown = envelope) => verifyRun(input, verifyContext(fingerprint, game)) };
}
const route = async (engine: Engine) => {
  for (const a of ROUTE) await engine.act({ ...a });
};
/** The fixture game with its Any% category changed. */
const withAny = (change: Partial<SpeedrunCategory>): GameDef => {
  const g = speedrunGame();
  g.speedrun = {
    ...g.speedrun!,
    categories: g.speedrun!.categories.map((c) => (c.id === 'any%' ? { ...c, ...change } : c)),
  };
  return g;
};

const base = await playRun();
const ctx = verifyContext(base.fingerprint);
const edited = async (f: (e: Env) => void) => {
  const e = json(base.envelope);
  f(e);
  return verifyRun(e, ctx);
};

describe('the seed a category draws from', () => {
  it('a fixed-seed category refuses a run drawn from another seed, before anything is hashed', async () => {
    const fixed = await playRun('fixed-seed');
    const e = json(fixed.envelope);
    e.runSeed = 'fixed:any%';
    const r = await verifyRun(e, verifyContext(fixed.fingerprint));
    expect(verdictOf(r)).toEqual(['invalid-category-rule', 'seed-policy']);
    expect(r.reason).toBe('a fixed-seed run draws from "fixed:fixed-seed"');
  });

  it('a schema 1 run of a random-seed category that names no seed is refused for it', async () => {
    const r = await edited((e) => {
      e.schema = 1 as never;
      delete e.runSeed;
      delete e.variant;
    });
    expect(verdictOf(r)).toEqual(['invalid-category-rule', 'seed-policy']);
    expect(r.reason).toBe('a run names its seed');
  });
});

describe('the chunks', () => {
  it('an empty chunk is named as such, not as a short one nor as a run without its start', async () => {
    const r = await edited((e) => (e.chunks = [{ index: 0, prevHash: e.h0, hash: e.h0, entries: [] }]));
    expect(verdictOf(r)).toEqual(['invalid-replay', 'chunk-order']);
    expect(r.reason).toBe('chunk 0 is empty');
  });

  it('a chunk that is not the last holds CHUNK_SIZE entries, even when its hashes are linked', async () => {
    const r = await edited((e) => {
      const [c] = e.chunks;
      const entries = c!.entries;
      // The links a forger can copy: both chunks end on the run's real hash (the chain recomputed has one chunk).
      e.chunks = [
        { index: 0, prevHash: c!.prevHash, hash: c!.hash, entries: entries.slice(0, 2) },
        { index: 1, prevHash: c!.hash, hash: c!.hash, entries: entries.slice(2) },
      ];
    });
    expect(verdictOf(r)).toEqual(['invalid-replay', 'chunk-order']);
    expect(r.reason).toBe('chunk 0 holds 2 entries, not 500');
  });
});

describe('the loads', () => {
  it('a load that restores the state after the first entry (from 0) is a load of the run', async () => {
    const run = await playRun('any%', [ROUTE[0], { load: 'last-save' }, ...ROUTE]);
    expect(run.envelope.loads).toEqual([{ before: 2, from: 0 }]);
    const r = await verifyRun(run.envelope, verifyContext(run.fingerprint));
    expect(verdictOf(r)).toEqual(['valid', 'ok']);
  });

  it('a resumed run restores its own last state, not an earlier one', async () => {
    const r = await edited((e) => (e.loads = [{ before: 3, from: 0, resume: true }]));
    expect(verdictOf(r)).toEqual(['invalid-replay', 'replay-diverged']);
    expect(r.reason).toBe('a resumed run restores its own last state');
  });

  it('a load of a state the run reaches only later is refused by the replay', async () => {
    const r = await edited((e) => (e.loads = [{ before: 2, from: 3 }]));
    expect(verdictOf(r)).toEqual(['invalid-replay', 'replay-diverged']);
    expect(r.reason).toBe('a load restores a state the run had not reached');
  });
});

describe('what the replay says of the run', () => {
  it('a divergence names the entry where it happened', async () => {
    const r = await edited((e) => ((e.chunks[0]!.entries[2] as { act: { verb: string } }).act.verb = 'look'));
    expect(verdictOf(r)).toEqual(['invalid-replay', 'replay-diverged']);
    expect(r.reason).toMatch(/^entry 2: /);
  });

  it('a run cut before its finish is not finished (not a crash)', async () => {
    const r = await edited((e) => e.chunks[0]!.entries.pop());
    expect(verdictOf(r)).toEqual(['invalid-replay', 'not-finished']);
  });

  it("a forger's category that starts where the approved one never does: the start never fired", async () => {
    const g = withAny({ start: { event: 'roomEntered', room: 'cellar' } });
    const forged = await record('any%', route, {
      game: g,
      claimed: { start: speedrunGame().speedrun!.categories[0]!.start },
    });
    const r = await forged.verify();
    expect(verdictOf(r)).toEqual(['invalid-category-rule', 'start-trigger']);
  });

  it("a forger's category that finishes later than the approved one: entries recorded after the finish", async () => {
    const g = withAny({ finish: { event: 'roomEntered', room: 'vault' } });
    const forged = await record('any%', route, { game: g, claimed: { finish: { event: 'endingReached' } } });
    expect(forged.envelope.chunks[0]!.entries).toHaveLength(5);
    const r = await forged.verify();
    expect(verdictOf(r)).toEqual(['invalid-replay', 'replay-diverged']);
    expect(r.reason).toBe('entries recorded after the finish');
  });
});

describe('the code wheel rule reads the code wheel only', () => {
  const withWheel = (codeWheel: NonNullable<SpeedrunCategory['world']>['codeWheel']) =>
    withAny({ world: { policy: 'story', mode: 'story', codeWheel } });
  const play = (g: GameDef, results: Record<string, MinigameResult>, ids: string[]) =>
    record(
      'any%',
      async (engine) => {
        for (const id of ids) await engine.script([{ minigame: id }]);
        await route(engine);
      },
      { game: g, minigame: (id) => results[id] },
    );

  it('another minigame lost is not a code wheel lost', async () => {
    const strict = withWheel({ enabled: true, skip: false, medium: 'either' });
    const run = await play(strict, { lockpick: 'failed', 'code-wheel': 'won' }, ['lockpick', 'code-wheel']);
    expect(verdictOf(await run.verify())).toEqual(['valid', 'ok']);
  });

  it('says which rule the wheel broke: played where it is off, or not won where it must be', async () => {
    const off = await play(withWheel({ enabled: false, skip: true, medium: 'digital' }), { 'code-wheel': 'won' }, [
      'code-wheel',
    ]);
    const a = await off.verify();
    expect(verdictOf(a)).toEqual(['invalid-category-rule', 'code-wheel-rule']);
    expect(a.reason).toBe('the code wheel is off in this category, and it was played (won)');
    const strict = await play(withWheel({ enabled: true, skip: false, medium: 'either' }), { 'code-wheel': 'passed' }, [
      'code-wheel',
    ]);
    const b = await strict.verify();
    expect(verdictOf(b)).toEqual(['invalid-category-rule', 'code-wheel-rule']);
    expect(b.reason).toBe('this category wants the code wheel won, not passed');
  });
});

describe('what the run declared: saves, pauses, menus, inputs', () => {
  it('a manual save is refused where saves are forbidden, and only there', async () => {
    const saving = async (engine: Engine, rec: SpeedrunRecorder) => {
      await engine.act({ ...ROUTE[0] });
      rec.saved();
      for (const a of ROUTE.slice(1)) await engine.act({ ...a });
    };
    const forbidden = await record('no-hints', saving);
    expect(forbidden.envelope.timing.excluded.map((x) => x.kind)).toEqual(['save']);
    const r = await forbidden.verify();
    expect(verdictOf(r)).toEqual(['invalid-category-rule', 'saves-forbidden']);
    expect(verdictOf(await (await record('any%', saving)).verify())).toEqual(['valid', 'ok']);
  });

  it('a pause is not a save: a category without saves takes it', async () => {
    const paused = await record('no-hints', async (engine, rec) => {
      rec.interval('pause', true);
      rec.interval('pause', false);
      await route(engine);
    });
    expect(paused.envelope.timing.excluded.map((x) => x.kind)).toEqual(['pause']);
    expect(verdictOf(await paused.verify())).toEqual(['valid', 'ok']);
  });

  it('a category without pauses refuses the menu, and takes a save', async () => {
    const g = withAny({ allowPauses: false });
    const menu = await record(
      'any%',
      async (engine, rec) => {
        rec.interval('menu', true);
        rec.interval('menu', false);
        await route(engine);
      },
      { game: g },
    );
    expect(verdictOf(await menu.verify())).toEqual(['invalid-category-rule', 'pauses-forbidden']);
    const saved = await record(
      'any%',
      async (engine, rec) => {
        rec.saved();
        await route(engine);
      },
      { game: g },
    );
    expect(verdictOf(await saved.verify())).toEqual(['valid', 'ok']);
  });

  it('an input the category allows is no reason to refuse; a world without a day names no deadline', async () => {
    const run = await record('any%', async (engine, rec) => {
      rec.input('mouse');
      rec.input('keyboard');
      await route(engine);
    });
    expect(run.envelope.inputsUsed).toEqual(['mouse', 'keyboard']);
    const r = await run.verify();
    expect(verdictOf(r)).toEqual(['valid', 'ok']);
    expect(Object.keys(r.world!).sort()).toEqual(['hash', 'leaderboardKey', 'mode', 'seed']);
  });
});

describe('the world, checked before the replay', () => {
  // An envelope of the reference game built around a world: every refusal below comes before anything is replayed.
  const FP = { logic: 'l', trustedExtensions: 't', presentation: 'p', engine: 'e' } as GameFingerprint;
  const c = compileGameManifest(reference);
  const rehash = (v: WorldVariant, o: Partial<WorldVariant>): WorldVariant => {
    const { hash: _, ...body } = { ...v, ...o };
    return { ...body, hash: variantHash(body) };
  };
  const inWorld = (game: GameDef, categoryId: string, variant: WorldVariant, evidence?: unknown) => {
    const e = json(base.envelope);
    Object.assign(e, { gameId: game.id, categoryId, fingerprint: FP, rulesVersion: game.speedrun!.rulesVersion });
    e.variant = variant;
    if (evidence !== undefined) e.worldEvidence = evidence;
    return verifyRun(e, { game, layouts: {}, fingerprint: FP, engineVersion: ENGINE_VERSION });
  };

  it('a world proof of an unknown kind is refused for its shape, whatever fields it copies', async () => {
    const r = await edited(
      (e) => (e.worldEvidence = { kind: 'weekly', commitmentToken: 'c', revealToken: 'r', startedAt: 1 }),
    );
    expect(verdictOf(r)).toEqual(['invalid-replay', 'world-shape']);
    expect(r.reason).toBe('the world evidence is not a Daily or a Mystery proof');
  });

  it("a Remix world relabelled as the story's is not the story world", async () => {
    const remix = compileVariant(c, reference.remix!, encodeSeedCode(8), 1, 'remix');
    const r = await inWorld(reference, 'any%', rehash(remix, { mode: 'story' }));
    expect(verdictOf(r)).toEqual(['invalid-replay', 'world-forged']);
    expect(r.reason).toBe('this is not the story world of the game');
  });

  it('a game that cannot make the world a run names is inconclusive (a crash), never a forgery', async () => {
    const remix = reference.remix!;
    const extra = {
      id: 'extra',
      kind: 'coupled' as const,
      story: 0,
      logical: true as const,
      pairs: Array.from({ length: 500 }, (_, i) => ({ hint: { en: `h${i}` }, answer: `a${i}` })),
    };
    const huge = { id: 'huge', strategy: 'catalogue' as const, dimensions: [...remix.modes[1]!.dimensions, 'extra'] };
    const g: GameDef = {
      ...reference,
      remix: { ...remix, dimensions: [...remix.dimensions, extra], modes: [...remix.modes, huge] },
    };
    const made = compileVariant(compileGameManifest(g), g.remix!, encodeSeedCode(8), 1, 'remix');
    const r = await inWorld(g, 'remix-random', rehash(made, { mode: 'huge' }));
    expect(verdictOf(r)).toEqual(['inconclusive', 'crash']);
    expect(r.reason).toMatch(/^the verifier could not finish: [\s\S]*exceed the catalogue/);
  });

  it('a Daily category of a game that names no Bridge key: the proof is missing, the verifier does not crash', async () => {
    const { daily: _, ...remix } = reference.remix!;
    const g: GameDef = { ...reference, remix };
    const world = compileVariant(compileGameManifest(g), remix, encodeSeedCode(8), 1, 'daily');
    const r = await inWorld(g, 'daily', world, { kind: 'daily', token: 'x' });
    expect(verdictOf(r)).toEqual(['invalid-category-rule', 'daily-proof-missing']);
    expect(r.reason).toBe('this game names no Bridge key for its Daily and Mystery worlds');
  });

  it("the day's token is for a Daily world: a Remix world under it is refused by the token's mode", async () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/reference-daily-key.json', 'utf8'));
    const b = dailyRoutes({
      games: { reference: { daily: 'daily', mystery: 'mystery' } },
      key: await crypto.subtle.importKey('jwk', fixture.jwk, { name: 'Ed25519' }, false, ['sign']),
      kid: fixture.kid,
      secret: 's',
      now: () => Date.parse('2026-10-08T09:00:00Z'),
    });
    const token = ((await b.handle({ method: 'GET', url: '/v1/daily?game=reference' }))!.body as { token: string })
      .token;
    const seed = JSON.parse(new TextDecoder().decode(b64url.decode(token.split('.')[1]!))).seed as string;
    const r = await inWorld(reference, 'daily', compileVariant(c, reference.remix!, seed, 1, 'remix'), {
      kind: 'daily',
      token,
    });
    expect(verdictOf(r)).toEqual(['invalid-category-rule', 'world-policy']);
    expect(r.reason).toBe("the day's mode is daily");
  });
});

describe("a recorded category's signals", () => {
  const PLAYER = 'p-runner';
  const NOW = Date.UTC(2026, 9, 7, 12);
  const any = speedrunGame().speedrun!.categories[0]!;
  const game = (): GameDef => ({
    ...signals(),
    speedrun: {
      rulesVersion: 1,
      categories: [{ ...any, id: 'recorded', name: 'Recorded', realityPolicy: 'recorded', fingerprint: ['logic'] }],
      splits: [{ id: 'vault', name: 'Vault', at: { event: 'flagChanged', flag: 'vault_open', value: true } }],
    },
  });
  type Sig = { id: string; sequence: number; signal: string; apply: boolean; proof: boolean };

  /** A run opened by the mail: each signal applied and/or its signed proof recorded, as `sigs` says. */
  async function play(sigs: Sig[]) {
    const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const raw = b64url.encode(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)));
    const keyring = [await importBridgeKey('k1', raw)];
    const g = game();
    const fingerprint = await fingerprintGame(g, { extensions: { trusted: '' }, engine: 'test' });
    const engine = new Engine(g, signalsLayouts, new FakePresenter(), new MemoryStore());
    const rec = new SpeedrunRecorder({
      engine,
      gameId: g.id,
      manifest: g.speedrun!,
      category: g.speedrun!.categories[0]!,
      store: new MemoryChunkStore(),
      fingerprint,
      engineVersion: 'test',
      now: () => 0,
    });
    await rec.start();
    for (const s of sigs) {
      const source = s.signal.startsWith('mail') ? 'mail' : 'webhook';
      const payload = {
        format: 'web-scumm-world-signal' as const,
        schema: 1 as const,
        id: s.id,
        sequence: s.sequence,
        gameId: g.id,
        playerId: PLAYER,
        signal: s.signal,
        source,
        receivedAt: NOW,
        dedupeKey: `${s.id}-${s.sequence}`,
        policyVersion: '1',
      };
      const entry: ExternalEntry = {
        id: s.id,
        sequence: s.sequence,
        signal: s.signal,
        source,
        receivedAt: NOW,
        playerId: PLAYER,
      };
      if (s.proof) rec.realitySignal(await signSignal(payload, kp.privateKey, 'k1'), entry);
      if (s.apply) expect(await engine.receive(entry)).toBe('applied');
    }
    await engine.act({ verb: 'use', a: 'vault' });
    const envelope = await rec.seal();
    const ctx: VerifyContext = {
      game: g,
      layouts: signalsLayouts,
      fingerprint,
      engineVersion: 'test',
      keyring,
      signals: { gameId: g.id, playerId: PLAYER, signals: new Set(g.reality!.signals.map((x) => x.id)) },
      verifySignal: async (jws, k, e) => {
        const v = await verifySignal(jws, k, e);
        return v.ok ? { ok: true } : { ok: false, code: v.code };
      },
    };
    return { envelope, ctx };
  }
  const mail: Sig = { id: 'sig-1', sequence: 1, signal: 'mail.answer.correct', apply: true, proof: true };

  it('the proof of a signal is found by its id and its sequence, not by either', async () => {
    // Another signal's proof, recorded first, shares the sequence: it is not the mail's.
    const decoy: Sig = { id: 'sig-0', sequence: 1, signal: 'hook.bell', apply: false, proof: true };
    const { envelope, ctx } = await play([decoy, mail]);
    expect(envelope.realitySignals!.map((s) => s.id)).toEqual(['sig-0', 'sig-1']);
    expect(verdictOf(await verifyRun(envelope, ctx))).toEqual(['valid', 'ok']);
  });

  it('a signal applied without its proof, among others proved, is missing (not a crash)', async () => {
    const bell: Sig = { id: 'sig-2', sequence: 2, signal: 'hook.bell', apply: true, proof: false };
    const { envelope, ctx } = await play([bell, mail]);
    const r = await verifyRun(envelope, ctx);
    expect(verdictOf(r)).toEqual(['missing-reality-proof', 'signal-missing']);
    expect(r.reason).toBe('signal #2 has no recorded proof');
  });

  it('no proof at all, a JWS that is not its hash, a verifier without its signature check: each said so', async () => {
    const { envelope, ctx } = await play([mail]);
    const none = json(envelope);
    delete none.realitySignals;
    const a = await verifyRun(none, ctx);
    expect(verdictOf(a)).toEqual(['missing-reality-proof', 'signal-missing']);
    expect(a.reason).toBe('signals were applied but none is recorded');
    const altered = json(envelope);
    const s = altered.realitySignals![0] as { jws: string };
    s.jws = `${s.jws.slice(0, -4)}AAAA`;
    const b = await verifyRun(altered, ctx);
    expect(verdictOf(b)).toEqual(['missing-reality-proof', 'signal-signature']);
    expect(b.reason).toBe('signal #1: its hash does not match its JWS');
    const { verifySignal: _, ...blind } = ctx;
    expect(verdictOf(await verifyRun(envelope, blind))).toEqual(['inconclusive', 'no-keyring']);
  });
});
