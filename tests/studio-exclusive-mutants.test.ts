// The project's exclusive lease around a member's long operation (4.2.3, studio-server/src/server/leases.ts
// `exclusiveRunner`), pinned for the mutation set `studio-auth`: without a claimant, the operation alone; taken and
// given back when the member did not hold it, neither when they did (another's `*`, or another span of theirs, is not
// holding it); two of theirs at once share one taking, given back by the last; renewed while it runs, a failed renewal
// logged with its message.
import { describe, expect, it } from 'vitest';
import { exclusiveRunner } from '../studio-server/src/server/leases';

const lea = { userId: 'u-lea', name: 'Léa' };

function fake(held: { span: string; holder: string }[] = [], renew: () => Promise<number> = async () => 1) {
  const calls: string[] = [];
  const leases = {
    list: async () => {
      calls.push('list');
      return held as never;
    },
    take: async (who: { userId: string }, spans: string[]) => {
      calls.push(`take ${who.userId} ${spans.join(',')}`);
      return {};
    },
    renew: async (userId: string) => {
      calls.push(`renew ${userId}`);
      return renew();
    },
    release: async (userId: string, spans?: string[]) => {
      calls.push(`release ${userId} ${spans?.join(',')}`);
    },
  };
  return { leases, calls };
}

const gate = () => {
  let open!: () => void;
  const p = new Promise<void>((ok) => (open = ok));
  return { p, open };
};

describe('the exclusive lease around a long operation', () => {
  it('runs the operation alone without a claimant', async () => {
    const { leases, calls } = fake();
    const run = exclusiveRunner(leases, () => undefined);
    expect(await run(async () => 'done')).toBe('done');
    expect(calls).toEqual([]);
  });

  it('takes `*` and gives it back when the member did not hold it; another holder or span is not theirs', async () => {
    const { leases, calls } = fake([
      { span: '*', holder: 'u-max' },
      { span: 'rooms', holder: 'u-lea' },
    ]);
    const run = exclusiveRunner(leases, () => lea);
    expect(await run(async () => 7)).toBe(7);
    expect(calls).toEqual(['list', 'take u-lea *', 'release u-lea *']);
  });

  it('neither takes nor gives back what the member held before', async () => {
    const { leases, calls } = fake([{ span: '*', holder: 'u-lea' }]);
    const run = exclusiveRunner(leases, () => lea);
    await run(async () => undefined);
    expect(calls).toEqual(['list']);
  });

  it('gives back on a failure too', async () => {
    const { leases, calls } = fake();
    const run = exclusiveRunner(leases, () => lea);
    await expect(run(async () => Promise.reject(new Error('worker down')))).rejects.toThrow('worker down');
    expect(calls).toEqual(['list', 'take u-lea *', 'release u-lea *']);
  });

  it('two of the member at once: one look, given back by the last only', async () => {
    const { leases, calls } = fake();
    const run = exclusiveRunner(leases, () => lea);
    const a = gate();
    const b = gate();
    const first = run(() => a.p);
    await new Promise((ok) => setTimeout(ok, 0));
    const second = run(() => b.p);
    await new Promise((ok) => setTimeout(ok, 0));
    a.open();
    await first;
    expect(calls.filter((c) => c.startsWith('release'))).toEqual([]);
    b.open();
    await second;
    expect(calls.filter((c) => c === 'list')).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('release'))).toEqual(['release u-lea *']);
    // Once all ended, the next one looks again.
    await run(async () => undefined);
    expect(calls.filter((c) => c === 'list')).toHaveLength(2);
  });

  it('renews while it runs, and logs a failed renewal with its message', async () => {
    for (const [failure, message] of [
      [new Error('db away'), 'db away'],
      ['plain', 'plain'],
    ] as const) {
      const log: Record<string, unknown>[] = [];
      const { leases, calls } = fake([], async () => Promise.reject(failure));
      const run = exclusiveRunner(leases, () => lea, { everyMs: 5, log: (l) => void log.push(l) });
      await run(() => new Promise((ok) => setTimeout(ok, 40)));
      expect(calls.some((c) => c === 'renew u-lea')).toBe(true);
      expect(log[0]).toEqual({ event: 'lease-renew-failed', message });
      // Stopped once it ended.
      const n = calls.length;
      await new Promise((ok) => setTimeout(ok, 30));
      expect(calls).toHaveLength(n);
    }
  });
});
