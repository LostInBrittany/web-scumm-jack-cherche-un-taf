// The Studio's simulated Bridge (src/engine/reality/simulator.ts): a wait on an empty queue that a signal ends removes
// its abort listener (4.4.0, the second reading of the 4.4.0 mutation reread: `once` alone kept one per wait, as the
// Reality port's sleep did).
import { describe, expect, it } from 'vitest';
import { SignalSimulator } from '@engine/reality/simulator';
import { signals } from './fixtures/signals';

describe('the simulator', () => {
  it('leaves no abort listener behind a wait a signal ended', async () => {
    const sim = await SignalSimulator.create(signals());
    const ac = new AbortController();
    let held = 0;
    const add = ac.signal.addEventListener.bind(ac.signal);
    const remove = ac.signal.removeEventListener.bind(ac.signal);
    ac.signal.addEventListener = ((t: string, l: EventListener, o?: AddEventListenerOptions) => {
      if (t === 'abort') held++;
      add(t, l, o);
    }) as typeof ac.signal.addEventListener;
    ac.signal.removeEventListener = ((t: string, l: EventListener, o?: EventListenerOptions) => {
      if (t === 'abort') held--;
      remove(t, l, o);
    }) as typeof ac.signal.removeEventListener;
    const it = sim
      .port()
      .connect({ signal: ac.signal } as never)
      [Symbol.asyncIterator]();
    const id = sim.signals[0]!;
    for (let i = 0; i < 3; i++) {
      const next = it.next();
      await new Promise((r) => setTimeout(r, 0));
      await sim.inject(id);
      expect((await next).done).toBe(false);
    }
    expect(held).toBe(0);
    const waiting = it.next();
    await new Promise((r) => setTimeout(r, 0));
    ac.abort();
    expect((await waiting).done).toBe(true);
  });
});
