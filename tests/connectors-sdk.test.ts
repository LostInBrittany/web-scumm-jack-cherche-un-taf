// The connector SDK's contract (4.1.9, ADR 0008, D19), the same for the four connectors: a delivery whose answer is
// lost is sent again with the same key and the Bridge keeps one sequence; the local quota; a payload over its size;
// a Biscuit without the signal; an input over the connector's limits; a clean stop; a log without content. Then the
// SDK alone (shapes, the duplicate, pairing), two connectors sending one key three times each (one logical effect),
// and the `web-scumm-connector` process (help, health, metrics, SIGTERM → exit 0).
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalJson, createContext, dedupeKey, payloadProblem, safeLog } from '../connectors/src/sdk';
import type { badgeFixtures } from './fixtures/connectors/badges';
import { drivers } from './fixtures/connectors/drivers';
import { contextFor, GRANTS, MANIFEST, startBridge, type TestBridge } from './fixtures/connectors/harness';

const fixtures = JSON.parse(readFileSync('connectors/test-vectors/open-badge/fixtures.json', 'utf8')) as ReturnType<
  typeof badgeFixtures
>;
const cleanup: (() => Promise<unknown> | void)[] = [];
afterAll(async () => {
  for (const f of cleanup.reverse()) await f();
});

/** A fetch that loses the Bridge's first answer to a proposal after the Bridge has handled it (a dropped connection). */
const losingFirstAnswer = () => {
  let lost = false;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const r = await fetch(input, init);
    if (!lost && String(input).endsWith('/v1/signals')) {
      lost = true;
      await r.text();
      throw new TypeError('fetch failed');
    }
    return r;
  }) as typeof fetch;
};

describe.each(drivers(fixtures))('the contract, for $id', (d) => {
  let t: TestBridge;
  const lines: string[] = [];
  const grant = GRANTS[d.id];

  it('a lost answer is retried with the same key: one sequence, the duplicate counted', async () => {
    t = await startBridge();
    cleanup.push(() => t.close());
    const token = await t.token({ connector: d.id, sources: [...grant.sources], signals: [...grant.signals] });
    const ctx = createContext({
      bridge: { url: t.url, token },
      gameId: 'signals',
      manifest: MANIFEST,
      connector: d.id,
      write: (l) => lines.push(l),
      fetch: losingFirstAnswer(),
    });
    const c = await d.start(ctx);
    cleanup.push(() => c.stop());
    const playerId = await d.deliver(t, c, 1);
    expect(t.count(playerId)).toBe(1);
    expect(ctx.metrics()).toMatchObject({ retries: 1, duplicates: 1, accepted: 0 });
  }, 60_000);

  it('the local quota refuses past its minute', async () => {
    const { ctx } = await contextFor(t, d.id, { limits: { maxPerMinute: 1 }, lines });
    const c = await d.start(ctx);
    cleanup.push(() => c.stop());
    const a = await d.deliver(t, c, 2);
    const b = await d.deliver(t, c, 3);
    expect(t.count(a) + t.count(b)).toBe(1);
    expect(ctx.metrics().refused.quota).toBe(1);
  }, 60_000);

  it('a payload over its size is refused before the Bridge', async () => {
    const { ctx } = await contextFor(t, d.id, { limits: { maxBytes: 8 }, lines });
    const c = await d.start(ctx);
    cleanup.push(() => c.stop());
    const p = await d.deliver(t, c, 4);
    expect(t.count(p)).toBe(0);
    expect(ctx.metrics().refused['too-large']).toBe(1);
  }, 60_000);

  it('a Biscuit without the signal is refused by the Bridge, and the connector carries on', async () => {
    const token = await t.token({ connector: d.id, sources: [...grant.sources], signals: ['hook.bell'] });
    const { ctx } = await contextFor(t, d.id, { token, lines });
    const c = await d.start(ctx);
    cleanup.push(() => c.stop());
    const p = await d.deliver(t, c, 5);
    expect(t.count(p)).toBe(0);
    expect(ctx.metrics().refused.denied).toBe(1);
    expect((await c.health()).ok).toBe(true);
  }, 60_000);

  it('an input over its limits is refused, and the connector carries on', async () => {
    const { ctx } = await contextFor(t, d.id, { lines });
    const c = await d.start(ctx);
    cleanup.push(() => c.stop());
    expect(await d.oversize(c)).toMatch(/413|Line too long|authentication/i);
    const p = await d.deliver(t, c, 6);
    expect(t.count(p)).toBe(1);
  }, 60_000);

  it('stops within five seconds and closes its port', async () => {
    const { ctx } = await contextFor(t, d.id, { lines });
    const c = await d.start(ctx);
    const t0 = Date.now();
    await c.stop();
    expect(Date.now() - t0).toBeLessThan(5000);
    expect((await c.health()).ok).toBe(false);
    const refused = await new Promise<boolean>((ok) => {
      const s = connect(c.port, '127.0.0.1');
      s.on('connect', () => {
        s.destroy();
        ok(false);
      });
      s.on('error', () => ok(true));
    });
    expect(refused).toBe(true);
  }, 30_000);

  it('logged no content: no address, no text, no secret of its fixtures', () => {
    expect(lines.length).toBeGreaterThan(5);
    const log = lines.join('\n');
    for (const s of d.secrets) expect(log.includes(s), s).toBe(false);
    for (const l of lines) expect(() => JSON.parse(l)).not.toThrow();
  });
});

