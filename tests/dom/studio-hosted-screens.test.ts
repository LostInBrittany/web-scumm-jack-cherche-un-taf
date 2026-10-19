// @vitest-environment happy-dom
// A hosted Studio's screens (src/studio/hosted.ts, spans.ts, members.ts; 4.2.1 PR 7, the mock-ups of 18 Oct.): who the
// session is and the page it gets; the header (revision, who is here, the member's menu); the spans panel, its
// buttons by who holds what (the whole game included); the refusals' dialogs, the draft kept; the owner's members
// screen. The API is a fake fetch, the stream a fake EventSource.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gateScreen, hostedStudio, type Lease, Live, type Me, whoAmI } from '../../src/studio/hosted';
import { membersPanel } from '../../src/studio/members';
import { conflictDialog, leaseText, lockedDialog, spansPanel } from '../../src/studio/spans';

class FakeSource {
  static last: FakeSource;
  readyState = 1;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  private on = new Map<string, (m: MessageEvent) => void>();
  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  addEventListener(name: string, fn: (m: MessageEvent) => void) {
    this.on.set(name, fn);
  }
  emit(name: string, data: unknown) {
    this.on.get(name)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
  close() {}
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** A fake fetch answering by path; every call is kept. */
function api(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: { path: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      // The page has no hosted meta tag here: the API is the dev server's prefix, read as the Studio Server's.
      const path = new URL(url, 'http://studio.test').pathname.replace(/^\/__studio\/api\//, '/api/');
      calls.push({ path, init });
      const r = routes[path];
      return r ? r(init) : json({ error: 'not found' }, 404);
    }),
  );
  return calls;
}
const me = (role: Me['role'], id = 'u-lea'): Me => ({
  user: { id, email: `${id}@example.org`, name: id === 'u-lea' ? 'Léa' : 'Tom' },
  role,
});
const lease = (span: string, holder: string, holderName: string): Lease => ({
  span,
  holder,
  holderName,
  fence: 1,
  until: 0,
});
const flush = () => new Promise((ok) => setTimeout(ok, 0));
/** A live state with these leases and people here (a stream that said hello). */
async function liveWith(leases: Lease[] = [], here: { userId: string; name: string; where?: string }[] = []) {
  const live = new Live({ revision: () => undefined });
  live.start('/api/events');
  FakeSource.last.emit('hello', { epoch: 'e1', revision: 7, leases, seq: 0, here: here.map((h) => ({ ...h, at: 0 })) });
  await flush();
  return live;
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeSource);
  document.body.replaceChildren();
});
afterEach(() => vi.unstubAllGlobals());

describe('who the session is, and the page it gets', () => {
  it('tells a member, a stranger, a suspended session, nobody, and a server that does not answer apart', async () => {
    api({ '/auth/me': () => json({ user: { id: 'u', email: 'u@x', name: 'U' }, role: 'dev' }) });
    expect((await whoAmI()).state).toBe('member');
    api({ '/auth/me': () => json({ user: { id: 'u', email: 'u@x', name: 'U' }, role: null }) });
    expect((await whoAmI()).state).toBe('stranger');
    api({ '/auth/me': () => json({ error: 'suspended', suspended: true }, 503) });
    expect((await whoAmI()).state).toBe('suspended');
    api({ '/auth/me': () => json({ error: 'no session' }, 401) });
    expect((await whoAmI()).state).toBe('out');
    // Too many requests from one address (a team behind one gateway) is not a logout.
    api({ '/auth/me': () => json({ error: 'too many requests' }, 429) });
    expect((await whoAmI()).state).toBe('unreachable');
  });

  it('shows the login page, access not granted, the suspended page, and "does not answer"', async () => {
    api({ '/auth/cli': () => json({ issuer: 'https://sso.team.example/realms/x' }) });
    const login = await gateScreen({ state: 'out' });
    expect(login.querySelector('h1')?.textContent).toBe('Log in to work on the game');
    expect(login.querySelector('a.gate-go')?.getAttribute('href')).toMatch(/^\/auth\/login\?returnTo=/);
    expect(login.textContent).toContain('Provider: sso.team.example');
    const stranger = await gateScreen({ state: 'stranger', me: me(null, 'u-sam') });
    expect(stranger.querySelector('h1')?.textContent).toBe('Access not granted');
    expect(stranger.textContent).toContain('u-sam@example.org');
    expect((await gateScreen({ state: 'suspended' })).querySelector('h1')?.textContent).toBe(
      'Identity provider unreachable',
    );
    expect((await gateScreen({ state: 'unreachable' })).querySelector('h1')?.textContent).toBe(
      'The Studio does not answer',
    );
    // An issuer that is no URL leaves the provider unnamed, never a blank page.
    api({ '/auth/cli': () => json({ issuer: 'not a url' }) });
    expect((await gateScreen({ state: 'out' })).querySelector('h1')).not.toBeNull();
  });
});

