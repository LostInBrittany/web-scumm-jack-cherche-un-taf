// The Music tab (3.5): the scores of `audio.scores` heard through the game's own music director (dom/director.ts).
// Pick a score, play it, then hear each state's mix (on the next bar, as in the game), or mute and solo its stems by
// hand; the bar and beat show where the music is. Nothing is written: a score's states are content (game.ts,
// `audio.scores`), edited with the rest of the game. Works on the dev server and in the in-browser demo.
import type { Cond, Id, ScoreDef } from '../engine/core/types';
import { barSec, beatSec, loopWindow, positionAt } from '../engine/core/score';
import { MusicDirector } from '../engine/dom/director';
import { BASE, type GameInfo } from './api';
import { h, select } from './ui';
import { must } from '../engine/core/must';

const condText = (c: Cond | undefined): string =>
  c === undefined ? 'always' : typeof c === 'string' ? c : JSON.stringify(c);

export class MusicTab {
  readonly el = h('section', { class: 'tab music' });
  private director: MusicDirector | null = null;
  private id: Id | null = null;
  private on: Id[] = [];
  private raf = 0;
  private pos = h('span', { class: 'mono' }, '—');

  constructor(private info: GameInfo) {}

  load() {
    const scores = this.info.scores ?? {};
    const ids = Object.keys(scores);
    if (!ids.length) {
      this.el.replaceChildren(
        h(
          'p',
          { class: 'muted pad' },
          'No score in this game. A track in stems: npm run audio -- stems <project>/spec.json, then audio.scores in game.ts (https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Create-Music).',
        ),
      );
      return;
    }
    this.id ??= must(ids[0], 'first score');
    this.render();
  }

  private url(file: string) {
    return `${BASE}assets/audio/music/${file}`;
  }

  private async play() {
    const sc = must(this.info.scores![this.id!], 'selected score');
    if (!this.director) {
      this.director = new MusicDirector(new AudioContext());
      this.director.volume(0.8);
    }
    const ctx = this.director.ctx as AudioContext;
    if (ctx.state === 'suspended') await ctx.resume();
    if (!this.on.length) this.on = Object.keys(sc.stems);
    await this.director.play(
      this.id!,
      sc,
      Object.fromEntries(Object.entries(sc.stems).map(([k, f]) => [k, this.url(f)])),
      this.on,
    );
    this.tick();
    this.render();
  }

  private stop() {
    this.director?.stop(300);
    cancelAnimationFrame(this.raf);
    this.pos.textContent = '—';
    this.render();
  }

  /** A mix: on the next bar while the score plays (as in the game), at once when it does not. */
  private mix(stems: Id[]) {
    this.on = [...stems];
    if (this.director?.current === this.id) this.director.mix(this.on);
    this.render();
  }

  private tick() {
    cancelAnimationFrame(this.raf);
    const d = this.director,
      sc = must(this.info.scores![this.id!], 'selected score');
    const step = () => {
      if (!d || d.current !== this.id || d.startedAt === null) return;
      const t = d.ctx.currentTime - d.startedAt;
      if (t >= 0) {
        // Where the file is (round its loop), as bar and beat.
        const p = positionAt(t, loopWindow(sc, d.duration ?? Infinity));
        this.pos.textContent = `bar ${Math.floor(p / barSec(sc)) + 1} · beat ${Math.floor((p % barSec(sc)) / beatSec(sc)) + 1}`;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private render() {
    const scores = this.info.scores!;
    const sc: ScoreDef = must(scores[this.id!], 'selected score');

    const stems = Object.keys(sc.stems);
    const playing = this.director?.current === this.id;
    const stemRow = (s: Id) => {
      const box = h('input', {
        type: 'checkbox',
        checked: this.on.length ? this.on.includes(s) : true,
        'aria-label': `stem ${s}`,
      });
      box.addEventListener('change', () => {
        const base = this.on.length ? this.on : stems;
        this.mix(box.checked ? [...new Set([...base, s])] : base.filter((x) => x !== s));
      });
      return h(
        'tr',
        null,
        h('td', null, box),
        h('td', null, h('b', null, s)),
        h('td', { class: 'small muted' }, sc.stems[s]),
        h('td', null, h('button', { class: 'small', onclick: () => this.mix([s]) }, 'Solo')),
      );
    };
    const states = (sc.states ?? []).map((st, i) =>
      h(
        'tr',
        null,
        h('td', { class: 'small' }, String(i + 1)),
        h('td', null, h('code', { class: 'small' }, condText(st.if))),
        h('td', null, st.stems.join(', ')),
        h('td', null, h('button', { class: 'small', onclick: () => this.mix(st.stems) }, 'Hear')),
      ),
    );
    this.el.replaceChildren(
      h(
        'div',
        { class: 'bar' },
        h(
          'label',
          null,
          'Score ',
          select(
            Object.keys(scores).map((k) => [k, k]),
            this.id!,
            (k) => {
              this.stop();
              this.id = k;
              this.on = [];
              this.render();
            },
          ),
        ),
        playing
          ? h('button', { onclick: () => this.stop() }, 'Stop')
          : h('button', { class: 'primary', onclick: () => void this.play() }, 'Play'),
        h(
          'span',
          { class: 'muted small' },
          `${sc.bpm} BPM · ${sc.beatsPerBar ?? 4} beats a bar · changes on the ${sc.quantize ?? 'bar'}, ${sc.fadeBeats ?? 2} beats of crossfade`,
        ),
        this.pos,
      ),
      h('h3', null, 'Stems'),
      h(
        'table',
        { class: 'vtable' },
        h('thead', null, h('tr', null, ...['on', 'stem', 'file', ''].map((x) => h('th', null, x)))),
        h('tbody', null, ...stems.map(stemRow)),
      ),
      h('h3', null, 'States'),
      h(
        'p',
        { class: 'muted small' },
        'In the game the first state whose condition holds sets the mix; none: every stem. "Hear" plays that mix on the next bar.',
      ),
      h(
        'table',
        { class: 'vtable' },
        h('thead', null, h('tr', null, ...['#', 'when', 'stems', ''].map((x) => h('th', null, x)))),
        h(
          'tbody',
          null,
          ...states,
          h(
            'tr',
            null,
            h('td', null, ''),
            h('td', null, h('code', { class: 'small' }, 'otherwise')),
            h('td', null, stems.join(', ')),
            h('td', null, h('button', { class: 'small', onclick: () => this.mix(stems) }, 'Hear')),
          ),
        ),
      ),
    );
  }
}
