// The Studio's structured edit (3.4): a form in a dialog, "Preview" shows the diff the server would write (a dry run),
// "Apply" writes it; the server validates the game after the write and takes back an edit that adds a validation
// error (shown here). Every write can be undone (the header's Undo / Redo, Ctrl/Cmd+Z, Shift for redo).
import { api, ApiError } from './api';
import type { Ed } from './forms';
import { h, modal, toast } from './ui';

export function structuredEdit(o: {
  title: string;
  room: string;
  path: string;
  editor: Ed;
  after?: () => void;
  remove?: boolean;
  /** 4.1.12: the value's problems before anything is sent (a generated form's schema), each naming file, id, field. */
  check?: (value: unknown) => string[];
  /** 4.1.12: the server's validation errors said with the file, the id and the field (`explainErrors`). */
  explain?: (errors: string[]) => string[];
}) {
  const out = h('pre', { class: 'diff', hidden: true });
  const err = h('p', { class: 'error', hidden: true });
  const read = (): { ok: true; v: unknown } | { ok: false } => {
    try {
      const v = o.editor.get();
      const issues = o.check?.(v) ?? [];
      if (issues.length) {
        err.hidden = false;
        err.textContent = issues.join('\n');
        return { ok: false };
      }
      return { ok: true, v };
    } catch (e) {
      err.hidden = false;
      err.textContent = (e as Error).message;
      return { ok: false };
    }
  };
  const call = async (value: unknown, dry: boolean) => {
    err.hidden = true;
    if (!api.setValue) {
      err.hidden = false;
      err.textContent = 'Structured edits need the dev server (npm run studio).';
      return;
    }
    try {
      const r = await api.setValue(o.room, o.path, value, dry);
      if (dry) {
        out.hidden = false;
        out.replaceChildren(
          ...(r.diff ? r.diff.split('\n') : ['(no change)']).map((l) =>
            h(
              'div',
              { class: l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : '' },
              l,
            ),
          ),
        );
        return;
      }
      toast(r.changed ? `${o.room}: ${o.path} written` : 'Nothing changed', r.changed ? 'ok' : 'info');
      close();
      o.after?.();
    } catch (e) {
      err.hidden = false;
      const body = e as ApiError & { body?: { errors?: string[] } };
      err.textContent = e instanceof ApiError ? e.message : String(e);
      if (body.body?.errors) err.textContent += `\n${(o.explain?.(body.body.errors) ?? body.body.errors).join('\n')}`;
    }
  };
  const body = h(
    'div',
    { class: 'structured' },
    o.editor.el,
    err,
    out,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          type: 'button',
          onclick: () => {
            const r = read();
            if (r.ok) void call(r.v, true);
          },
        },
        'Preview the change',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'primary',
          onclick: () => {
            const r = read();
            if (r.ok) void call(r.v, false);
          },
        },
        'Apply',
      ),
      o.remove
        ? h(
            'button',
            {
              type: 'button',
              class: 'danger',
              onclick: () => {
                if (confirm(`Remove ${o.path}?`)) void call(undefined, false);
              },
            },
            'Remove',
          )
        : null,
    ),
  );
  const close = modal(o.title, body);
}

/** The header's Undo / Redo (on a shared Studio, the member's own: 4.2.2), with Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z outside text fields. */
export function undoButtons(after: () => void): HTMLElement | null {
  // A shared Studio's undo is the member's own (4.2.2): their last change, not someone else's.
  if (!api.undo || !api.redo) return null;
  const go = async (dir: 'undo' | 'redo') => {
    try {
      const r = await (dir === 'undo' ? api.undo!() : api.redo!());
      toast(
        r.ok ? `${dir === 'undo' ? 'Undone' : 'Redone'}: ${r.what}` : (r.reason ?? 'nothing to do'),
        r.ok ? 'ok' : 'info',
      );
      if (r.ok) after();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (
      !(e.metaKey || e.ctrlKey) ||
      e.key.toLowerCase() !== 'z' ||
      (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))
    )
      return;
    e.preventDefault();
    void go(e.shiftKey ? 'redo' : 'undo');
  });
  return h(
    'span',
    { class: 'undo' },
    h(
      'button',
      { class: 'small', title: 'Undo the last write (Ctrl/Cmd+Z)', onclick: () => void go('undo') },
      '↶ Undo',
    ),
    h('button', { class: 'small', title: 'Redo (Ctrl/Cmd+Shift+Z)', onclick: () => void go('redo') }, '↷ Redo'),
  );
}