describe('the header of a shared Studio', () => {
  it('shows the revision, who is here (named for screen readers), and the owner the members', async () => {
    const people = [
      { userId: 'u-lea', name: 'Léa', where: 'Rooms · garden', at: 0 },
      { userId: 'u-tom', name: 'Tom', where: 'Notes', at: 0 },
    ];
    const calls = api({ '/api/presence': () => json({ here: people }) });
    const s = hostedStudio({
      me: me('owner'),
      rooms: [{ id: 'garden', name: 'The garden' }],
      room: () => 'garden',
      where: () => 'Rooms · garden',
      changed: () => undefined,
    });
    FakeSource.last.emit('hello', {
      epoch: 'abcd1234',
      revision: 41,
      leases: [lease('room:garden', 'u-lea', 'Léa')],
      seq: 0,
      here: [
        { userId: 'u-lea', name: 'Léa', where: 'Rooms · garden', at: 0 },
        { userId: 'u-tom', name: 'Tom', where: 'Notes', at: 0 },
      ],
    });
    await flush();
    expect(s.bar.querySelector('.rev strong')?.textContent).toBe('41');
    expect(s.bar.querySelector('.rev')?.classList.contains('up')).toBe(true);
    const avatars = [...s.bar.querySelectorAll('.avatar')].map((a) => a.getAttribute('aria-label'));
    expect(avatars).toEqual(['Léa (you) · Rooms · garden', 'Tom · Notes']);
    expect([...s.bar.querySelectorAll('.menu button')].map((b) => b.textContent)).toEqual([
      'Spans…',
      'Members…',
      'Log out',
    ]);
    expect(s.roomChip.textContent).toContain('garden: held by you');
    expect(calls.some((c) => c.path === '/api/presence')).toBe(true);
    // A cut: the line under the header says so.
    FakeSource.last.onerror?.();
    expect(s.banner.hidden).toBe(false);
    expect(s.banner.textContent).toContain('last revision seen: 41');
  });

  it('gives a dev no members screen', () => {
    api({ '/api/presence': () => json({ here: [] }) });
    const s = hostedStudio({
      me: me('dev'),
      rooms: [],
      room: () => 'garden',
      where: () => '',
      changed: () => undefined,
    });
    expect([...s.bar.querySelectorAll('.menu button')].map((b) => b.textContent)).not.toContain('Members…');
  });
});

