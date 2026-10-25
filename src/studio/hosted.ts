// The hosted Studio's own screens and live state (4.2.1 PR 7, plan §3, §5, P5, P7; the mock-ups the maintainer
// approved on 18 Oct. 2026). Only on the Studio Server (`hosting.hosted`):
//   - before the Studio: the login page, "access not granted" for someone who is not a member, "session suspended"
//     when the identity provider has not confirmed the session for 15 min;
//   - in the header: the exact revision the editors and reads are at, who is here and where, who you are (with the
//     members for an owner, the spans, the logout);
//   - the live stream (`/api/events`): each committed revision, the leases, who is here; after a cut, what was missed
//     is read from the journal (`/api/ops?after=`), so no change goes unseen; a new epoch reloads the page;
//   - the heartbeat (every 30 s) that says where you are and keeps your leases;
//   - the long jobs' states (4.2.3), passed on to the page as `studio-job` events (jobs.ts).
import { onRefused, waiting } from './api';
import { apiUrl, goLogin, loginUrl, studioFetch } from './api-base';
import { membersPanel } from './members';
import { conflictDialog, leaseText, lockedDialog, spansPanel, takeSpan, releaseSpan } from './spans';

/** A request to the server's own routes (`/auth/…`), with the Studio's header. */
const auth = (path: string, init: RequestInit = {}) =>
  fetch(path, {
    ...init,
    headers: { ...(init.headers as object), 'x-studio-request': '1' },
    credentials: 'same-origin',
  });
import { healthText } from './health-chip';
import { h } from './ui';

export type Role = 'owner' | 'dev' | 'reviewer';
export interface Me {
  user: { id: string; email: string | null; name: string | null };
  role: Role | null;
}
export interface Lease {
  span: string;
  holder: string;
  holderName: string;
  fence: number;
  until: number;
}
export interface Here {
  userId: string;
  name: string;
  where?: string;
  at: number;
}
export interface Revision {
  id: string;
  rev: number;
  author: string;
  paths: string[];
  spans?: string[];
}

/**
 * Starts the page again, once: a revocation can be seen twice (the stream refused, then a reconnection's check), and a
 * second reload in Firefox interrupts the first page's start, dropping what the member did meanwhile.
 */
let reloading = false;
function reloadOnce(): void {
  if (reloading) return;
  reloading = true;
  location.reload();
}

/** Who the session is: a member (`me`), someone logged in but not a member (403), nobody (401), or suspended (503). */
export async function whoAmI(): Promise<
  | { state: 'member'; me: Me }
  | { state: 'stranger'; me: Me }
  | { state: 'out' }
  | { state: 'suspended' }
  | { state: 'unreachable' }
> {
  const r = await auth('/auth/me', { cache: 'no-store' }).catch(() => null);
  if (r?.status === 401) return { state: 'out' };
  const data = (await r?.json().catch(() => ({}))) as (Partial<Me> & { suspended?: boolean }) | undefined;
  if (r?.status === 503 && data?.suspended) return { state: 'suspended' };
  // No answer, too many requests from this address (a team behind one gateway), a server error: not a logout.
  if (!r || !r.ok || !data?.user) return { state: 'unreachable' };
  const me = { user: data.user, role: data.role ?? null } as Me;
  return me.role ? { state: 'member', me } : { state: 'stranger', me };
}

/** The display name of someone: their name, else their email, else "someone". */
const nameOf = (u: { name?: string | null; email?: string | null }) => u.name || u.email || 'someone';

/** A colour per person (stable across sessions), from the night palette. */
const COLOURS = ['#ffd84d', '#7fb2ff', '#c79bff', '#6fdc8c', '#ff9f6b', '#5fd4d4', '#ff7fb2'];
function colourOf(id: string): string {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return COLOURS[n % COLOURS.length]!;
}

/** The page before the Studio: its art, a sentence, a button, the facts. */
function gatePage(...kids: (Node | null)[]): HTMLElement {
  return h(
    'div',
    { class: 'gate' },
    h(
      'div',
      { class: 'gate-card' },
      h(
        'div',
        { class: 'gate-brand' },
        h('img', { src: '/icons/icon-192.png', alt: '', width: '40', height: '40' }),
        h('span', null, "quest'n'click Studio"),
      ),
      ...kids,
    ),
  );
}

