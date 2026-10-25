// Rooms tab, the view of texts and commands (4.1.8, programme §4.7: the Studio's biggest owners split into model /
// IO / view): an editable line for a text of the room file (saved on blur or Enter through PUT room/:id/text), the
// "+ line" appender, and a command list drawn as lines and chips, nested for branches, with its timeline. The sheets
// (rooms-sheet.ts) are made of these. The tab (rooms.ts) answers through a host interface: the room shown, its
// texts, the writes and what to do after one.
import type { Cmd, Id, RoomDef } from '@engine/core/types';
import { timeline, type Timeline } from '@engine/tools/timeline';
import { must } from '../engine/core/must';
import { api, type GameInfo, type RoomData, type TextRef } from './api';
import { parseText, renderText } from '@engine/core/text-switch';
import { previewFlags } from './hero-picker';
import { focusEditor } from './rooms-bridge';
import { asList, chipText, condText, MAX_TEXT, speaker, valueAt } from './rooms-text';
import { autoGrow, h, toast } from './ui';

/** What the lines ask of the tab. */
export interface LinesHost {
  readonly info: GameInfo;
  /** The room shown. */
  readonly room: Id;
  /** Its definition, layout and file; null before the first load. */
  readonly data: RoomData | null;
  /** The editable text at a content path, if the room file has a literal there. */
  textAt(path: string): TextRef | undefined;
  /** Before touching the room file (the view reloads when it changes): save the placement in progress. */
  flushEditor(): Promise<void>;
  /** Marks a write as ours, so the file watcher's echo is not announced as an outside change. */
  ownWrite(): void;
  /** Called after every successful write (runs Check in the background). */
  saved(): void;
  /** Re-reads the room and renders it. */
  reload(): Promise<void>;
  /** Renders now if a render was put off while a text was being typed. */
  renderIfPending(): void;
  /** A value written directly at a content path (no form: a select, a duration), validated and undoable. */
  writeValue(path: string, value: unknown): void;
}

// ---------------------------------------------------------------------------
// Text editing
// ---------------------------------------------------------------------------

/** An editable line for the text at `path` (null if the room file has no literal there). */
export function line(
  host: LinesHost,
  path: string,
  opts: { label?: string; color?: string; deletable?: boolean } = {},
): HTMLElement | null {
  const ref = host.textAt(path);
  if (!ref) return null;
  const t = autoGrow(
    h('textarea', {
      rows: 1,
      value: ref.value,
      spellcheck: true,
      'aria-label': `${opts.label ?? ref.kind}: ${path}`,
    }),
  );
  t.defaultValue = ref.value;
  const count = h('span', { class: 'count' });
  const showCount = () => {
    const n = t.value.length;
    count.textContent = n > MAX_TEXT - 20 ? String(n) : '';
    count.classList.toggle('over', n > MAX_TEXT);
  };
  showCount();
  const shown = switchPreview(host, ref.value);
  if (shown) t.addEventListener('input', () => shown.update(t.value));
  const row = h(
    'div',
    { class: 'line', 'data-path': path, title: `${path} · ${ref.file}:${ref.line}` },
    opts.label ? h('span', { class: 'who', style: opts.color ? { color: opts.color } : undefined }, opts.label) : null,
    shown ? h('div', { class: 'txt' }, t, shown.el) : t,
    count,
    opts.deletable
      ? h(
          'button',
          {
            class: 'icon del',
            title: 'Delete this line',
            'aria-label': `Delete ${path}`,
            onclick: () => void write(host, path, null),
          },
          '✕',
        )
      : null,
  );
  const commit = async () => {
    const v = t.value;
    if (v === t.defaultValue) {
      host.renderIfPending();
      return;
    }
    if (!v.trim()) {
      toast('A line cannot be empty (✕ deletes it)', 'error');
      t.value = t.defaultValue;
      return;
    }
    row.classList.add('saving');
    const ok = await write(host, path, v, false);
    row.classList.remove('saving');
    if (ok) {
      t.defaultValue = v;
      ref.value = v;
    }
    host.renderIfPending();
  };
  t.addEventListener('input', showCount);
  t.addEventListener('blur', () => void commit());
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      t.blur();
    } else if (e.key === 'Escape') {
      t.value = t.defaultValue;
      t.blur();
    }
  });
  return row;
}

/**
 * Under a text holding a text switch or `{hero}` (4.3.0), read-only: the text as a player reads it with the values picked
 * in the Play tab's "Text switches" (hero-picker.ts; none picked: each switch's `*=` or first text). The text itself
 * stays as written, braces and all. Null for a text without either.
 */