describe('the spans panel', () => {
  it('offers each member what they may do: take a free span, release their own, an owner a take-over', async () => {
    const live = await liveWith([lease('room:garden', 'u-lea', 'Léa'), lease('room:street', 'u-tom', 'Tom')]);
    spansPanel(
      [
        { id: 'garden', name: 'Garden' },
        { id: 'street', name: 'Street' },
        { id: 'market', name: 'Market' },
      ],
      live,
      me('owner'),
    );
    const row = (name: string) =>
      [...document.querySelectorAll('.span-row')].find((r) => r.querySelector('.span-name')?.textContent === name)!;
    expect(row('garden').querySelector('.span-state')?.textContent).toBe('held by you');
    expect(row('garden').querySelector('button')?.textContent).toBe('Release');
    expect(row('street').querySelector('.span-state')?.textContent).toBe('Tom');
    expect(row('street').querySelector('button')?.textContent).toBe('Take over');
    expect(row('market').querySelector('button')?.textContent).toBe('Take');
    expect(row('playtests')).toBeDefined();
  });

  it('a reviewer gets no button; the whole game held by another owner is never taken over span by span', async () => {
    spansPanel(
      [{ id: 'garden', name: 'Garden' }],
      await liveWith([lease('room:garden', 'u-tom', 'Tom')]),
      me('reviewer'),
    );
    expect(document.querySelectorAll('.span-row button')).toHaveLength(0);
    document.body.replaceChildren();
    spansPanel([{ id: 'garden', name: 'Garden' }], await liveWith([lease('*', 'u-tom', 'Tom')]), me('owner'));
    const garden = document.querySelector('.span-row')!;
    expect(garden.querySelector('.span-state')?.textContent).toBe('whole game: Tom');
    expect(garden.querySelector('button')).toBeNull();
  });

  it('the holder of the whole game releases it through its own route', async () => {
    const calls = api({ '/api/exclusive/release': () => json({ ok: true }) });
    spansPanel([{ id: 'garden', name: 'Garden' }], await liveWith([lease('*', 'u-lea', 'Léa')]), me('owner'));
    const b = document.querySelector<HTMLButtonElement>('.span-row button')!;
    expect(b.textContent).toBe('Release the whole game');
    b.click();
    await flush();
    expect(calls.map((c) => c.path)).toContain('/api/exclusive/release');
  });

  it('says who holds a lease', () => {
    expect(leaseText(undefined, me('dev'))).toBe('free');
    expect(leaseText(lease('items', 'u-lea', 'Léa'), me('dev'))).toBe('held by you');
    expect(leaseText(lease('items', 'u-tom', 'Tom'), me('dev'))).toBe('Tom');
  });
});

