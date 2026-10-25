// The signed signal (4.1.1, src/engine/reality/protocol.ts): every case of the conformance corpus
// (tests/fixtures/reality/conformance.json, the same file the Rust cross-check reads) gives its verdict, and nothing
// is decoded before its signature is checked.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importBridgeKey, verifySignal, type Keyring } from '@engine/reality/protocol';
import { manifestHash, realityManifest } from '@engine/reality/manifest';
import type { GameDef } from '@engine/core/types';

const corpus = JSON.parse(readFileSync('tests/fixtures/reality/conformance.json', 'utf8')) as {
  keys: { kid: string; raw: string; notBefore?: number; notAfter?: number }[];
  expect: { gameId: string; playerId: string; signals: string[]; now: number };
  cases: { name: string; jws: string; verdict: string; expect?: { now?: number } }[];
};
const keyring = async (): Promise<Keyring> =>
  Promise.all(corpus.keys.map(({ kid, raw, ...w }) => importBridgeKey(kid, raw, w)));

describe('the signed signal', () => {
  it.each(corpus.cases.map((c) => [c.name, c] as const))('%s', async (_n, c) => {
    const r = await verifySignal(c.jws, await keyring(), {
      ...corpus.expect,
      signals: new Set(corpus.expect.signals),
      ...c.expect,
    });
    expect(r.ok ? 'ok' : r.code).toBe(c.verdict);
  });

  it('the corpus covers every refusal code', () => {
    const codes = new Set(corpus.cases.map((c) => c.verdict));
    for (const c of [
      'size',
      'shape',
      'header',
      'algorithm',
      'key',
      'key-window',
      'signature',
      'payload',
      'schema',
      'game',
      'player',
      'signal',
      'expired',
    ])
      expect(codes.has(c), c).toBe(true);
  });

  it('refuses what is not a string, without throwing', async () => {
    for (const v of [null, 42, {}, ['a.b.c']]) {
      const r = await verifySignal(v, await keyring(), { ...corpus.expect, signals: new Set() });
      expect(r).toMatchObject({ ok: false, code: 'shape' });
    }
  });
});

describe('the manifest', () => {
  const game = {
    id: 'signals',
    reality: {
      signals: [
        { id: 'mail.answer.wrong', source: 'mail', availability: 'optional', replay: 'record' },
        {
          id: 'mail.answer.correct',
          source: 'mail',
          availability: 'required',
          replay: 'record',
          fallback: { verb: 'use', a: 'radio' },
        },
      ],
    },
  } as unknown as GameDef;

  it('lists the declared signals, sorted, without the game-side details', () => {
    expect(realityManifest(game)).toEqual({
      format: 'web-scumm-reality-manifest',
      schema: 1,
      gameId: 'signals',
      signals: [
        { id: 'mail.answer.correct', source: 'mail', availability: 'required', replay: 'record' },
        { id: 'mail.answer.wrong', source: 'mail', availability: 'optional', replay: 'record' },
      ],
    });
    expect(realityManifest({ id: 'demo' } as GameDef)).toBeNull();
  });

  it('has a hash that changes when a signal is renamed', async () => {
    const m = realityManifest(game)!;
    const h = await manifestHash(m);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(await manifestHash(realityManifest(game)!)).toBe(h);
    const renamed = { ...m, signals: m.signals.map((s, i) => (i ? s : { ...s, id: 'mail.answer.right' })) };
    expect(await manifestHash(renamed)).not.toBe(h);
  });
});

// Killed mutants (4.3.0 reread of the exemptions): the decoders are strict on their own, not only behind the callers'
// checks. `b64url` and `importBridgeKey` are public; a header is read before any key is chosen.
describe('the protocol decoders, strict on their own', () => {
  const bytes = (s: string, extra: number[] = []) => {
    const pre = new TextEncoder().encode(s);
    return Uint8Array.from([...pre, ...extra]);
  };
  const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64url');

  it('b64url refuses standard base64 and whitespace, which atob would take', async () => {
    const { b64url } = await import('@engine/reality/protocol');
    expect(() => b64url.decode('ab+/')).toThrow('not base64url');
    expect(() => b64url.decode('ab cd')).toThrow('not base64url');
    expect(b64url.decode('ab-_')).toHaveLength(3);
  });

  it('a header that is not UTF-8 is unreadable, not a key of another name', async () => {
    const kid = corpus.keys[0]!.kid;
    const h = b64(bytes(`{"alg":"EdDSA","kid":"${kid}`, [0xff, 0x22, 0x7d]));
    const r = await verifySignal(`${h}.e30.AAAA`, await keyring(), {
      ...corpus.expect,
      signals: new Set(corpus.expect.signals),
    });
    expect(r).toMatchObject({ ok: false, code: 'header' });
  });

  it('imports a verification key that cannot be exported', async () => {
    const k = await importBridgeKey('k', corpus.keys[0]!.raw);
    expect(k.key.extractable).toBe(false);
  });
});