export function switchPreview(host: Pick<LinesHost, 'info'>, text: string) {
  const p = parseText(text);
  if (!p.switches.length && !p.hero) return null;
  const el = h('div', { class: 'switch-preview muted small' });
  const update = (v: string) => {
    const flags = [...new Set(parseText(v).switches.map((w) => w.flag))];
    const as = flags.map((f) => `${f}=${previewFlags[f] === undefined ? '?' : String(previewFlags[f])}`).join(' ');
    const hero = host.info.characters[host.info.hero ?? '']?.name ?? 'the hero';
    el.textContent = `→ ${renderText(v, previewFlags, hero)}${as ? `  (${as})` : ''}`;
  };
  update(text);
  return { el, update };
}

/** "+ line" input appending to the list at `path` (`look.piano`, `hints[2].lines`). */
export function appender(host: LinesHost, path: string, placeholder: string): HTMLElement {
  const t = h('input', { type: 'text', placeholder, 'aria-label': placeholder });
  const go = async () => {
    const v = t.value.trim();
    if (!v) return;
    if (await write(host, `${path}[+]`, v)) t.value = '';
  };
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void go();
    }
  });
  return h('div', { class: 'line add' }, t, h('button', { onclick: () => void go() }, '+ line'));
}

/** PUT text; `reload` re-reads the room afterwards (needed when paths shift: append, delete). */
async function write(host: LinesHost, path: string, value: string | null, reload = true): Promise<boolean> {
  try {
    await host.flushEditor();
    host.ownWrite();
    const r = await api.setText(host.room, path, value);
    if (r.changed) {
      toast(
        `${value === null ? 'Deleted' : path.endsWith('[+]') ? 'Added' : 'Saved'} · ${host.data?.file.split('/').pop()}:${r.line}`,
      );
      host.saved();
    }
    if (reload || !r.changed) await host.reload();
    return true;
  } catch (e) {
    toast((e as Error).message, 'error');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Commands as lines
// ---------------------------------------------------------------------------

/** A command list: a line per text (say, toast, guide, option), a chip otherwise, nested for branches. */
export function cmds(host: LinesHost, list: Cmd[] | undefined, path: string): HTMLElement {
  const box = h('div', { class: 'cmds' });
  (list ?? []).forEach((c, i) => {
    const p = `${path}[${i}]`;
    if (typeof c === 'string') {
      const s = speaker(host.info, 'hero');
      box.append(line(host, p, s) ?? h('div', { class: 'chip' }, c));
      return;
    }
    if ('say' in c) {
      const s = speaker(host.info, c.say[0]);
      box.append(line(host, `${p}.say[1]`, s) ?? h('div', { class: 'chip' }, chipText(c)));
      return;
    }
    if ('toast' in c) {
      box.append(line(host, `${p}.toast`, { label: 'toast' }) ?? h('div', { class: 'chip' }, chipText(c)));
      return;
    }
    if ('guide' in c) {
      box.append(line(host, `${p}.guide.say`, { label: 'guide' }) ?? h('div', { class: 'chip' }, chipText(c)));
      return;
    }
    const nest = (label: string, sub: Cmd[] | undefined, subPath: string) =>
      h('div', { class: 'nest' }, h('div', { class: 'chip k' }, label), cmds(host, sub, subPath));
    if ('if' in c && 'then' in c) {
      box.append(nest(`if ${condText(c.if)}`, c.then, `${p}.then`));
      if (c.else) box.append(nest('else', c.else, `${p}.else`));
      return;
    }
    if ('cutscene' in c) {
      box.append(
        h(
          'div',
          { class: 'nest' },
          h('div', { class: 'chip k' }, 'cutscene'),
          timed(host, c.cutscene, `${p}.cutscene`),
        ),
      );
      return;
    }
    if ('once' in c) {
      box.append(nest('once', c.once, `${p}.once`));
      return;
    }
    for (const k of ['nth', 'cycle', 'random', 'parallel'] as const) {
      if (k in c) {
        const branches = must((c as Record<string, Cmd[][]>)[k], `${k} branches`);
        box.append(
          h(
            'div',
            { class: 'nest' },
            h('div', { class: 'chip k' }, k),
            branches.map((b, j) => nest(`${k === 'nth' ? `time ${j + 1}` : `#${j + 1}`}`, b, `${p}.${k}[${j}]`)),
          ),
        );
        return;
      }
    }
    if ('choice' in c) {
      box.append(
        h(
          'div',
          { class: 'nest' },
          h('div', { class: 'chip k' }, 'choice'),
          c.choice.map((o, j) =>
            h(
              'div',
              { class: 'nest' },
              line(host, `${p}.choice[${j}].text`, { label: `option${o.if ? ` (if ${condText(o.if)})` : ''}` }) ??
                h('div', { class: 'chip' }, o.text),
              cmds(host, o.do, `${p}.choice[${j}].do`),
            ),
          ),
        ),
      );
      return;
    }
    if ('phone' in c) {
      box.append(nest(`phone ${asList(c.phone).join(', ')}`, c.do, `${p}.do`));
      return;
    }
    if ('minigame' in c && c.then) {
      box.append(h('div', { class: 'chip' }, chipText(c)), nest('then', c.then, `${p}.then`));
      return;
    }
    if (('ending' in c || 'reveal' in c) && c.after) {
      box.append(h('div', { class: 'chip' }, chipText(c)), nest('after', c.after, `${p}.after`));
      return;
    }
    box.append(h('div', { class: 'chip', 'data-path': p }, chipText(c)));
  });
  return box;
}

/** A command list with a "Timeline" toggle: how long it takes and what overlaps, drawn as bars; tap one to jump to its line. */
export function timed(host: LinesHost, list: Cmd[] | undefined, path: string): HTMLElement {
  const box = cmds(host, list, path);
  if (!list?.length) return box;
  const d = host.data;
  const bars = h('div', { class: 'tl', hidden: true });
  const toggle = h(
    'button',
    {
      class: 'small',
      title: 'How long each command takes on screen, what runs in parallel, where the player is waited for',
      onclick: () => {
        const show = bars.hidden;
        if (show && !bars.childElementCount)
          bars.append(
            ...timelineBars(
              host,
              timeline(list, {
                game: { characters: host.info.characters as unknown as Record<string, { fps?: number }> },
                room: d?.def,
                layout: d?.layout,
                path,
              }),
              box,
            ),
          );
        bars.hidden = !show;
        toggle.textContent = show ? 'Hide timeline' : 'Timeline';
      },
    },
    'Timeline',
  );
  return h('div', { class: 'timed' }, h('div', { class: 'bar small' }, toggle), bars, box);
}

/** Asks for a new duration and writes it where the command keeps it (`wait`, `ms`, or a motion's `ms`). */
function editDuration(host: LinesHost, def: RoomDef | undefined, path: string, kind: string, ms: number) {
  const cmd = valueAt(def, path) as Record<string, unknown> | undefined;
  if (!cmd || typeof cmd !== 'object') return;
  const motion = ['launch', 'spring', 'path', 'follow'].find((k) => k in cmd);
  const where =
    'wait' in cmd
      ? `${path}.wait`
      : motion
        ? `${path}.${motion}.ms`
        : kind === 'anim' || 'anim' in cmd
          ? `${path}.ms`
          : null;
  if (!where) {
    toast("This bar's length comes from its text or its walk: edit those", 'info');
    return;
  }
  const v = prompt(`Duration of ${path} (ms)`, String(Math.round(ms)));
  if (v === null || !/^\d+$/.test(v.trim())) return;
  host.writeValue(where, Number(v));
}

function timelineBars(host: LinesHost, t: Timeline, list: HTMLElement): HTMLElement[] {
  const total = Math.max(t.total, 1);
  const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const rows: HTMLElement[] = [];
  for (let lane = 0; lane < t.lanes; lane++) {
    const row = h('div', { class: 'tlrow' });
    for (const it of t.items.filter((x) => x.lane === lane)) {
      const w = it.open ? 2 : Math.max(0.6, ((it.end - it.start) / total) * 100);
      row.append(
        h(
          'span',
          {
            class: `tlbar k-${it.kind}${it.open ? ' open' : ''}${it.estimated ? ' est' : ''}`,
            style: { left: `${(it.start / total) * 100}%`, width: `${w}%` },
            title: `${it.label} · ${s(it.start)} → ${it.open ? 'the player' : s(it.end)}${it.estimated ? ' (estimated)' : ''}`,
            onclick: () => {
              const el = list.querySelector<HTMLElement>(`[data-path="${CSS.escape(it.path)}"]`);
              if (el) focusEditor(el);
            },
            // 3.4: a timed command's duration is editable here (double-click: a wait, an animation, a motion).
            ondblclick: () => editDuration(host, host.data?.def, it.path, it.kind, it.end - it.start),
          },
          it.label,
        ),
      );
    }
    rows.push(row);
  }
  rows.push(
    h(
      'div',
      { class: 'muted small' },
      `${t.openEnded ? `at least ${s(t.total)}, then the player` : s(t.total)} · ${t.items.filter((x) => x.kind === 'say').length} lines`,
    ),
  );
  return rows;
}