describe('the SDK alone', () => {
  it('hashes a payload whatever its key order, refuses nested, marked-up or oversized payloads', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'] })).toBe('{"a":[true,null,"x"],"b":1}');
    expect(payloadProblem({ a: 1, b: 'x', c: null, d: false }, 100)).toBeNull();
    expect(payloadProblem({ a: { nested: 1 } }, 100)).toBe('shape');
    expect(payloadProblem({ a: '<script>' }, 100)).toBe('shape');
    expect(payloadProblem({ a: Number.NaN }, 100)).toBe('shape');
    expect(payloadProblem([1], 100)).toBe('shape');
    expect(payloadProblem({ a: 'x'.repeat(200) }, 100)).toBe('too-large');
    expect(dedupeKey('email', '<a@b>')).toMatch(/^[0-9a-f]{64}$/);
    expect(dedupeKey('email', '<a@b>')).not.toBe(dedupeKey('telnet', '<a@b>'));
  });

  it('logs identifiers and counts only', () => {
    const out: string[] = [];
    const log = safeLog((l) => out.push(l), 'email');
    log('signal.accepted', {
      kind: 'letter.door',
      sequence: 3,
      ok: true,
      who: 'robin@player.example',
      text: 'open the door',
      'bad key': 'x',
    });
    log('<script>', {});
    expect(JSON.parse(out[0]!)).toEqual({
      event: 'signal.accepted',
      connector: 'email',
      kind: 'letter.door',
      sequence: 3,
      ok: true,
      who: '[redacted]',
      text: '[redacted]',
    });
    expect(JSON.parse(out[1]!).event).toBe('[redacted]');
  });

  it('proposes once, says duplicate after, refuses the undeclared, the malformed, and after close', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const { ctx } = await contextFor(t, 'telnet');
    const code = await t.code();
    const paired = await ctx.pair(code);
    expect(paired.ok).toBe(true);
    if (!paired.ok) return;
    expect(await ctx.pair(code)).toEqual({ ok: false, refusal: 'pairing' });
    expect(await ctx.pair('lower')).toEqual({ ok: false, refusal: 'pairing' });
    const s = {
      source: 'telnet',
      kind: 'terminal.lamp',
      playerId: paired.playerId,
      dedupeKey: 'k1',
      payload: { line: 1 },
      receivedAt: new Date().toISOString(),
    };
    expect(await ctx.propose(s)).toEqual({ ok: true, sequence: 1, duplicate: false });
    expect(await ctx.propose(s)).toEqual({ ok: true, sequence: 1, duplicate: true });
    expect(await ctx.propose({ ...s, kind: 'nope.never' })).toEqual({ ok: false, refusal: 'not-declared' });
    expect(await ctx.propose({ ...s, playerId: 'a b' })).toEqual({ ok: false, refusal: 'shape' });
    expect(await ctx.propose({ ...s, dedupeKey: 'k2', playerId: 'p-0000000000000000' })).toEqual({
      ok: false,
      refusal: 'player',
    });
    const dead = createContext({
      bridge: { url: 'http://127.0.0.1:9/', token: 'x' },
      gameId: 'signals',
      manifest: MANIFEST,
      connector: 'telnet',
      write: () => {},
      retries: 0,
      limits: { timeoutMs: 500 },
    });
    expect(await dead.propose(s)).toEqual({ ok: false, refusal: 'unreachable' });
    ctx.close();
    expect(await ctx.propose(s)).toEqual({ ok: false, refusal: 'stopped' });
    expect(t.count(paired.playerId)).toBe(1);
  }, 30_000);

  it('two connectors sending the same key three times each: one sequence, one logical effect', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const telnet = (await contextFor(t, 'telnet')).ctx;
    const ssh = (await contextFor(t, 'ssh')).ctx;
    const paired = await telnet.pair(await t.code());
    if (!paired.ok) throw new Error('not paired');
    const s = {
      source: 'terminal',
      kind: 'terminal.lamp',
      playerId: paired.playerId,
      dedupeKey: dedupeKey('terminal', 'same'),
      payload: {},
      receivedAt: new Date().toISOString(),
    };
    const results = await Promise.all([1, 2, 3].flatMap(() => [telnet.propose(s), ssh.propose(s)]));
    expect(results.every((r) => r.ok && r.sequence === 1)).toBe(true);
    expect(results.filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
    expect(t.count(paired.playerId)).toBe(1);
  }, 30_000);
});

