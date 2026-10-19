// The recorded replays of the sample chapter (4.1.9, games/signals/replays/*.json): each input goes through its real
// connector code with no network (a context that records what would be proposed), and the signals that come out are
// the ones the replay names, in order. `npm run solve:reality` proves the game finishable with those same signals.
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { EmailConnector } from '../connectors/src/email/connector';
import type { ConnectorContext } from '../connectors/src/sdk';
import { ResumeWords, VirtualShell } from '../connectors/src/terminal/shell';
import { MANIFEST } from './fixtures/connectors/harness';

interface Replay {
  about: string;
  inputs: ({ connector: 'email'; raw: string } | { connector: 'telnet' | 'ssh'; lines: string[] })[];
  signals: string[];
}
const DIR = 'games/signals/replays';
const stops: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const s of stops) await s();
});

function recording(): { ctx: ConnectorContext; kinds: string[] } {
  const kinds: string[] = [];
  let seq = 0;
  return {
    kinds,
    ctx: {
      bridge: { url: 'http://127.0.0.1:9/', token: '' },
      gameId: 'signals',
      limits: { maxBytes: 4096, maxPerMinute: 60, timeoutMs: 100 },
      manifest: MANIFEST,
      log: () => {},
      propose: async (s) => {
        kinds.push(s.kind);
        return { ok: true, sequence: ++seq, duplicate: false };
      },
      pair: async () => ({ ok: false, refusal: 'pairing' }),
      reject: () => {},
      metrics: () => ({ proposed: 0, accepted: 0, duplicates: 0, refused: {}, rejectedInputs: 0, retries: 0 }),
    },
  };
}

describe('the recorded replays of games/signals', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
  it('has at least one, combining email and a terminal', () => {
    expect(files.length).toBeGreaterThan(0);
    const all = files.flatMap((f) =>
      (JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Replay).inputs.map((i) => i.connector),
    );
    expect(all).toContain('email');
    expect(all.some((c) => c === 'telnet' || c === 'ssh')).toBe(true);
  });

  it.each(files)(
    '%s: its inputs make its signals, offline',
    async (f) => {
      const replay = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Replay;
      const { ctx, kinds } = recording();
      const email = new EmailConnector({
        mode: 'webhook',
        domain: 'garden.example',
        webhook: { port: 0, secret: 'replay' },
      });
      await email.start(ctx);
      stops.push(() => email.stop());
      for (const input of replay.inputs) {
        if (input.connector === 'email') {
          const o = await email.handle(new Uint8Array(Buffer.from(input.raw, 'utf8')));
          expect(o.kind).toBe('proposed');
          continue;
        }
        const shell = new VirtualShell({
          connector: input.connector,
          ctx,
          decl: MANIFEST.connectors![input.connector]!,
          sessionId: `replay-${input.connector}`,
          resume: new ResumeWords(),
          write: () => {},
          close: () => {},
          playerId: 'p-0123456789abcdef',
        });
        for (const line of input.lines) await shell.line(line);
      }
      expect(kinds).toEqual(replay.signals);
    },
    30_000,
  );
});
