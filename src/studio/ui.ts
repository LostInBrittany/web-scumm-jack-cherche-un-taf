// Tiny DOM helpers for the Studio (no framework).
type Kid = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> | null | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  ...kids: (Kid | Kid[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
    else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled')
      (el as unknown as Record<string, unknown>)[k] = v; // a form control's property, not an attribute
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

export function append(el: Element, kids: (Kid | Kid[])[]) {
  for (const k of kids.flat()) {
    if (k === null || k === undefined || k === false) continue;
    el.append(typeof k === 'number' ? String(k) : k);
  }
}

let stack: HTMLElement | undefined;
/** The bottom-right stack the toasts (and a job's panel, jobs.ts) go in. */
export function toastStack(): HTMLElement {
  if (!stack?.isConnected)
    stack = document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  return stack;
}
/** A short message at the bottom right. */
export function toast(text: string, kind: 'ok' | 'error' | 'info' = 'ok', ms = 2600) {
  const t = h('div', { class: `toast ${kind}` }, text);
  toastStack().append(t);
  setTimeout(
    () => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 300);
    },
    kind === 'error' ? ms * 2 : ms,
  );
}

/** A <select> from [value, label] pairs. */
export function select(options: [string, string][], value: string, onChange: (v: string) => void, attrs: Attrs = {}) {
  const s = h(
    'select',
    attrs,
    options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)),
  );
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

/** Textarea that grows with its content. */
export function autoGrow(t: HTMLTextAreaElement) {
  const fit = () => {
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight + 2}px`;
  };
  t.addEventListener('input', fit);
  requestAnimationFrame(fit);
  // Refit when the width changes (window resized, panel shown).
  let w = 0;
  new ResizeObserver(() => {
    if (t.clientWidth !== w) {
      w = t.clientWidth;
      fit();
    }
  }).observe(t);
  return t;
}

export function modal(title: string, body: Node, onClose?: () => void): () => void {
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', key);
    onClose?.();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const wrap = h(
    'div',
    {
      class: 'modal-wrap',
      onclick: (e: Event) => {
        if (e.target === wrap) close();
      },
    },
    h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-label': title },
      h('header', null, h('h2', null, title), h('button', { class: 'icon', title: 'Close', onclick: close }, '✕')),
      body,
    ),
  );
  document.addEventListener('keydown', key);
  document.body.append(wrap);
  return close;
}

/** Hands a text file to the user. */
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
