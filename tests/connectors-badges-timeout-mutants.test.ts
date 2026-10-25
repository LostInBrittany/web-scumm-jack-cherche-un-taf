// The request's own `timeout` of SafeFetcher.once (4.4.0, the mutation exemptions read again): the socket's idle
// timer is armed in the request's constructor, before the whole-exchange timer, with the same delay, so on a connect
// that never completes (a host that drops the SYN) it is the one that fires first. A local server always connects,
// so the event is emitted on the request itself, through node:http's `request` passed through.
import { createServer, type ClientRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ last: undefined as ClientRequest | undefined }));
vi.mock('node:http', async (original) => {
  const m = await original<typeof import('node:http')>();
  return {
    ...m,
    request: (...a: Parameters<typeof m.request>) => {
      seen.last = m.request(...a);
      return seen.last;
    },
  };
});
const { SafeFetcher } = await import('../connectors/src/badges/fetch');

const server = createServer(() => {
  /* never answers */
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('SafeFetcher, the request timing out first', () => {
  it('answers "timed out" as a failure, never as a document', async () => {
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const { port } = server.address() as AddressInfo;
    const f = new SafeFetcher({
      hosts: ['local.test'],
      resolve: async () => ['127.0.0.1'],
      testing: { allowHttp: true, allowAddresses: ['127.0.0.1'] },
      timeoutMs: 60_000,
    });
    const answer = f.get(`http://local.test:${port}/stuck`);
    await vi.waitFor(() => expect(seen.last).toBeDefined());
    seen.last!.emit('timeout');
    expect(await answer).toEqual({ ok: false, reason: 'timed out' });
  });
});
