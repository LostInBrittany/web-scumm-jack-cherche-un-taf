// The diff's captures in the Check tab (4.4.0): asked on demand (each side is a build of the game, seconds each), each
// room the diff names shown at both revisions side by side, "no visible change" when their pixels are equal, a side
// that cannot be drawn said with why. A hosted Studio answers that captures need a local Studio: said as it is.
import type { DiffCaptures, DiffShot } from '../../tools/studio/types';
import { studioFetch } from './api-base';
import { h } from './ui';

type Ready = Exclude<DiffCaptures, { unavailable: true }>;

/** One side; `box` (the after side): where it differs from the other, outlined. */
const shot = (s: DiffShot, label: string, size: [number, number], box?: [number, number, number, number]) => {
  const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;
  return h(
    'figure',
    { class: 'diff-shot' },
    'url' in s
      ? h(
          'div',
          { class: 'diff-frame' },
          h('img', { src: s.url, alt: label, width: String(size[0] / 2), loading: 'lazy' }),
          box
            ? h('div', {
                class: 'diff-box',
                title: `changed here: ${box.join(', ')}`,
                style: `left:${pct(box[0], size[0])};top:${pct(box[1], size[1])};width:${pct(box[2], size[0])};height:${pct(box[3], size[1])}`,
              })
            : null,
        )
      : h('p', { class: 'muted' }, s.missing),
    h('figcaption', { class: 'muted small' }, 'file' in s ? `${label} · ${s.file}` : label),
  );
};

/** The captures, room by room. */
function capturesView(c: Ready): HTMLElement {
  if (!c.rooms.length)
    return h('p', { class: 'muted' }, 'No room to capture: nothing these revisions changed is drawn.');
  return h(
    'div',
    { class: 'diff-captures' },
    ...c.rooms.map((r) =>
      h(
        'section',
        { class: 'diff-room' },
        h(
          'p',
          null,
          h('code', null, r.room),
          ` · ${r.why.join(', ')}`,
          r.same ? h('span', { class: 'muted' }, ' · no visible change') : '',
        ),
        h(
          'div',
          { class: 'diff-pair' },
          shot(r.before, `r${c.from}`, c.size),
          shot(r.after, `r${c.to}`, c.size, r.box),
        ),
      ),
    ),
    ...(c.cut ? [h('p', { class: 'muted' }, '… and more rooms (captures cut at 6)')] : []),
    h('p', { class: 'muted small' }, `Drawn in ${(c.ms / 1000).toFixed(1)} s.`),
  );
}

/** The button that asks the captures of `from..to`, and where they go. */
export function capturesButton(from: string, to: string): HTMLElement {
  const out = h('div', { class: 'diff-captures-out' });
  const go = h('button', { type: 'button' }, 'Capture the rooms (before / after)');
  go.onclick = async () => {
    go.disabled = true;
    out.replaceChildren(h('p', { class: 'muted' }, 'Building both revisions and drawing their rooms…'));
    try {
      const r = await studioFetch(`diff/${from}..${to}/captures`);
      const d = (await r.json()) as DiffCaptures & { error?: string; reason?: string };
      if ('unavailable' in d) throw new Error(d.reason);
      if (!r.ok) throw new Error(d.error ?? `${r.status}`);
      out.replaceChildren(capturesView(d));
    } catch (e) {
      out.replaceChildren(h('p', { class: 'error' }, (e as Error).message));
    } finally {
      go.disabled = false;
    }
  };
  return h('div', null, h('p', null, go), out);
}
