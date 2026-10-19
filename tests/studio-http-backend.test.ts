// The tools over a Studio Server's API (4.2.3 PR 5, ADR 0029): each backend call is the API route a Studio page would
// call, with the Bearer token asked each time, an operation id on a write, and a refusal said with its status.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRefusal, httpBackend } from '../tools/studio/http-backend';

const calls: { method: string; url: string; body: unknown; auth: string | null; op: string | null }[] = [];
let answer: { status: number; body: unknown } = { status: 200, body: { ok: true } };
vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
  const h = new Headers(init.headers);
  calls.push({
    method: init.method ?? 'GET',
    url,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
    auth: h.get('authorization'),
    op: h.get('x-studio-op'),
  });
  return new Response(JSON.stringify(answer.body), { status: answer.status });
});
afterEach(() => {
  calls.length = 0;
  answer = { status: 200, body: { ok: true } };
});

describe("the tools over a Studio Server's API", () => {
  let n = 0;
  const b = httpBackend({ api: 'https://studio.example/api', token: () => `t${++n}`, author: () => 'agent' });

  it('calls the route a Studio page calls, for each tool', async () => {
    await b.game();
    await b.room('hall/x');
    await b.setLayout('hall', {});
    await b.setText('hall', 'look', 'v');
    await b.setValue('hall', 'stage', 1, true);
    await b.add('hall', { kind: 'prop', id: 'lamp' } as never);
    await b.storyboardRaw();
    await b.setStoryboard({ boards: [] });
    await b.notes();
    await b.addNote({ text: 'hi' });
    await b.validate();
    await b.solve('start', true);
    await b.report!();
    await b.graph!();
    await b.puzzle!('item:key');
    await b.coverage!();
    await b.playtests!();
    await b.ir!();
    await b.lint!(true);
    expect(calls.map((c) => `${c.method} ${c.url.slice('https://studio.example/api/'.length)}`)).toEqual([
      'GET game',
      'GET room/hall%2Fx',
      'PUT room/hall/layout',
      'PUT room/hall/text',
      'PUT room/hall/value',
      'POST room/hall/add',
      'GET storyboard',
      'PUT storyboard',
      'GET notes',
      'POST notes',
      'POST validate',
      'POST solve',
      'POST report',
      'GET graph',
      'POST puzzle',
      'POST coverage',
      'POST playtests',
      'GET ir',
      'POST lint',
    ]);
    expect(calls[3]!.body).toEqual({ path: 'look', value: 'v' });
    expect(calls[4]!.body).toEqual({ path: 'stage', value: 1, dry: true });
    expect(calls[9]!.body).toEqual({ text: 'hi', author: 'agent' });
    expect(calls[11]!.body).toEqual({ from: 'start', prove: true });
    expect(calls[14]!.body).toEqual({ id: 'item:key' });
    expect(calls[18]!.body).toEqual({ prove: true });
    // The token asked for each request; an operation id on writes only.
    expect(calls[0]!.auth).toBe('Bearer t1');
    expect(calls[1]!.auth).toBe('Bearer t2');
    expect(calls[0]!.op).toBeNull();
    expect(calls[2]!.op).toMatch(/^[\w-]{8,64}$/);
    expect(b.author!()).toBe('agent');
  });

  it('refuses a reality policy, which the API does not take, rather than answer without it', async () => {
    await expect(b.solve(undefined, false, 'adversarial' as never)).rejects.toMatchObject({ status: 501 });
    expect(calls).toEqual([]);
  });

  it("says a refusal with the API's status and message", async () => {
    answer = { status: 423, body: { error: 'the notes are held by Léa' } };
    await expect(b.addNote({ text: 'x' })).rejects.toEqual(new ApiRefusal('423: the notes are held by Léa', 423));
    answer = { status: 502, body: 'not json' as never };
    await expect(b.game()).rejects.toThrow(/^502/);
  });
});
