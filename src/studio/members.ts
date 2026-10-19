// The project's members, for an owner (4.2.1 PR 7, plan §3.3, §3.7; mock-up "Membres"): who is a member and with which
// role, their sessions, whether they are here; changing a role, removing a member, ending their sessions; inviting
// by email (a link used once, 7 days); the invitations not yet used; the audit log. The rights live here, the
// provider gives only the identity. The last owner can be neither demoted nor removed (the server refuses it).
import { studioFetch } from './api-base';
import type { Live, Me, Role } from './hosted';
import { h, modal, select, toast } from './ui';

interface Member {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  sessions: number;
}
interface Invitation {
  email: string;
  role: Role;
  expiresAt: number;
}
interface AuditEntry {
  at: number;
  actor: string | null;
  event: string;
  detail: unknown;
}

const ROLES: [string, string][] = [
  ['owner', 'owner'],
  ['dev', 'dev'],
  ['reviewer', 'reviewer'],
];

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await studioFetch(path, {
    method,
    headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(data.error ?? `${r.status}`);
  return data;
}

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** One audit line, said in words. */
function auditLine(e: AuditEntry, names: Map<string, string>): string {
  const who = e.actor ? (names.get(e.actor) ?? e.actor) : 'someone';
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const target = typeof d.userId === 'string' ? (names.get(d.userId) ?? d.userId) : '';
  const text: Record<string, string> = {
    login: 'logged in',
    logout: 'logged out',
    'login-failed': 'a login was refused',
    'backchannel-logout': 'the identity provider ended sessions',
    invited: `invited ${String(d.email ?? '')} (${String(d.role ?? '')})`,
    'invitation-accepted': `joined as ${String(d.role ?? '')}`,
    'invitation-refused': `an invitation was refused (${String(d.reason ?? '')})`,
    'member-role': `set ${target} to ${String(d.role ?? '')}`,
    'member-removed': `removed ${target}`,
    'sessions-revoked': `ended the sessions of ${target}`,
    'lease-takeover': `took ${String(d.span ?? '')} over${d.previous ? ` from ${names.get(String(d.previous)) ?? String(d.previous)}` : ''}`,
  };
  return `${when(e.at)} · ${who} ${text[e.event] ?? e.event}`;
}

export async function membersPanel(me: Me, live: Live): Promise<void> {
  const body = h('div', { class: 'members' }, h('p', { class: 'muted' }, 'Loading…'));
  let close = () => {};
  let lastLink = '';
  const draw = async () => {
    let data: { members: Member[]; invitations: Invitation[] };
    let audit: AuditEntry[] = [];
    try {
      data = await call('GET', 'members');
      audit = (await call<{ entries: AuditEntry[] }>('GET', 'audit')).entries;
    } catch (e) {
      body.replaceChildren(h('p', { class: 'error' }, (e as Error).message));
      return;
    }
    const names = new Map(data.members.map((m) => [m.id, m.name || m.email || m.id]));
    const owners = data.members.filter((m) => m.role === 'owner').length;
    const act = async (fn: () => Promise<unknown>, done: string) => {
      try {
        await fn();
        toast(done);
      } catch (e) {
        toast((e as Error).message, 'error');
      }
      await draw();
    };
    const row = (m: Member) => {
      const here = live.here.find((x) => x.userId === m.id);
      const last = m.role === 'owner' && owners === 1;
      const label = m.name || m.email || m.id;
      return h(
        'tr',
        null,
        h(
          'td',
          null,
          h('strong', null, label),
          h('br'),
          h('span', { class: 'muted small' }, `${m.email ?? ''}${m.id === me.user.id ? ' · you' : ''}`),
        ),
        h(
          'td',
          null,
          last
            ? 'owner'
            : select(
                ROLES,
                m.role,
                (v) => {
                  // A role is a right: changed on purpose only (put back as it was otherwise).
                  if (!confirm(`Make ${label} ${v}?${m.id === me.user.id ? ' This is you.' : ''}`)) return void draw();
                  void act(() => call('PUT', `members/${m.id}`, { role: v }), `${label}: ${v}`);
                },
                {
                  'aria-label': `Role of ${label}`,
                },
              ),
        ),
        h('td', null, m.sessions === 1 ? '1 active' : `${m.sessions} active`),
        h('td', { class: here ? 'ok' : 'muted' }, here ? `here · ${here.where ?? 'the Studio'}` : 'away'),
        h(
          'td',
          { class: 'actions' },
          h(
            'button',
            {
              type: 'button',
              onclick: () => {
                if (confirm(`End every session of ${label}? They log in again.`))
                  void act(() => call('DELETE', `members/${m.id}/sessions`), `${label}: logged out`);
              },
            },
            'End sessions',
          ),
          last
            ? h('span', { class: 'muted small' }, 'the last owner stays')
            : [
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'danger',
                    onclick: () => {
                      if (confirm(`Remove ${label} from the project? Their access ends at their next request.`))
                        void act(() => call('DELETE', `members/${m.id}`), `${label}: removed`);
                    },
                  },
                  'Remove',
                ),
              ],
        ),
      );
    };
    const email = h('input', { type: 'email', id: 'inv-mail', placeholder: 'first@team.example', required: true });
    let role = 'dev';
    // The link just made, shown again after the screen is redrawn (until the screen is closed).
    const link = h('div', { class: 'invite-link' });
    if (lastLink)
      link.replaceChildren(
        h('input', { type: 'text', readonly: true, value: lastLink, 'aria-label': 'Invitation link' }),
        h(
          'button',
          {
            type: 'button',
            onclick: () => void navigator.clipboard.writeText(lastLink).then(() => toast('Link copied')),
          },
          'Copy',
        ),
        h(
          'p',
          { class: 'muted small' },
          'Send it to them yourself: it is used once, within 7 days, by that verified email.',
        ),
      );
    const invite = h(
      'form',
      {
        class: 'invite',
        onsubmit: (e: Event) => {
          e.preventDefault();
          void call<{ link: string }>('POST', 'invitations', { email: email.value.trim(), role }).then(
            (r) => {
              lastLink = r.link;
              void draw();
            },
            (err) => toast((err as Error).message, 'error'),
          );
        },
      },
      h('h3', null, 'Invite'),
      h('label', { for: 'inv-mail' }, 'Email (verified at the provider)'),
      email,
      h(
        'label',
        null,
        'Role ',
        select(ROLES, role, (v) => (role = v), { 'aria-label': 'Role of the invitation' }),
      ),
      h('button', { type: 'submit', class: 'primary' }, 'Create the invitation link'),
      link,
    );
    body.replaceChildren(
      h('p', { class: 'muted small' }, 'The rights are given here; the identity provider only says who people are.'),
      h(
        'table',
        { class: 'members-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, 'Person'),
            h('th', null, 'Role'),
            h('th', null, 'Sessions'),
            h('th', null, 'Now'),
            h('th', null, h('span', { class: 'sr-only' }, 'Actions')),
          ),
        ),
        h('tbody', null, ...data.members.map(row)),
      ),
      h(
        'div',
        { class: 'members-grid' },
        invite,
        h(
          'div',
          null,
          h('h3', null, 'Invitations not used yet'),
          data.invitations.length
            ? h(
                'ul',
                null,
                ...data.invitations.map((i) => h('li', null, `${i.email} · ${i.role} · until ${when(i.expiresAt)}`)),
              )
            : h('p', { class: 'muted small' }, 'None.'),
          h('h3', null, 'Audit log'),
          h('ul', { class: 'audit' }, ...audit.slice(0, 30).map((e) => h('li', null, auditLine(e, names)))),
        ),
      ),
    );
  };
  close = modal('Members', body);
  void close;
  await draw();
}
