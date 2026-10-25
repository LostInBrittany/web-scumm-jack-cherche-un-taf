// What changed between two revisions, in the Check tab (4.2.3 PR 4, H3): file by file, by what the game names (the ids
// a source added, removed, changed, with their fields; the values of a JSON), or "file changed". A build is a revision:
// compare two builds by theirs. The rooms it names, drawn at both revisions, on demand (4.4.0, diff-captures-view.ts).
import type { FileDiff } from '../../tools/studio/semantic-diff';
import { studioFetch } from './api-base';
import { capturesButton } from './diff-captures-view';
import { h } from './ui';

const list = (label: string, xs: string[]) =>
  xs.length ? h('li', null, `${label}: `, ...xs.flatMap((x, i) => [i ? ', ' : '', h('code', null, x)])) : null;

/** One file's change, said. */
function fileChange(f: FileDiff): HTMLElement {
  const items: (HTMLElement | null)[] = [];
  if (f.ids) {
    items.push(list('added', f.ids.added), list('removed', f.ids.removed));
    for (const c of f.ids.changed)
      items.push(h('li', null, h('code', null, c.id), ` changed: ${c.fields.join(', ') || 'its place'}`));
  }
  if (f.values)
    items.push(list('added', f.values.added), list('removed', f.values.removed), list('changed', f.values.changed));
  if (f.opaque) items.push(h('li', { class: 'muted' }, 'file changed'));
  if (f.cut) items.push(h('li', { class: 'muted' }, '… and more (cut at 500)'));
  return h(
    'div',
    { class: 'file-change' },
    h('p', null, h('code', null, f.path), ` · ${f.change}`),
    h('ul', null, ...items.filter((x): x is HTMLElement => x !== null)),
  );
}

export function diffPanel(): HTMLElement {
  const from = h('input', { type: 'number', min: '0', 'aria-label': 'from revision', style: 'width:6em' });
  const to = h('input', { type: 'number', min: '0', 'aria-label': 'to revision', style: 'width:6em' });
  const out = h('div', { class: 'diff-out' });
  const go = h('button', { type: 'button' }, 'Show the changes');
  go.onclick = async () => {
    out.replaceChildren(h('p', { class: 'muted' }, 'Reading…'));
    try {
      const [a, b] = [from.value.trim(), to.value.trim()];
      if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) throw new Error('two revisions, as numbers');
      const r = await studioFetch(`diff/${a}..${b}`);
      const d = (await r.json()) as { files?: FileDiff[]; cut?: true; error?: string };
      if (!r.ok) throw new Error(d.error ?? `${r.status}`);
      out.replaceChildren(
        ...(d.files!.length ? d.files!.map(fileChange) : [h('p', { class: 'muted' }, 'Nothing changed between them.')]),
        ...(d.cut ? [h('p', { class: 'muted' }, '… and more files (cut at 500)')] : []),
        ...(d.files!.length ? [capturesButton(a, b)] : []),
      );
    } catch (e) {
      out.replaceChildren(h('p', { class: 'error' }, (e as Error).message));
    }
  };
  return h(
    'section',
    { class: 'panel diff-panel' },
    h('h3', null, 'Changes between revisions'),
    h('p', null, 'From ', from, ' to ', to, ' ', go),
    h(
      'p',
      { class: 'muted small' },
      'By what the game names. A build is a revision: compare two builds by theirs. The rooms the changes name can be ' +
        'drawn at both revisions (a local Studio only).',
    ),
    out,
  );
}