/** Nobody is logged in: the provider's login, then back here. */
async function loginScreen(): Promise<HTMLElement> {
  const cli = (await auth('/auth/cli')
    .then((r) => r.json())
    .catch(() => ({}))) as { issuer?: string };
  let provider = '';
  try {
    provider = cli.issuer ? new URL(cli.issuer).host : '';
  } catch {
    /* not a URL: said without it */
  }
  return gatePage(
    h('h1', null, 'Log in to work on the game'),
    h(
      'p',
      null,
      "Access goes through your team's identity provider. Your rights on this project are given by an owner of the Studio.",
    ),
    h('a', { class: 'gate-go', href: loginUrl() }, 'Log in'),
    h(
      'ul',
      { class: 'gate-facts' },
      provider ? h('li', null, `Provider: ${provider} · OpenID Connect`) : null,
      h('li', null, 'The game runs on another origin, apart from your session.'),
    ),
  );
}

/** Logged in, but not a member: nothing of the game is shown. */
function strangerScreen(me: Me): HTMLElement {
  return gatePage(
    h('h1', null, 'Access not granted'),
    h(
      'p',
      null,
      'You are logged in as ',
      h('strong', null, me.user.email ?? nameOf(me.user)),
      ', but you are not a member of this project. No data of the game is shown.',
    ),
    h('p', { class: 'muted' }, 'Ask an owner of the project for an invitation.'),
    h('button', { type: 'button', onclick: () => void logout() }, 'Use another account'),
  );
}

/** The provider has not confirmed the session for 15 min: the Studio waits (fail closed). */
function suspendedScreen(): HTMLElement {
  return gatePage(
    h('h1', null, 'Identity provider unreachable'),
    h(
      'p',
      null,
      'Your access could not be checked again for 15 minutes. For safety, the Studio is paused until the next check succeeds.',
    ),
    h('p', { class: 'muted' }, 'Nothing was sent during the pause.'),
    h(
      'div',
      { class: 'gate-actions' },
      h('button', { type: 'button', class: 'primary', onclick: () => location.reload() }, 'Try again now'),
      h('a', { class: 'gate-alt', href: loginUrl() }, 'Log in again'),
    ),
  );
}

