// Who holds what on a shared Studio (4.2.1 PR 7, plan P2, §5; mock-ups "Atelier" and "Conflits"): the spans and their
// leases in a panel, the lease of the room shown in the Rooms tab, and the two refusals a write can meet:
//   - 423, a span another member holds: nothing was applied, the draft is kept here to copy, the member is told when
//     the span is free, an owner may take it over;
//   - 409, a file that changed since it was read: what changed meanwhile is shown (4.2.3, H10: the file at the revision
//     read, and now), the draft is kept, and the member may apply their edit on the latest version (never done for them).
// A write takes its spans by itself (the server claims them with the write); taking a span ahead reserves it.
import { studioFetch } from './api-base';
import type { Lease, Live, Me } from './hosted';
import { changedOnly, lineDiff } from './line-diff';
import { h, modal, toast } from './ui';

/** The spans everyone sees: a room each, then the game's other parts (studio-server/src/ops/spans.ts). */
const GLOBAL_SPANS: [string, string][] = [
  ['items', 'items'],
  ['cast', 'cast'],
  ['rules', 'rules'],
  ['story', 'story and storyboard'],
  ['game', 'game'],
  ['voices', 'voices'],
  ['assets', 'assets'],
  ['notes', 'notes'],
  ['groupings', 'the scenario map'],
  ['playtests', 'playtests'],
  ['reality', 'signals from the world'],
  ['meta', 'the rest'],
];

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await studioFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(data.error ?? r.status));
  return data;
}

export const takeSpan = (span: string) => post('leases', { spans: [span] });
/** Lets a span go; the whole game (`*`, an owner's exclusive lease) is let go through its own route. */
export const releaseSpan = (span: string) =>
  span === '*' ? post('exclusive/release', {}) : post('leases/release', { spans: [span] });
const takeOver = (span: string) => post('leases/takeover', { span });

/** "held by you", "Tom", "free". */
export function leaseText(l: Lease | undefined, me: Me): string {
  if (!l) return 'free';
  return l.holder === me.user.id ? 'held by you' : l.holderName;
}

/** One row: the span, who holds it, what you may do. */
function spanRow(span: string, label: string, live: Live, me: Me): HTMLElement {
  const l = live.leases.find((x) => x.span === span || x.span === '*');
  const mine = l?.holder === me.user.id;
  // The whole game held by an owner (exclusive): only they let it go; no span of it can be taken over alone.
  const whole = l?.span === '*';
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const button =
    me.role === 'reviewer'
      ? null
      : !l
        ? h('button', { type: 'button', onclick: () => void act(() => takeSpan(span), `${label}: yours`) }, 'Take')
        : mine
          ? h(
              'button',
              {
                type: 'button',
                onclick: () =>
                  void act(() => releaseSpan(whole ? '*' : span), whole ? 'the whole game: free' : `${label}: free`),
              },
              whole ? 'Release the whole game' : 'Release',
            )
          : me.role === 'owner' && !whole
            ? h(
                'button',
                {
                  type: 'button',
                  title: 'Take this span from its holder (written in the audit log)',
                  onclick: () => {
                    if (confirm(`Take ${label} from ${l.holderName}? Their unsaved work stays with them.`))
                      void act(() => takeOver(span), `${label}: taken over`);
                  },
                },
                'Take over',
              )
            : null;
  return h(
    'li',
    { class: `span-row${mine ? ' mine' : l ? ' held' : ''}` },
    h('span', { class: 'span-name' }, label),
    h('span', { class: 'span-state' }, l?.span === '*' ? `whole game: ${l.holderName}` : leaseText(l, me)),
    button,
  );
}

/** The spans panel: the rooms, then the game's other parts. */
export function spansPanel(rooms: { id: string; name: string }[], live: Live, me: Me): void {
  const body = h('div', { class: 'spans' });
  const draw = () =>
    body.replaceChildren(
      h('h3', null, 'Rooms'),
      h('ul', null, ...rooms.map((r) => spanRow(`room:${r.id}`, r.id, live, me))),
      h('h3', null, 'The rest of the game'),
      h('ul', null, ...GLOBAL_SPANS.map(([s, label]) => spanRow(s, label, live, me))),
      h(
        'p',
        { class: 'muted small' },
        'A write takes the spans it touches by itself. A lease lasts 120 s and is renewed while you are here; ',
        'a span someone else holds stays readable.',
      ),
    );
  draw();
  const off = live.onChange(draw);
  modal('Spans', body, off);
}

