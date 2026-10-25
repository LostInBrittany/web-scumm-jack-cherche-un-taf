// The leak audit's allowance per game (4.5.1, tools/audit-allow.ts): a blocked word a game may contain, by its SHA-1
// prefix, in its own folder and in the assets built from it, nowhere else.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { allowances, parseAuditAllow } from '../tools/audit-allow';

const h = (t: string) => createHash('sha1').update(t).digest('hex').slice(0, 12);
const BLOCKED = new Set([h('zorglub'), h('bidule')]);
mkdirSync('.cache', { recursive: true });
const root = mkdtempSync(join('.cache', 'audit-allow-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const game = (id: string, allow?: unknown) => {
  mkdirSync(join(root, 'games', id), { recursive: true });
  if (allow !== undefined) writeFileSync(join(root, 'games', id, 'audit-allow.json'), JSON.stringify(allow));
};

describe("a game's allowance in the leak audit", () => {
  it('reads SHA-1 prefixes of blocked words, each with its reason', () => {
    const why = 'a colleague in the game, by chance the same first name';
    expect(parseAuditAllow({ allow: [{ sha1: h('zorglub'), why }] }, BLOCKED)).toEqual([{ sha1: h('zorglub'), why }]);
    expect(parseAuditAllow({ allow: [] }, BLOCKED)).toEqual([]);
  });

  it('refuses a word in clear, a missing reason, and a prefix the audit does not block', () => {
    for (const [bad, why] of [
      [{}, /"allow"/],
      [{ allow: [{ sha1: 'zorglub', why: 'x' }] }, /12 hex/],
      [{ allow: [{ sha1: h('zorglub') }] }, /says why/],
      [{ allow: [{ sha1: h('zorglub'), why: ' ' }] }, /says why/],
      [{ allow: [{ sha1: h('machin'), why: 'x' }] }, /no word the audit blocks/],
    ] as const)
      expect(() => parseAuditAllow(bad, BLOCKED), JSON.stringify(bad)).toThrow(why);
  });

  it('allows the word in its own game and in the assets built from it, nowhere else', () => {
    game('alpha', { allow: [{ sha1: h('zorglub'), why: 'x' }] });
    game('beta');
    const ok = allowances(root, BLOCKED, 'alpha');
    expect(ok('games/alpha/cast.ts').has(h('zorglub'))).toBe(true);
    expect(ok('games/alpha/art/zorglub/r1c1.png').has(h('zorglub'))).toBe(true);
    expect(ok('public/assets/img/zorglub/r1c1.webp').has(h('zorglub'))).toBe(true);
    expect(ok('games/alpha/cast.ts').has(h('bidule'))).toBe(false);
    for (const p of ['games/beta/cast.ts', 'src/engine/core/engine.ts', 'docs/x.md', 'wiki/en/x.md'])
      expect(ok(p).size, p).toBe(0);
    // Built from another game, the assets get none of alpha's allowance.
    expect(allowances(root, BLOCKED, 'beta')('public/assets/img/zorglub/r1c1.webp').size).toBe(0);
    expect(allowances(root, BLOCKED)('public/assets/img/zorglub/r1c1.webp').size).toBe(0);
    // The allowance file allows nothing in itself: a reason that spells the word is still a leak.
    expect(ok('games/alpha/audit-allow.json').size).toBe(0);
    expect(ok('games\\alpha\\audit-allow.json').size).toBe(0);
  });

  it('names the file that is not JSON', () => {
    const r = mkdtempSync(join('.cache', 'audit-allow-json-'));
    try {
      mkdirSync(join(r, 'games', 'delta'), { recursive: true });
      writeFileSync(join(r, 'games', 'delta', 'audit-allow.json'), '{ nope');
      expect(() => allowances(r, BLOCKED)).toThrow(/games\/delta\/audit-allow\.json: not JSON/);
    } finally {
      rmSync(r, { recursive: true, force: true });
    }
  });

  it('stops the audit on a faulty file, naming it', () => {
    game('gamma', { allow: [{ sha1: h('machin'), why: 'x' }] });
    expect(() => allowances(root, BLOCKED, 'alpha')).toThrow(/games\/gamma\/audit-allow\.json/);
  });
});