/** Logs out of the Studio, then of the provider. */
async function logout(): Promise<void> {
  const r = await auth('/auth/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }).catch(() => null);
  const data = (await r?.json().catch(() => ({}))) as { redirect?: string } | undefined;
  location.assign(data?.redirect ?? '/');
}

/** What the live stream tells, kept: the revision, the leases, who is here, and whether the stream is up. */
export class Live {
  epoch = '';
  revision = 0;
  leases: Lease[] = [];
  here: Here[] = [];
  /** The revisions' previews (4.2.2): the last ready, the one building, the last failure. */
  preview: PreviewState | null = null;
  /** The game's health by revision (4.2.2): the last verdict, the revision that broke it, a check going on. */
  health: HealthState | null = null;
  up = false;
  /** Revisions committed during a cut that the journal could not give back: only a reload is sure to show them. */
  gap = false;
  private started = false;
  private es?: EventSource;
  private seq = -1;
  private retries = 0;
  private listeners = new Set<() => void>();
  /** While the journal is read after a cut, the stream's revisions wait here, then go through in order. */
  private held: Revision[] | null = null;
  /** One `hello` at a time: a second one waits for the first's catch-up. */
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private o: {
      /** Each committed revision, once, in order (also those read back from the journal after a cut). */
      revision: (r: Revision) => void;
      /** After a reconnection, or when the server refused the stream: is the session still a member's, same role? */
      check?: () => Promise<void>;
      /** A newer preview is ready (4.2.2): the game's frames may load it. */
      previewReady?: (rev: number) => void;
    },
  ) {}

  private setPreview(p: PreviewState | null) {
    const before = this.preview;
    this.preview = p;
    // Another ready preview, or another history (an import, a restore: the old revisions are gone). Not at the first
    // news: the frames are loading the last ready one already.
    if (before && p?.ready != null && (p.ready !== before.ready || p.epoch !== before.epoch))
      this.o.previewReady?.(p.ready);
    this.changed();
  }

  /** Called after every change of what is kept. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private changed() {
    for (const fn of this.listeners) fn();
  }

  start(url: string) {
    const es = new EventSource(url);
    this.es = es;
    es.onopen = () => {
      this.retries = 0;
    };
    es.onerror = () => {
      this.up = false;
      this.changed();
      // A browser retries a stream that dropped, but not one the server refused (401 for a removed member, 503 for a
      // suspended session or a proxy during a deploy) nor, in Firefox, one it could not open: the page asks who the
      // session is (a login, a gate page, a reload), then opens the stream again, waiting longer each time (30 s).
      if (es.readyState === EventSource.CLOSED && this.es === es) {
        const wait = Math.min(30_000, 1000 * 2 ** this.retries++);
        void this.o.check?.().catch(() => undefined);
        setTimeout(() => this.es === es && this.start(url), wait);
      }
    };
    es.addEventListener('hello', (m) => {
      const d = JSON.parse((m as MessageEvent).data) as Hello;
      this.chain = this.chain.then(() => this.hello(d)).catch(() => undefined);
    });
    es.addEventListener('revision', (m) => {
      const r = JSON.parse((m as MessageEvent).data) as Revision;
      if (this.held) this.held.push(r);
      else this.tell(r);
    });
    es.addEventListener('leases', (m) => {
      const d = JSON.parse((m as MessageEvent).data) as { seq: number; leases: Lease[] };
      if (d.seq <= this.seq) return;
      this.seq = d.seq;
      this.leases = d.leases;
      this.changed();
    });
    es.addEventListener('preview', (m) => this.setPreview(JSON.parse((m as MessageEvent).data) as PreviewState));
    es.addEventListener('health', (m) => {
      this.health = JSON.parse((m as MessageEvent).data) as HealthState;
      this.changed();
    });
    es.addEventListener('presence', (m) => {
      this.here = (JSON.parse((m as MessageEvent).data) as { here: Here[] }).here;
      this.changed();
    });
    // A job's states (4.2.3: prepare, a cut), for whoever follows it (jobs.ts).
    es.addEventListener('job', (m) => {
      window.dispatchEvent(new CustomEvent('studio-job', { detail: JSON.parse((m as MessageEvent).data) }));
    });
  }

  private async hello(d: Hello) {
    if (this.started && this.epoch !== d.epoch) {
      // The game was imported or restored again: what this page holds belongs to another history.
      reloadOnce();
      return;
    }
    const first = !this.started;
    this.started = true;
    this.epoch = d.epoch;
    this.leases = d.leases;
    this.seq = d.seq;
    this.here = d.here;
    this.up = true;
    if (d.preview !== undefined) this.setPreview(d.preview);
    if (d.health !== undefined) this.health = d.health;
    if (first) this.revision = d.revision;
    else {
      void this.o.check?.().catch(() => undefined);
      if (d.revision > this.revision) {
        this.held = [];
        this.changed();
        try {
          await this.catchUp(this.revision);
        } finally {
          const held = this.held;
          this.held = null;
          for (const r of held) this.tell(r);
        }
      }
    }
    this.changed();
  }

  private tell(r: Revision) {
    // At least once, in order: a revision already seen is not told again.
    if (r.rev <= this.revision) return;
    this.revision = r.rev;
    this.o.revision(r);
    this.changed();
  }

  /**
   * What was committed during a cut, from the journal: the stream is not the source, the journal is. A failed read
   * is tried again (five times, waiting longer each time); then the page says it must be reloaded, never a silent gap.
   */
  private async catchUp(after: number) {
    let cursor = after;
    for (let attempt = 0; ; ) {
      let d: { ops: Revision[]; next: number; revision: number };
      try {
        const r = await studioFetch(`ops?after=${cursor}&epoch=${encodeURIComponent(this.epoch)}`, {
          cache: 'no-store',
        });
        if (r.status === 409) return reloadOnce();
        if (!r.ok) throw new Error(`${r.status}`);
        d = (await r.json()) as typeof d;
      } catch {
        if (++attempt >= 5) {
          this.gap = true;
          return;
        }
        await new Promise((ok) => setTimeout(ok, 500 * 2 ** attempt));
        continue;
      }
      for (const op of d.ops) this.tell(op);
      if (!d.ops.length || d.next >= d.revision) {
        // The journal ends where the stream began: anything still missing is a gap, said, never skipped.
        if (this.revision < d.revision) this.gap = true;
        return;
      }
      cursor = d.next;
    }
  }

  /** Who is here, from the heartbeat's answer. */
  setHere(here: Here[]) {
    this.here = here;
    this.changed();
  }

  stop() {
    this.es?.close();
  }
}

interface Hello {
  epoch: string;
  revision: number;
  leases: Lease[];
  seq: number;
  here: Here[];
  preview?: PreviewState | null;
  health?: HealthState | null;
}

/** What the server says of the game's health by revision (studio-server/src/server/health.ts). */
export interface HealthState {
  epoch: string;
  head: number;
  rev: number | null;
  ok: boolean | null;
  errors: string[];
  warnings: number;
  brokenSince: { rev: number; what: string; paths: string[] } | null;
  running: number | null;
  unknown: string | null;
}

/** What the server says of the revisions' previews (studio-server/src/server/previews.ts). */
export interface PreviewState {
  epoch: string;
  head: number;
  ready: number | null;
  building: number | null;
  failed: { rev: number; reason: string } | null;
}