describe('a refused write', () => {
  it('423: names the holder, keeps the draft, and an owner may take the span over (never the whole game)', async () => {
    const live = await liveWith([lease('room:street', 'u-tom', 'Tom')]);
    lockedDialog(
      { span: 'room:street', holderName: 'Tom' },
      { text: 'a draft' },
      { live, me: me('owner'), retry: async () => undefined },
    );
    const d = document.querySelector('[role="dialog"]')!;
    expect(d.getAttribute('aria-label')).toBe('The room street is held by Tom');
    expect(d.querySelector('.draft pre')?.textContent).toContain('a draft');
    const buttons = [...d.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons).toContain('Tell me when it is free');
    expect(buttons).toContain('Take over and save (owner)');
    document.body.replaceChildren();
    lockedDialog({ span: '*', holderName: 'Tom' }, {}, { live, me: me('owner'), retry: async () => undefined });
    const whole = document.querySelector('[role="dialog"]')!;
    expect(whole.getAttribute('aria-label')).toBe('The whole game is held by Tom');
    expect([...whole.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Take over and save (owner)');
  });

  it('409: says what changed, keeps the draft, and tries again on request', async () => {
    const retry = vi.fn(async () => undefined);
    conflictDialog({ error: 'items.ts changed since revision 3 (now 4)' }, { name: 'mine' }, retry);
    const d = document.querySelector('[role="dialog"]')!;
    expect(d.textContent).toContain('items.ts changed since revision 3');
    expect(d.querySelector('.draft pre')?.textContent).toContain('mine');
    [...d.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!.click();
    await flush();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('409 with what changed (4.2.3, H10): the lines changed since the revision read, then the edit on the latest', async () => {
    const retry = vi.fn(async () => undefined);
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].join('\n');
    const now = ['a', 'b', 'c', 'D', 'e', 'f', 'g', 'h'].join('\n');
    conflictDialog(
      {
        error: 'rooms/hall.ts changed since revision 3 (now 5)',
        path: 'rooms/hall.ts',
        readAt: 3,
        head: 5,
        before,
        now,
      },
      { name: 'mine' },
      retry,
    );
    const d = document.querySelector('[role="dialog"]')!;
    expect(d.textContent).toContain('revision 5');
    expect([...d.querySelectorAll('.line-diff .del')].map((e) => e.textContent)).toEqual(['- d\n']);
    expect([...d.querySelectorAll('.line-diff .add')].map((e) => e.textContent)).toEqual(['+ D\n']);
    // Two lines of context on each side, the rest said as a gap.
    expect(d.querySelector('.line-diff')!.textContent).toBe('…\n  b\n  c\n- d\n+ D\n  e\n  f\n…\n');
    [...d.querySelectorAll('button')].find((b) => b.textContent === 'Apply my edit on the latest version')!.click();
    await flush();
    expect(retry).toHaveBeenCalledTimes(1);
    document.body.replaceChildren();
    // A whole document sent again replaces the other change: the button says so.
    conflictDialog({ error: 'x', path: 'storyboard.json', readAt: 1, head: 2, before: 'a', now: 'b' }, {}, retry, true);
    expect([...document.querySelectorAll('button')].map((b) => b.textContent)).toContain(
      'Replace with my version (drops their change)',
    );
    document.body.replaceChildren();
    conflictDialog({ error: 'x', path: 'p', readAt: 1, head: 2, before: null, now: 'new' }, {}, retry);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('cannot be shown here');
  });
});

describe("the owner's members screen", () => {
  it('lists the members and their roles, keeps the last owner, says the audit in words, and makes an invitation', async () => {
    const calls = api({
      '/api/members': () =>
        json({
          members: [
            { id: 'u-lea', email: 'lea@example.org', name: 'Léa', role: 'owner', sessions: 2 },
            { id: 'u-tom', email: 'tom@example.org', name: 'Tom', role: 'dev', sessions: 1 },
          ],
          invitations: [{ email: 'sam@example.org', role: 'dev', expiresAt: Date.now() + 86_400_000 }],
        }),
      '/api/audit': () =>
        json({
          entries: [
            { at: Date.now(), actor: 'u-lea', event: 'member-role', detail: { userId: 'u-tom', role: 'dev' } },
            {
              at: Date.now(),
              actor: 'u-lea',
              event: 'lease-takeover',
              detail: { span: 'room:market', previous: 'u-tom' },
            },
            { at: Date.now(), actor: null, event: 'backchannel-logout', detail: {} },
          ],
        }),
      '/api/invitations': () => json({ link: 'https://studio.test/auth/login?invite=abc', expiresInDays: 7 }),
    });
    await membersPanel(me('owner'), await liveWith([], [{ userId: 'u-tom', name: 'Tom', where: 'Notes' }]));
    const rows = [...document.querySelectorAll('.members-table tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('the last owner stays');
    expect(rows[0]!.textContent).toContain('End sessions');
    expect(rows[1]!.querySelector('select')?.getAttribute('aria-label')).toBe('Role of Tom');
    expect(rows[1]!.textContent).toContain('here · Notes');
    const audit = [...document.querySelectorAll('.audit li')].map((l) => l.textContent);
    expect(audit[0]).toContain('Léa set Tom to dev');
    expect(audit[1]).toContain('Léa took room:market over from Tom');
    expect(audit[2]).toContain('the identity provider ended sessions');
    expect(document.body.textContent).toContain('sam@example.org · dev');
    const form = document.querySelector<HTMLFormElement>('form.invite')!;
    form.querySelector<HTMLInputElement>('input[type=email]')!.value = 'ana@example.org';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('.invite-link input')?.value).toBe(
        'https://studio.test/auth/login?invite=abc',
      ),
    );
    const sent = calls.find((c) => c.path === '/api/invitations')!;
    expect(JSON.parse(String(sent.init?.body))).toEqual({ email: 'ana@example.org', role: 'dev' });
    expect(new Headers(sent.init?.headers).get('x-studio-request')).toBe('1');
  });

  it('changes a role only once the owner said yes', async () => {
    const calls = api({
      '/api/members': () =>
        json({
          members: [
            { id: 'u-lea', email: 'lea@example.org', name: 'Léa', role: 'owner', sessions: 1 },
            { id: 'u-tom', email: 'tom@example.org', name: 'Tom', role: 'dev', sessions: 1 },
          ],
          invitations: [],
        }),
      '/api/audit': () => json({ entries: [] }),
      '/api/members/u-tom': () => json({ ok: true }),
    });
    await membersPanel(me('owner'), await liveWith());
    const select = () => document.querySelector<HTMLSelectElement>('select[aria-label="Role of Tom"]')!;
    vi.stubGlobal('confirm', () => false);
    select().value = 'reviewer';
    select().dispatchEvent(new Event('change'));
    await flush();
    expect(calls.some((c) => c.path === '/api/members/u-tom')).toBe(false);
    vi.stubGlobal('confirm', () => true);
    await vi.waitFor(() => expect(select()).toBeTruthy());
    select().value = 'reviewer';
    select().dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(calls.some((c) => c.path === '/api/members/u-tom')).toBe(true));
  });
});
