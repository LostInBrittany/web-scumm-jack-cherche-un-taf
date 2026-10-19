// @vitest-environment happy-dom
// The Comments panel (4.2.3 PR 3, H2): the threads with their anchor and revision, an orphan said, a reply, resolve and
// open again, a new comment; an owner brings the notes in; a refusal said.
import { afterEach, describe, expect, it, vi } from 'vitest';

const sent: { method: string; path: string; body: unknown }[] = [];
let comments: unknown[] = [];
let refuse: string | null = null;
vi.mock('../../src/studio/api-base', () => ({
  studioFetch: async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    sent.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (refuse && method !== 'GET') return new Response(JSON.stringify({ error: refuse }), { status: 403 });
    if (path === 'comments/import-notes') return new Response(JSON.stringify({ imported: 2, already: 1 }));
    return new Response(JSON.stringify(method === 'GET' ? { comments } : {}));
  },
}));
const { commentsPanel } = await import('../../src/studio/comments-panel');
const flush = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => {
  sent.length = 0;
  refuse = null;
  document.body.replaceChildren();
});
const click = (el: Element, label: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent === label)!.click();

describe('the Comments panel', () => {
  it('shows each thread on its anchor and revision, an orphan said; replies, resolves, comments', async () => {
    comments = [
      {
        id: 'c1',
        anchor: 'hall.door',
        rev: 3,
        parent: null,
        author: 'Ana',
        text: 'creak',
        resolved: false,
        at: 1,
        orphan: false,
      },
      {
        id: 'c2',
        anchor: 'hall.door',
        rev: 4,
        parent: 'c1',
        author: 'Léa',
        text: 'done',
        resolved: false,
        at: 2,
        orphan: false,
      },
      {
        id: 'c3',
        anchor: 'gone.id',
        rev: 2,
        parent: null,
        author: 'Tom',
        text: 'old',
        resolved: true,
        at: 0,
        orphan: true,
      },
    ];
    const el = commentsPanel({ owner: false });
    document.body.append(el);
    await flush();
    const [t1, t3] = [...el.querySelectorAll('.thread')];
    expect(t1!.textContent).toContain('hall.door · revision 3');
    expect(t1!.textContent).toContain('Ana creak');
    expect(t1!.textContent).toContain('Léa done');
    expect(t3!.textContent).toContain('orphan: the game no longer names it');
    expect(t3!.classList.contains('resolved')).toBe(true);
    (t1!.querySelector('input') as HTMLInputElement).value = 'thanks';
    click(t1!, 'Reply');
    await flush();
    expect(sent.at(-2)).toEqual({ method: 'POST', path: 'comments', body: { parent: 'c1', text: 'thanks' } });
    click(el.querySelectorAll('.thread')[0]!, 'Resolve');
    await flush();
    expect(sent.at(-2)).toEqual({ method: 'PUT', path: 'comments/c1', body: { resolved: true } });
    click(el.querySelectorAll('.thread')[1]!, 'Open again');
    await flush();
    expect(sent.at(-2)).toEqual({ method: 'PUT', path: 'comments/c3', body: { resolved: false } });
    (el.querySelector('input[aria-label="about"]') as HTMLInputElement).value = 'hall';
    (el.querySelector('textarea') as HTMLTextAreaElement).value = 'new one';
    click(el, 'Comment');
    await flush();
    expect(sent.at(-2)).toEqual({ method: 'POST', path: 'comments', body: { anchor: 'hall', text: 'new one' } });
    expect([...el.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Bring the notes in');
  });

  it('brings the notes in for an owner, says a refusal, and says when there is nothing', async () => {
    comments = [];
    const el = commentsPanel({ owner: true });
    document.body.append(el);
    await flush();
    expect(el.textContent).toContain('No comment yet.');
    click(el, 'Bring the notes in');
    await flush();
    expect(document.body.textContent).toContain('2 notes brought in (1 already there)');
    refuse = 'this needs the role owner';
    click(el, 'Bring the notes in');
    await flush();
    expect(document.body.textContent).toContain('this needs the role owner');
  });
});
