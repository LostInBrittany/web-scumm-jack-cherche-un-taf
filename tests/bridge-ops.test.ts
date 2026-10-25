// Running the Bridge (4.1.10, wiki/en/bridge.install-run.md): a 4.1.9 journal moved into SQLite and served from it; a backup
// taken, the store lost, the backup restored, and the players' journals read back identical; a tenant exported and
// deleted from the command line; `/livez`, `/readyz`, `/healthz`; the measures in the process and through an
// OpenTelemetry API when one is given; `trust-proxy` by allowlist.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { realityManifest } from '@engine/reality/manifest';
import { loadBridge, main } from '../bridge/src/cli';
import { bridgeServer, inAllowlist } from '../bridge/src/server';
import { MemoryRealityStore } from '../bridge/src/store-memory';
import { SqliteRealityStore } from '../bridge/src/store-sqlite';
import { loadTelemetry, type OtelApi, Telemetry } from '../bridge/src/telemetry';
import { tenantBridge } from './fixtures/bridge-tenant';
import { signals } from './fixtures/signals';

const temps: string[] = [];
const servers: { close(): void }[] = [];
afterAll(() => {
  for (const s of servers) s.close();
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const tmp = (name: string) => {
  const d = mkdtempSync(join(tmpdir(), `bridge-ops-${name}-`));
  temps.push(d);
  return d;
};

/** The command line in this process, its output kept. */
async function cli(args: string[]): Promise<{ code: number; out: string }> {
  const out: string[] = [];
  const [log, err, write] = [console.log, console.error, process.stdout.write];
  console.log = (x: unknown) => void out.push(String(x));
  console.error = (x: unknown) => void out.push(String(x));
  process.stdout.write = ((s: string) => (out.push(s), true)) as typeof process.stdout.write;
  try {
    return { code: await main(args, { manifest: realityManifest(signals()) }), out: out.join('\n') };
  } finally {
    console.log = log;
    console.error = err;
    process.stdout.write = write;
  }
}

/** A Bridge directory with a journal (4.1.9's profile) holding two players and their signals. */
async function journalWithSignals(dir: string) {
  expect((await cli(['init', `--dir=${dir}`, '--no-demo-webhooks'])).code).toBe(0);
  const grant = await cli([
    'grant',
    `--dir=${dir}`,
    '--connector=c',
    '--source=mail',
    '--signals=mail.answer.correct',
    '--pair',
  ]);
  const token = grant.out.trim();
  const file = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
  const hold: Parameters<typeof loadBridge>[2] = {};
  const bridge = await loadBridge(file, dir, hold);
  const links = [];
  for (let i = 0; i < 2; i++) {
    const { code } = await bridge.startPairing('signals');
    await bridge.confirmPairing(token, code);
    const c = await bridge.claimPairing(code);
    if (c.status !== 'paired') throw new Error('not paired');
    links.push(c);
    for (const k of ['a', 'b', 'c'])
      await bridge.propose(token, {
        playerId: c.playerId,
        signal: 'mail.answer.correct',
        source: 'mail',
        dedupeKey: k,
      });
    await bridge.ack(c.capability, 2);
  }
  const journals = await Promise.all(links.map((l) => bridge.signals(l.capability, 0)));
  bridge.close();
  await hold.store?.close();
  return { links, journals, token };
}

describe('moving a 4.1.9 journal into SQLite', () => {
  it('migrate --from jsonl --to sqlite keeps every player, signal and acknowledgement, then serves from it', async () => {
    const dir = tmp('migrate');
    const { links, journals } = await journalWithSignals(dir);
    const r = await cli(['migrate', `--dir=${dir}`, '--from', 'jsonl', '--to', 'sqlite']);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('2 players and 6 signals');
    const file = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    expect(file.store).toBe('sqlite:bridge.sqlite');
    // The journal is left as it was: the move can be undone by naming the journal again.
    expect(existsSync(join(dir, 'journal.jsonl'))).toBe(true);
    const hold: Parameters<typeof loadBridge>[2] = {};
    const bridge = await loadBridge(file, dir, hold);
    expect(hold.store?.kind).toBe('sqlite');
    for (const [i, l] of links.entries()) {
      expect(await bridge.signals(l.capability, 0)).toEqual(journals[i]);
      expect((await bridge.exportPlayer(readFileSync(join(dir, 'admin-token'), 'utf8').trim(), l.playerId)).acked).toBe(
        2,
      );
    }
    bridge.close();
    await hold.store?.close();
    // Twice is refused: the target already holds the tenant.
    expect((await cli(['migrate', `--dir=${dir}`, '--from=jsonl', '--to=sqlite'])).code).toBe(1);
    expect((await cli(['doctor', `--dir=${dir}`])).out).toContain('sqlite store readable (schema 5)');
    expect((await cli(['migrate', `--dir=${dir}`, '--schema=5'])).out).toContain('schema 5 (nothing to do)');
  });
});

describe('backup and restore, rehearsed', () => {
  it('carries the leaderboards and the daily challenge too (schema 2 in 4.1.18, 3 in 4.1.19, 4 since 4.1.20), and refuses a column it cannot name', async () => {
    const dir = tmp('backup-runs');
    await journalWithSignals(dir);
    expect((await cli(['migrate', `--dir=${dir}`, '--from=jsonl', '--to=sqlite'])).code).toBe(0);
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(dir, 'bridge.sqlite'));
    const run = (id: string, ranked: string | null) =>
      db
        .prepare(
          'INSERT INTO runs (tenant_id, id, game_id, category_id, player, submitted_at, status, verdict, trust, ranked, leaderboard_key, run_key, delete_token_hash, envelope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'default',
          id,
          'signals',
          'any%',
          `p-${id}`,
          1_000 + id.length,
          'verified',
          'valid',
          'replay-valid',
          ranked,
          'any%',
          `key-${id}`,
          'h'.repeat(64),
          '{"v":2}',
        );
    run('r1', '42');
    run('r22', null);
    db.prepare('INSERT INTO daily_kv (k, v, created_at) VALUES (?, ?, ?)').run(
      'daily|signals|2026-10-10',
      '{"token":"t"}',
      7,
    );
    const before = {
      runs: db.prepare('SELECT * FROM runs ORDER BY id').all(),
      daily: db.prepare('SELECT * FROM daily_kv').all(),
    };
    db.close();
    const backup = join(dir, 'backup.json');
    const b = await cli(['backup', `--dir=${dir}`, `--out=${backup}`]);
    expect(b.out).toContain('2 run(s), 1 daily record(s)');
    expect(JSON.parse(readFileSync(backup, 'utf8')).schema).toBe(4);
    for (const f of ['bridge.sqlite', 'bridge.sqlite-wal', 'bridge.sqlite-shm']) rmSync(join(dir, f), { force: true });
    const r = await cli(['restore', `--dir=${dir}`, `--from=${backup}`, '--mode=merge']);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('2 run(s), 1 daily record(s), 0 quota row(s) restored');
    const again = new DatabaseSync(join(dir, 'bridge.sqlite'));
    expect(again.prepare('SELECT * FROM runs ORDER BY id').all()).toEqual(before.runs);
    expect(again.prepare('SELECT * FROM daily_kv').all()).toEqual(before.daily);
    again.close();
    // Over the runs it holds: refused, then replaced with --force (4.1.19: the daily record too, in the same transaction).
    expect((await cli(['restore', `--dir=${dir}`, `--from=${backup}`, '--mode=merge'])).code).toBe(1);
    expect((await cli(['restore', `--dir=${dir}`, `--from=${backup}`, '--mode=merge', '--force'])).code).toBe(0);
    // A backup naming a column that is not an identifier: nothing spliced into a statement.
    const forged = JSON.parse(readFileSync(backup, 'utf8'));
    forged.payload.runs[0] = { 'id) VALUES (1); DROP TABLE runs; --': 'x' };
    writeFileSync(backup, JSON.stringify(forged));
    const refused = await cli(['restore', `--dir=${dir}`, `--from=${backup}`, '--mode=merge', '--force']);
    expect(refused.code).not.toBe(0);
    const still = new DatabaseSync(join(dir, 'bridge.sqlite'));
    expect(still.prepare('SELECT COUNT(*) AS n FROM runs').get()).toEqual({ n: 2 });
    still.close();
  });

  it('a backup taken, the store lost, the backup restored: the same journals, the same acknowledgements', async () => {
    const dir = tmp('backup');
    const { links, journals } = await journalWithSignals(dir);
    expect((await cli(['migrate', `--dir=${dir}`, '--from=jsonl', '--to=sqlite'])).code).toBe(0);
    const backup = join(dir, 'backup.json');
    const b = await cli(['backup', `--dir=${dir}`, `--out=${backup}`]);
    expect(b.code, b.out).toBe(0);
    expect(readFileSync(backup, 'utf8')).not.toContain('capability"'); // hashes only, never a capability
    // The disaster: the database file is gone.
    for (const f of ['bridge.sqlite', 'bridge.sqlite-wal', 'bridge.sqlite-shm']) rmSync(join(dir, f), { force: true });
    const r = await cli(['restore', `--dir=${dir}`, `--from=${backup}`, '--mode=merge']);
    expect(r.code, r.out).toBe(0);
    // Restoring over a store that holds the tenant needs --force.
    expect((await cli(['restore', `--dir=${dir}`, `--from=${backup}`, '--mode=merge'])).code).toBe(1);
    expect((await cli(['restore', `--dir=${dir}`, `--from=${backup}`, '--mode=merge', '--force'])).code).toBe(0);
    const file = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    const hold: Parameters<typeof loadBridge>[2] = {};
    const bridge = await loadBridge(file, dir, hold);
    for (const [i, l] of links.entries()) expect(await bridge.signals(l.capability, 0)).toEqual(journals[i]);
    // The next proposal continues each player's sequence.
    const token = (
      await cli(['grant', `--dir=${dir}`, '--connector=c2', '--source=mail', '--signals=mail.answer.correct'])
    ).out.trim();
    await expect(
      bridge.propose(token, {
        playerId: links[0]!.playerId,
        signal: 'mail.answer.correct',
        source: 'mail',
        dedupeKey: 'd',
      }),
    ).resolves.toMatchObject({ sequence: 4, duplicate: false });
    bridge.close();
    await hold.store?.close();
  });
});

describe('a tenant from the command line', () => {
  it('exports to a file and deletes with --yes only', async () => {
    const dir = tmp('tenant');
    await journalWithSignals(dir);
    expect((await cli(['migrate', `--dir=${dir}`, '--from=jsonl', '--to=sqlite', '--tenant=acme'])).code).toBe(0);
    const out = join(dir, 'acme.json');
    expect((await cli(['tenant', 'export', `--dir=${dir}`, '--tenant=acme', `--out=${out}`])).code).toBe(0);
    const x = JSON.parse(readFileSync(out, 'utf8'));
    expect([x.tenantId, x.players.length, x.signals.length]).toEqual(['acme', 2, 6]);
    expect((await cli(['tenant', 'delete', `--dir=${dir}`, '--tenant=acme'])).code).toBe(1);
    expect((await cli(['tenant', 'delete', `--dir=${dir}`, '--tenant=acme', '--yes'])).code).toBe(0);
    const s = await SqliteRealityStore.open(join(dir, 'bridge.sqlite'));
    expect(await s.tenants()).toEqual([]);
    await s.close();
  });
});

describe('health, readiness, measures', () => {
  it('/livez answers always; /readyz and /healthz ask the store; 503 when it does not answer', async () => {
    const store = new MemoryRealityStore();
    const t = await tenantBridge(store);
    const server = bridgeServer(t.bridge).listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise((ok) => server.once('listening', ok));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${url}/livez`)).status).toBe(200);
    expect(await (await fetch(`${url}/readyz`)).json()).toEqual({ status: 'ok' });
    expect(await (await fetch(`${url}/healthz`)).json()).toEqual({
      status: 'ok',
      tenants: 1,
      store: 'memory',
      streams: 0,
    });
    store.ping = async () => {
      throw new Error('down');
    };
    expect((await fetch(`${url}/readyz`)).status).toBe(503);
    expect((await fetch(`${url}/livez`)).status).toBe(200);
  });

  it('counts acceptances, duplicates, refusals and acknowledgements; sends them through an OpenTelemetry API', async () => {
    const recorded: string[] = [];
    const api: OtelApi = {
      metrics: {
        getMeter: () => ({
          createCounter: (name) => ({
            add: (n, a) => void recorded.push(`${name}+${n}${a?.code ? `:${a.code}` : ''}`),
          }),
          createHistogram: (name) => ({ record: () => void recorded.push(name) }),
        }),
      },
    };
    const telemetry = new Telemetry(api);
    const t = await tenantBridge(new MemoryRealityStore(), { telemetry });
    const link = await t.pair();
    await t.propose(link.playerId, 'a');
    await t.propose(link.playerId, 'a');
    await expect(t.propose(link.playerId, 'b', 'not-a-token')).rejects.toMatchObject({ status: 401 });
    await t.bridge.ack(link.capability, 1);
    expect(telemetry.snapshot()).toMatchObject({
      'signals.accepted': 1,
      'signals.duplicate': 1,
      'signals.refused:format': 1,
      acks: 1,
    });
    expect(telemetry.exported).toBe(true);
    expect(recorded).toEqual(
      expect.arrayContaining([
        'bridge.signals.accepted+1',
        'bridge.signals.duplicate+1',
        'bridge.signals.refused+1:format',
        'bridge.acks+1',
        'bridge.propose.ms',
        'bridge.backlog',
      ]),
    );
  });

  it('without OpenTelemetry installed, the measures stay in the process and that is said', async () => {
    const said: string[] = [];
    const t = await loadTelemetry({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318' }, (l) => said.push(l));
    // Neither @opentelemetry/sdk-node nor @opentelemetry/api is a dependency of the repository.
    expect(said.join('\n')).toMatch(/sdk-node is not installed/);
    expect(t.exported).toBe(false);
    t.count('errors');
    expect(t.snapshot()).toEqual({ errors: 1 });
  });
});

describe('trust-proxy by allowlist (D20)', () => {
  it('matches addresses and IPv4 networks, IPv4-mapped IPv6 included', () => {
    expect(inAllowlist('10.1.2.3', ['10.0.0.0/8'])).toBe(true);
    expect(inAllowlist('::ffff:10.1.2.3', ['10.0.0.0/8'])).toBe(true);
    expect(inAllowlist('11.1.2.3', ['10.0.0.0/8'])).toBe(false);
    expect(inAllowlist('192.168.1.7', ['192.168.1.7'])).toBe(true);
    expect(inAllowlist('192.168.1.8', ['192.168.1.7', '192.168.1.0/31'])).toBe(false);
    expect(inAllowlist('::1', ['127.0.0.1', '::1'])).toBe(true);
    expect(inAllowlist('1.2.3.4', ['0.0.0.0/0'])).toBe(true);
    expect(inAllowlist('fe80::1', ['10.0.0.0/8'])).toBe(false);
  });

  it('reads X-Forwarded-For only from a listed proxy, and takes its rightmost address that is not a proxy', async () => {
    const t = await tenantBridge(new MemoryRealityStore());
    // One anonymous request a minute per address: a second one from the same client is refused (429).
    const run = async (trustProxy: boolean | string[], first: string, second: string) => {
      const server = bridgeServer(t.bridge, { trustProxy, perMinutePerIp: 1 }).listen(0, '127.0.0.1');
      servers.push(server);
      await new Promise((ok) => server.once('listening', ok));
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/keys`;
      const a = (await fetch(url, { headers: { 'X-Forwarded-For': first } })).status;
      const b = (await fetch(url, { headers: { 'X-Forwarded-For': second } })).status;
      server.close();
      return [a, b];
    };
    // Not trusted: the socket is the client, the two requests are one address.
    expect(await run(false, '1.1.1.1', '2.2.2.2')).toEqual([200, 429]);
    // A proxy not on the list: its header is not read either.
    expect(await run(['10.0.0.0/8'], '1.1.1.1', '2.2.2.2')).toEqual([200, 429]);
    // The loopback trusted: two clients behind it.
    expect(await run(true, '1.1.1.1', '2.2.2.2')).toEqual([200, 200]);
    // A client that writes another address on the left is still itself (the rightmost hop not a proxy).
    expect(await run(true, '1.1.1.1', '2.2.2.2, 1.1.1.1')).toEqual([200, 429]);
    // A chain of listed proxies is walked from the right.
    expect(await run(['127.0.0.1'], '1.1.1.1, 127.0.0.1', '2.2.2.2, 127.0.0.1')).toEqual([200, 200]);
  });
});