/** The draft of a write that was refused: kept to copy, never lost. */
function draftBox(draft: unknown): HTMLElement {
  const text = typeof draft === 'string' ? draft : JSON.stringify(draft, null, 2);
  return h(
    'div',
    { class: 'draft' },
    h('pre', null, text.length > 4000 ? `${text.slice(0, 4000)}…` : text),
    h(
      'button',
      {
        type: 'button',
        class: 'primary',
        onclick: () =>
          void navigator.clipboard.writeText(text).then(
            () => toast('Draft copied'),
            () => toast('The clipboard is not available here', 'error'),
          ),
      },
      'Copy the draft',
    ),
  );
}

/** 423: the span is someone else's. */
export function lockedDialog(
  refusal: { span?: string; holderName?: string; error?: string },
  draft: unknown,
  o: { live: Live; me: Me; retry: () => Promise<void> },
): void {
  const span = refusal.span ?? '';
  const what =
    span === '*'
      ? 'The whole game'
      : span.startsWith('room:')
        ? `The room ${span.slice(5)}`
        : span
          ? `The span ${span}`
          : 'This part';
  let off = () => {};
  const wait = h(
    'button',
    {
      type: 'button',
      onclick: () => {
        wait.disabled = true;
        wait.textContent = 'You will be told';
        off = o.live.onChange(() => {
          if (o.live.leases.some((l) => (l.span === span || l.span === '*') && l.holder !== o.me.user.id)) return;
          off();
          toast(`${span} is free: you can save your change now`, 'info', 8000);
        });
      },
    },
    'Tell me when it is free',
  );
  const close = modal(
    `${what} is held by ${refusal.holderName ?? 'someone else'}`,
    h(
      'div',
      { class: 'refusal' },
      h(
        'p',
        null,
        'Your change was not applied. Nothing is lost: your draft is kept here, to save when the span is free.',
      ),
      draftBox(draft),
      h(
        'div',
        { class: 'actions' },
        span ? wait : null,
        h(
          'button',
          {
            type: 'button',
            onclick: () =>
              void o.retry().then(
                () => close(),
                (e) => toast((e as Error).message, 'error'),
              ),
          },
          'Try again',
        ),
        o.me.role === 'owner' && span && span !== '*'
          ? h(
              'button',
              {
                type: 'button',
                title: 'Written in the audit log, with the previous holder',
                onclick: () =>
                  void takeOver(span)
                    .then(() => o.retry())
                    .then(
                      () => close(),
                      (e) => toast((e as Error).message, 'error'),
                    ),
              },
              'Take over and save (owner)',
            )
          : null,
      ),
    ),
    () => off(),
  );
}

/** What changed in the file since it was read (H10), from the 409's `before` and `now`, or why it cannot be shown. */
function changedBox(data: Record<string, unknown>): HTMLElement | null {
  if (!('now' in data)) return null;
  const { before, now } = data;
  if (typeof before !== 'string' || typeof now !== 'string')
    return h('p', { class: 'muted' }, 'What changed cannot be shown here (a new, removed or binary file).');
  const d = lineDiff(before, now);
  if (d === 'too long') return h('p', { class: 'muted' }, 'The file is too long to show what changed here.');
  return h(
    'pre',
    { class: 'line-diff' },
    ...changedOnly(d).map((l) =>
      l === '…'
        ? h('span', { class: 'gap' }, '…\n')
        : h('span', { class: { '-': 'del', '+': 'add', ' ': 'same' }[l[0]] }, `${l[0]} ${l[1]}\n`),
    ),
  );
}

/** 409: a file changed since it was read. */
export function conflictDialog(
  data: Record<string, unknown>,
  draft: unknown,
  retry: () => Promise<void>,
  whole = false,
): void {
  const message = String(data.error ?? 'The file changed since you read it.');
  const changed = changedBox(data);
  const close = modal(
    'The file changed since you read it',
    h(
      'div',
      { class: 'refusal' },
      h('p', null, message),
      h(
        'p',
        { class: 'muted' },
        changed
          ? `Someone saved ${String(data.path ?? 'it')} meanwhile (revision ${String(data.head ?? '?')}): this is what changed since you read it at revision ${String(data.readAt ?? '?')}. Your draft is kept: apply it on the latest version, or copy it.`
          : 'Someone saved it meanwhile; their change is being loaded. Your draft is kept here: compare, then try again.',
      ),
      changed,
      draftBox(draft),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            type: 'button',
            onclick: () =>
              void retry().then(
                () => close(),
                (e) => toast((e as Error).message, 'error'),
              ),
          },
          changed
            ? whole
              ? 'Replace with my version (drops their change)'
              : 'Apply my edit on the latest version'
            : 'Try again',
        ),
      ),
    ),
  );
}
