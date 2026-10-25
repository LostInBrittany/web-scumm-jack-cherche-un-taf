// An exemption is not a discharge (4.1.20 PR 2a, plan §7.4): every entry of docs/dev/mutants.json says what kind of
// survivor it is, why, the proof (an argument for an equivalent mutant, a test otherwise), who owns it and the version
// at which it is read again. An entry missing any of them, or whose version came, fails the gate (tools/mutate.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkKnown, type KnownSurvivor } from '../tools/mutate';

const entry = (o: Partial<KnownSurvivor> = {}): KnownSurvivor => ({
  file: 'bridge/src/store-postgres.ts',
  operator: 'operator',
  from: '+',
  to: '-',
  context: 'await new Promise((ok) => setTimeout(ok, 5 + Math.random() * 20));',
  why: 'the back-off before a retry only spaces the attempts; its length is not observable by a test',
  category: 'equivalent',
  proof: 'argument',
  owner: '@wanoo',
  revisit: '4.3.0',
  ...o,
});

describe('an exemption of docs/dev/mutants.json', () => {
  it('is complete: category, why, proof, owner and the version it is read again at', () => {
    expect(checkKnown([entry()], '4.1.20')).toEqual([]);
    for (const k of ['category', 'proof', 'owner', 'revisit'] as const) {
      const { [k]: _, ...rest } = entry();
      expect(checkKnown([rest as KnownSurvivor], '4.1.20').join(), k).toMatch(new RegExp(k));
    }
    expect(checkKnown([entry({ why: 'short' })], '4.1.20').join()).toMatch(/why/);
    expect(checkKnown([entry({ category: 'fine' as never })], '4.1.20').join()).toMatch(/category/);
  });

  it('proves a survivor that is not equivalent by a test that exists', () => {
    expect(checkKnown([entry({ category: 'unreachable', proof: 'argument' })], '4.1.20').join()).toMatch(/proof/);
    expect(checkKnown([entry({ category: 'unreachable', proof: 'tests/no-such.test.ts' })], '4.1.20').join()).toMatch(
      /proof/,
    );
    expect(checkKnown([entry({ category: 'unreachable', proof: 'tests/mutants-json.test.ts' })], '4.1.20')).toEqual([]);
  });

  it('is read again when its version comes: an entry at or past it fails', () => {
    expect(checkKnown([entry({ revisit: '4.2.0' })], '4.1.20')).toEqual([]);
    expect(checkKnown([entry({ revisit: '4.2.0' })], '4.2.0').join()).toMatch(/read again at 4\.2\.0/);
    expect(checkKnown([entry({ revisit: '4.2.0' })], '4.2.1-rc.1').join()).toMatch(/read again/);
    expect(checkKnown([entry({ revisit: 'soon' })], '4.1.20').join()).toMatch(/revisit/);
  });

  it('holds for every entry of the repository', () => {
    const known = JSON.parse(readFileSync('docs/dev/mutants.json', 'utf8')) as KnownSurvivor[];
    const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
    expect(checkKnown(known, version)).toEqual([]);
  });

  it('holds at 4.5.0, its pre-releases included: the 4.5.0 reread left no entry due (4.5.0)', () => {
    const known = JSON.parse(readFileSync('docs/dev/mutants.json', 'utf8')) as KnownSurvivor[];
    for (const v of ['4.5.0-rc.1', '4.5.0', '4.5.9']) expect(checkKnown(known, v), v).toEqual([]);
  });
});