/**
 * The header's part on a hosted Studio: the exact revision (green while the stream is up), who is here and where, who
 * you are with the spans, the members (owner) and the logout.
 */
function hostedBar(o: { live: Live; me: Me; spans: () => void; members: () => void }): HTMLElement {
  const rev = h('span', { class: 'rev', title: 'The last revision this page has seen; the editors follow it' });
  const here = h('span', { class: 'here', role: 'group', 'aria-label': 'Who is here' });
  const health = h('span', { class: 'health', role: 'status' });
  const draw = () => {
    // Written only when it changed: a status region may be read again at each write.
    const ht = healthText(o.live.health);
    if (health.textContent !== ht.text) health.textContent = ht.text;
    health.title = ht.title;
    health.dataset.state = ht.state;
    rev.classList.toggle('up', o.live.up);
    rev.replaceChildren(
      h('span', { class: 'dot', 'aria-hidden': 'true' }),
      'revision ',
      h('strong', null, String(o.live.revision)),
      h('span', { class: 'epoch' }, ` · epoch ${o.live.epoch.slice(0, 4)}`),
      h('span', { class: 'sr-only' }, o.live.up ? '' : ' (reconnecting)'),
    );
    here.replaceChildren(
      ...o.live.here.map((x) => {
        const said = `${x.userId === o.me.user.id ? `${x.name} (you)` : x.name}${x.where ? ` · ${x.where}` : ''}`;
        return h(
          'span',
          { class: 'avatar', role: 'img', 'aria-label': said, title: said, style: { background: colourOf(x.userId) } },
          (x.name.trim()[0] ?? '?').toUpperCase(),
        );
      }),
    );
  };
  o.live.onChange(draw);
  draw();
  const menu = h(
    'details',
    { class: 'who' },
    h('summary', null, `${nameOf(o.me.user)} · ${o.me.role} `, h('span', { 'aria-hidden': 'true' }, '▾')),
    h(
      'div',
      { class: 'menu' },
      h('span', { class: 'muted small' }, o.me.user.email ?? ''),
      h('button', { type: 'button', onclick: () => ((menu.open = false), o.spans()) }, 'Spans…'),
      o.me.role === 'owner'
        ? h('button', { type: 'button', onclick: () => ((menu.open = false), o.members()) }, 'Members…')
        : null,
      h('button', { type: 'button', onclick: () => void logout() }, 'Log out'),
    ),
  );
  return h('div', { class: 'hosted-bar' }, rev, health, here, menu);
}

/** Every 30 s while the page is open: where you are (a tab, a room), which also renews your leases. */
function heartbeat(where: () => string, live: Live): () => void {
  const beat = () =>
    void studioFetch('presence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ where: where() }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { here?: Here[] } | null) => {
        if (d?.here) live.setHere(d.here);
      })
      .catch(() => undefined);
  beat();
  setInterval(beat, 30_000);
  return beat;
}

/** The page shown instead of the Studio when the session is not a member's. */
export async function gateScreen(
  who: Exclude<Awaited<ReturnType<typeof whoAmI>>, { state: 'member' }>,
): Promise<HTMLElement> {
  if (who.state === 'stranger') return strangerScreen(who.me);
  if (who.state === 'suspended') return suspendedScreen();
  if (who.state === 'unreachable')
    return gatePage(
      h('h1', null, 'The Studio does not answer'),
      h('p', null, 'It may be starting, or too busy for a moment. Nothing of yours is lost.'),
      h('button', { type: 'button', class: 'primary', onclick: () => location.reload() }, 'Try again'),
    );
  return loginScreen();
}

/**
 * Everything a hosted Studio adds to the page: the bar (revision, who is here, you), the line that says when the stream
 * is cut or writes are waiting, the lease of the room shown, the preview's label, the heartbeat, and the dialogs
 * of a refused write. `changed`: a file a committed revision touched, with its author.
 */
