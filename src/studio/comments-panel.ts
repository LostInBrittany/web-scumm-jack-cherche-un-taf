// Comments, in a hosted Studio's Notes tab (4.2.3 PR 3, H2): the threads by what they are about (a stable id of the
// game, or the game), each with its revision, an orphan said as such (its anchor gone), a reply, resolve or open again;
// a new comment on an id; an owner brings the notes of notes.json in. A reviewer comments too: no game file is written.
import { studioFetch } from './api-base';
import { h, toast } from './ui';

interface CommentInfo {
  id: string;
  anchor: string;
  rev: number;
  parent: string | null;
  author: string;
  text: string;
  resolved: boolean;
  at: number;
  orphan: boolean;
}

async function json<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await studioFetch(path, {
    method,
    ...(method === 'GET' ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
  });
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(d.error ?? `${r.status} ${r.statusText}`);
  return d;
}

export function commentsPanel(o: { owner: boolean }): HTMLElement {
  const threads = h('div', { class: 'threads' });
  const anchor = h('input', { 'aria-label': 'about', placeholder: 'about: a room, an id (empty: the game)' });
  const text = h('textarea', { 'aria-label': 'comment', rows: 2, placeholder: 'A comment' });
  const send = h('button', { type: 'button', class: 'primary' }, 'Comment');
  const importNotes = h('button', { type: 'button' }, 'Bring the notes in');
  const draw = async () => {
    try {
      const { comments } = await json<{ comments: CommentInfo[] }>('comments');
      const heads = comments.filter((c) => !c.parent);
      threads.replaceChildren(
        ...(heads.length
          ? heads.map((t) => {
              const replies = comments.filter((c) => c.parent === t.id);
              const reply = h('input', { 'aria-label': 'reply', placeholder: 'Reply' });
              return h(
                'div',
                { class: `thread${t.resolved ? ' resolved' : ''}`, 'data-comment': t.id },
                h(
                  'p',
                  { class: 'muted small' },
                  t.anchor ? h('code', null, t.anchor) : 'the game',
                  t.orphan ? h('span', { class: 'warn' }, ' · orphan: the game no longer names it') : null,
                  ` · revision ${t.rev}`,
                  t.resolved ? ' · resolved' : null,
                ),
                ...[t, ...replies].map((c) => h('p', null, h('strong', null, c.author), ` ${c.text}`)),
                h(
                  'p',
                  null,
                  reply,
                  h(
                    'button',
                    {
                      type: 'button',
                      onclick: async () => {
                        if (!reply.value.trim()) return;
                        await act(() => json('comments', 'POST', { parent: t.id, text: reply.value }));
                      },
                    },
                    'Reply',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onclick: () => act(() => json(`comments/${t.id}`, 'PUT', { resolved: !t.resolved })),
                    },
                    t.resolved ? 'Open again' : 'Resolve',
                  ),
                ),
              );
            })
          : [h('p', { class: 'muted' }, 'No comment yet.')]),
      );
    } catch (e) {
      threads.replaceChildren(h('p', { class: 'muted' }, `Comments unavailable: ${(e as Error).message}`));
    }
  };
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    await draw();
  };
  send.onclick = () =>
    act(async () => {
      await json('comments', 'POST', { anchor: anchor.value, text: text.value });
      text.value = '';
    });
  importNotes.onclick = () =>
    act(async () => {
      const r = await json<{ imported: number; already: number }>('comments/import-notes', 'POST');
      toast(`${r.imported} notes brought in (${r.already} already there)`, 'ok');
    });
  void draw();
  return h(
    'section',
    { class: 'panel comments-panel' },
    h('h3', null, 'Comments'),
    h('p', null, anchor, ' ', text, ' ', send, o.owner ? [' ', importNotes] : []),
    threads,
  );
}