describe('the web-scumm-connector process', () => {
  const run = (args: string[]) =>
    spawn(process.execPath, ['connectors/bin.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = (p: ChildProcess) => new Promise<number | null>((ok) => p.on('exit', (code) => ok(code)));

  it('says how to use it', async () => {
    const p = run(['--help']);
    let out = '';
    p.stdout!.on('data', (d) => {
      out += d;
    });
    expect(await exit(p)).toBe(0);
    expect(out).toMatch(/usage: web-scumm-connector <email\|telnet\|ssh\|open-badge> --config <file\.json>/);
    expect(await exit(run(['nope']))).toBe(2);
  }, 30_000);

  it('starts from its configuration, serves health and metrics, and exits 0 on SIGTERM', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const dir = mkdtempSync(join(tmpdir(), 'connector-run-'));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(
      join(dir, 'token'),
      `${await t.token({ connector: 'telnet', sources: ['terminal'], signals: ['terminal.lamp'] })}\n`,
      { mode: 0o600 },
    );
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(MANIFEST));
    writeFileSync(
      join(dir, 'connector.json'),
      JSON.stringify({
        bridge: { url: t.url, tokenFile: 'token' },
        gameId: 'signals',
        manifestFile: 'manifest.json',
        health: { port: 0 },
        telnet: { port: 0 },
      }),
    );
    const p = run(['telnet', '--config', join(dir, 'connector.json')]);
    let out = '';
    p.stdout!.on('data', (d) => {
      out += d;
    });
    const t0 = Date.now();
    while (!out.includes('connector.started')) {
      if (Date.now() - t0 > 20_000) throw new Error(`did not start: ${out}`);
      await new Promise((r) => setTimeout(r, 50));
    }
    const started = JSON.parse(out.split('\n').find((l) => l.includes('connector.started'))!) as { healthPort: number };
    const health = await fetch(`http://127.0.0.1:${started.healthPort}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ connector: 'telnet', ok: true });
    expect(await (await fetch(`http://127.0.0.1:${started.healthPort}/metrics`)).json()).toMatchObject({
      connector: 'telnet',
      proposed: 0,
    });
    const exited = exit(p);
    p.kill('SIGTERM');
    const t1 = Date.now();
    expect(await exited).toBe(0);
    expect(Date.now() - t1).toBeLessThan(6000);
    expect(out).toMatch(/"event":"connector.stopped","connector":"telnet","id":"telnet","drained":true/);
    expect(out).not.toContain(readFileSync(join(dir, 'token'), 'utf8').trim().slice(0, 40));
  }, 60_000);
});