export function hostedStudio(o: {
  me: Me;
  rooms: { id: string; name: string }[];
  /** The room shown in the Rooms tab, and the tab shown: where you are, for the others. */
  room: () => string;
  where: () => string;
  changed: (file: string, author: string) => void;
  /** A newer preview is ready: the room view reloads unless a placement is not saved. */
  previewReady?: (rev: number) => void;
}): {
  bar: HTMLElement;
  banner: HTMLElement;
  roomChip: HTMLElement;
  /** Another room shown: its chip, and where you are for the others. */
  roomShown: () => void;
  /** Another tab shown: where you are for the others. */
  moved: () => void;
  previewLabel: (frame: HTMLIFrameElement) => HTMLElement;
  /** The head as the live stream last said it, and a call after each change: the Check tab's staleness. */
  head: () => number;
  onHead: (fn: () => void) => void;
} {
  const live = new Live({
    revision: (r) => r.paths.forEach((f) => o.changed(f, r.author)),
    // A removed member, a role changed, a session ended or suspended: the page starts again from who the session is.
    check: async () => {
      const who = await whoAmI();
      if (who.state === 'out') goLogin();
      else if (who.state === 'unreachable') return;
      else if (who.state !== 'member' || who.me.role !== o.me.role) reloadOnce();
    },
    previewReady: (rev) => o.previewReady?.(rev),
  });
  live.start(apiUrl('events'));
  const beat = heartbeat(o.where, live);
  onRefused((r) => {
    if (r.status === 423) lockedDialog(r.data, r.draft, { live, me: o.me, retry: r.retry });
    else conflictDialog(r.data, r.draft, r.retry, r.whole);
  });
  const banner = h('div', { class: 'pending', role: 'status', hidden: true });
  const drawBanner = () => {
    const cut = !live.up && live.revision > 0;
    banner.hidden = !live.gap && !cut && waiting.count === 0;
    banner.classList.toggle('cut', cut || live.gap);
    if (live.gap)
      return banner.replaceChildren(
        'Some changes made while the connection was cut could not be read back. ',
        h('button', { type: 'button', onclick: () => location.reload() }, 'Reload the Studio'),
      );
    banner.textContent = cut
      ? `Reconnecting… last revision seen: ${live.revision}. Nothing is lost: what changed meanwhile is read from the journal.`
      : `${waiting.count} change${waiting.count > 1 ? 's' : ''} not answered yet, sent again with the same id: each applies once.`;
  };
  live.onChange(drawBanner);
  waiting.changed = drawBanner;
  // The room shown: who holds it, and taking or letting it go.
  const roomChip = h('span', { class: 'lease-chip' });
  const drawChip = () => {
    const span = `room:${o.room()}`;
    const l = live.leases.find((x) => x.span === span || x.span === '*');
    const mine = l?.holder === o.me.user.id;
    roomChip.className = `lease-chip${mine ? ' mine' : l ? ' held' : ''}`;
    roomChip.replaceChildren(
      `${o.room()}: ${leaseText(l, o.me)}`,
      o.me.role === 'reviewer' || (l && !mine)
        ? ''
        : h(
            'button',
            {
              type: 'button',
              class: 'link',
              onclick: () => void (mine ? releaseSpan(l?.span ?? span) : takeSpan(span)).catch(() => undefined),
            },
            mine ? ' Release' : ' Take',
          ),
    );
  };
  live.onChange(drawChip);
  drawChip();
  const bar = hostedBar({
    live,
    me: o.me,
    spans: () => spansPanel(o.rooms, live, o.me),
    members: () => void membersPanel(o.me, live),
  });
  /** "preview of revision N", and what comes next: a build running, a revision that does not build. */
  const previewLabel = (frame: HTMLIFrameElement) => {
    const TITLE = 'The game as built at that revision; a newer one replaces it once built';
    const label = h('span', { class: 'preview-label', title: TITLE });
    let at: number | null = null;
    const draw = () => {
      const p = live.preview;
      if (at === null) {
        label.textContent = p?.building != null ? `preview of revision ${p.building} being prepared…` : 'preview';
        return;
      }
      const parts = [`preview of revision ${at}`];
      if (p?.building != null && p.building > at) parts.push(`revision ${p.building} building…`);
      else if (p?.ready != null && p.ready > at) parts.push(`revision ${p.ready} ready: reload to see it`);
      // The reason can be a whole build log: its first line here, all of it on hover.
      const failed = p?.failed && p.failed.rev > at ? p.failed : null;
      if (failed) parts.push(`revision ${failed.rev} does not build: ${failed.reason.split('\n')[0]!.slice(0, 120)}`);
      label.textContent = parts.join(' · ');
      label.title = failed ? failed.reason : TITLE;
    };
    // The frame is on another origin: the revision it loaded is the last ready when it loaded (the server sends `/`
    // to that one).
    frame.addEventListener('load', () => {
      at = live.preview?.ready ?? null;
      draw();
    });
    live.onChange(draw);
    draw();
    return label;
  };
  return {
    bar,
    banner,
    roomChip,
    roomShown: () => {
      drawChip();
      beat();
    },
    moved: beat,
    previewLabel,
    head: () => live.revision,
    onHead: (fn: () => void) => void live.onChange(fn),
  };
}
