// Play tab: the game itself (with the dev tools) in a frame, next to a state inspector and a rule explainer: pick a
// verb and a target (and an item), see every rule that could answer, with each condition evaluated against the live
// state (✓ / ✗), and which answer wins. The frame is the same origin: the Studio reads `window.__game` in it. On a
// hosted Studio (4.2.1) the game is on its own origin: the frame shows it with its dev tools, and the panels that read
// into it are left out (game-origin.ts).
import { explainCond, type Explained } from '@engine/core/cond';
import type { Engine } from '@engine/core/engine';
import type { GameDef, Id, Rule } from '@engine/core/types';
import {
  labelOf,
  parseSessionFile,
  replay,
  sessionFile,
  type ReplayResult,
  type SessionFile,
} from '@engine/tools/replay';
import { api, BASE, type GameInfo } from './api';
import { SpeedrunPanel, type SpeedrunFrame } from './speedrun-panel';
import { download, h, select, toast } from './ui';
import { gameElsewhere, gameLink, gameUrl } from './game-origin';
import { RealityPanel } from './reality-panel';
import { HeroPicker } from './hero-picker';

type GameWindow = Window & { __game?: { engine: Engine; game: GameDef } };

const asList = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

export class PlayTab {
  readonly el = h('section', { class: 'tab play' });
  private frame = h('iframe', {
    class: 'playframe',
    title: 'The game',
    src: gameElsewhere() ? 'about:blank' : `${BASE}?dev`,
  }) as HTMLIFrameElement;
  private state = h('div', { class: 'panel state' });
  private why = h('div', { class: 'panel why' });
  private journal = h('div', { class: 'panel journal' });
  private filter: '' | 'action' | 'event' | 'script' | 'actor' | 'player' = '';
  private verb = '';
  private target = '';
  private item = '';
  private timer: ReturnType<typeof setInterval> | undefined;
  /** A session being replayed in the frame: the file, how far, and what the replay gave. */
  private rep: { file: SessionFile; upTo: number; result?: ReplayResult; busy?: boolean } | null = null;

  /** Signals from outside, simulated (4.1.1): shown for a game that declares `reality`. */
  private reality = new RealityPanel(() => this.frame.contentWindow);
  /** The flags the texts switch on, each as a select: preview each hero (4.3.0). */
  private heroes = new HeroPicker(() => this.game());
  /** Speedrun categories, splits, routes, preview and export (4.1.14): shown for a game that declares `speedrun`. */
  private speedrun = new SpeedrunPanel(() => this.game() as SpeedrunFrame | null, {
    ...(api.setValue ? { write: (m) => api.setValue!('@game', 'speedrun', m) } : {}),
    witness: async () => {
      const g = this.game()!;
      const { solve } = await import('@engine/tools/solve');
      return (await solve(structuredClone(g.game), g.engine.layouts, { maxStates: 50000 })).steps;
    },
  });

  constructor(private info: GameInfo) {
    this.verb = info.verbs[0]?.id ?? '';
    this.el.append(
      h(
        'div',
        { class: 'playgrid' },
        h(
          'div',
          { class: 'playcol' },
          this.frame,
          // 3.4: the painter of every room (DOM, the reference, or canvas) and how fast it draws.
          h(
            'div',
            { class: 'bar small' },
            'Painter ',
            select(
              [
                ['', 'as the game says'],
                ['dom', 'DOM'],
                ['canvas', 'canvas'],
              ],
              '',
              (v) => {
                this.painter = v;
                void this.load(v);
              },
            ),
            ' ',
            this.perf,
          ),
          h(
            'p',
            { class: 'muted small' },
            'The game with the dev tools (?dev): press D for the zone overlay, the DEV panel teleports and sets flags. ',
            gameLink('?dev', 'Open in a new tab ↗'),
          ),
        ),
        gameElsewhere()
          ? h(
              'div',
              { class: 'playside' },
              h(
                'p',
                { class: 'panel muted' },
                'The preview of one revision: the last ready when it was loaded. It does not follow later changes on ',
                'its own, so a game in progress is never interrupted. ',
                'It runs on its own origin, so the state, the rules and the replays are read in the DEV panel inside ',
                'the game; the panels beside it need the local Studio.',
              ),
              h('button', { type: 'button', onclick: () => void this.load(this.painter) }, 'Load the latest preview'),
            )
          : h(
              'div',
              { class: 'playside' },
              this.state,
              this.heroes.el,
              this.reality.el,
              this.speedrun.el,
              this.why,
              this.journal,
            ),
      ),
    );
    if (gameElsewhere()) {
      void this.load('');
      return;
    }
    this.timer = setInterval(() => {
      this.refresh();
      this.heroes.refresh();
      this.reality.refresh();
      this.speedrun.refresh();
      this.measure();
    }, 700);
  }

  /** Frames per second of the game in the frame, its painter, and the canvas painter's repaints (3.4). */
  private perf = h('span', { class: 'muted' });
  private perfState = { frames: 0, since: performance.now(), paints: 0, raf: 0 };
  private measure() {
    const w = this.frame.contentWindow as
      | (Window & { __game?: { view?: { painter?: string; r?: { paints?: number } } } })
      | null;
    if (!w || this.el.hidden) return;
    const p = this.perfState;
    cancelAnimationFrame(p.raf);
    const tick = () => {
      p.frames++;
      p.raf = w.requestAnimationFrame(tick);
    };
    try {
      p.raf = w.requestAnimationFrame(tick);
    } catch {
      /* the frame is loading */
    }
    const now = performance.now(),
      v = w.__game?.view;
    if (now - p.since > 1000) {
      const fps = (p.frames * 1000) / (now - p.since),
        paints = v?.r?.paints ?? 0;
      this.perf.textContent = `${fps.toFixed(0)} fps · ${v?.painter ?? '?'} painter${v?.painter === 'canvas' ? ` · ${Math.max(0, paints - p.paints)} paints` : ''}`;
      p.frames = 0;
      p.since = now;
      p.paints = paints;
    }
  }

  private loads = 0;
  /** The painter chosen (`''`: the game's own), kept when a newer preview is loaded. */
  private painter = '';
  /** (Re)loads the game in the frame, with a painter (`dom`, `canvas`) or the game's own. */
  private async load(painter: string) {
    const q = `?dev${painter ? `&renderer=${painter}` : ''}`;
    const n = ++this.loads;
    try {
      const url = await gameUrl(q);
      // A later choice of painter wins over a ticket that arrives late.
      if (n === this.loads) this.frame.src = url;
    } catch (e) {
      toast(`The game does not open: ${(e as Error).message}`, 'error');
    }
  }

  private game(): { engine: Engine; game: GameDef } | null {
    try {
      return (this.frame.contentWindow as GameWindow | null)?.__game ?? null;
    } catch {
      return null;
    }
  }

  private refresh() {
    if (!this.el.isConnected) return;
    const g = this.game();
    const s = g?.engine.state;
    if (!g || !s) {
      this.state.replaceChildren(h('h3', null, 'State'), h('p', { class: 'muted' }, 'Waiting for the game…'));
      return;
    }
    const flags =
      Object.entries(s.flags)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join('  ') || '—';
    const scripts =
      Object.entries(s.scripts ?? {})
        .map(([k, v]) => `${k}:${v.off ? 'off' : v.done ? 'done' : v.pc}`)
        .join('  ') || '—';
    this.state.replaceChildren(
      h(
        'h3',
        null,
        'State ',
        h(
          'span',
          { class: 'muted small' },
          `${s.room}${s.active ? ` · ${s.active}` : ''}${g.engine.busy ? ' · busy' : ''}`,
        ),
      ),
      h(
        'dl',
        { class: 'facts' },
        h('dt', null, 'Bag'),
        h('dd', null, s.inventory.join(', ') || '—'),
        h('dt', null, 'Flags'),
        h('dd', null, flags),
        h('dt', null, 'Unlocked'),
        h('dd', null, s.unlocked.join(', ') || '—'),
        Object.keys(s.where ?? {}).length
          ? [
              h('dt', null, 'Where'),
              h(
                'dd',
                null,
                Object.entries(s.where!)
                  .map(([c, r]) => `${c}@${r}`)
                  .join('  '),
              ),
            ]
          : null,
        h('dt', null, 'Scripts'),
        h('dd', null, scripts),
        s.players
          ? [
              h('dt', null, 'Players'),
              h(
                'dd',
                null,
                Object.entries(s.players)
                  .map(([p, v]) => `${p}@${v.room} [${v.inventory.join(', ')}]`)
                  .join('  '),
              ),
            ]
          : null,
      ),
    );
    this.renderWhy(g);
    this.renderJournal(g.engine);
  }

  /** The session file of the game in the frame: the inputs since it started, with the journal. */
  private exportSession(g: { engine: Engine; game: GameDef }) {
    try {
      download(
        `${g.game.id}-session.json`,
        JSON.stringify(sessionFile(g.game.id, g.engine), null, 1),
        'application/json',
      );
    } catch (e) {
      toast(String((e as Error).message), 'error');
    }
  }

  /** Replays a session file in the frame: the engine plays it silently, the game loads the state it reaches. */
  private importSession(g: { engine: Engine; game: GameDef }) {
    const inp = h('input', { type: 'file', accept: 'application/json,.json', hidden: true }) as HTMLInputElement;
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const file = parseSessionFile(await f.text());
        if (file.game && file.game !== g.game.id) toast(`recorded on "${file.game}", this is "${g.game.id}"`, 'info');
        this.rep = { file, upTo: file.session.log.length };
        await this.scrub(g, this.rep.upTo);
      } catch (e) {
        toast(String((e as Error).message), 'error');
      }
    };
    document.body.append(inp);
    inp.click();
    setTimeout(() => inp.remove(), 1000);
  }

  /** Plays the first `upTo` entries of the loaded session and puts the game there. */
  private async scrub(g: { engine: Engine; game: GameDef }, upTo: number) {
    const rep = this.rep;
    if (!rep || rep.busy) return;
    rep.busy = true;
    rep.upTo = upTo;
    try {
      const r = await replay(structuredClone(g.game), structuredClone(g.engine.layouts), rep.file.session, {
        upTo,
        commands: g.engine.opts.commands,
      });
      rep.result = r;
      await g.engine.load(structuredClone(r.state));
      if (r.divergedAt !== undefined) toast(`diverges at entry ${r.divergedAt + 1}: ${r.divergence}`, 'error', 5000);
    } catch (e) {
      toast(String((e as Error).message), 'error');
    } finally {
      rep.busy = false;
      this.refresh();
    }
  }

  /** The engine's journal (`Engine.trace`, kept in dev mode): what answered, events, script steps, moves, switches. */
  private renderJournal(e: Engine) {
    const g = this.game()!;
    const kinds: [string, string][] = [
      ['', 'everything'],
      ['action', 'actions'],
      ['event', 'events'],
      ['script', 'scripts'],
      ['actor', 'moves'],
      ['player', 'switches'],
    ];
    const rep = this.rep;
    const trace = rep?.result ? rep.result.trace : (e.trace ?? []);
    const rows = trace
      .filter((x) => !this.filter || x.kind === this.filter)
      .slice(-40)
      .reverse();
    const tools = h(
      'span',
      { class: 'bar inline' },
      h(
        'button',
        {
          class: 'small',
          title: 'The inputs since the game started, with the journal: a bug report `npm run replay` plays back',
          onclick: () => this.exportSession(g),
        },
        'Export session',
      ),
      h(
        'button',
        {
          class: 'small',
          title: 'Play a session file here and land the game where it ends',
          onclick: () => this.importSession(g),
        },
        'Replay…',
      ),
    );
    const out: Node[] = [
      h(
        'h3',
        null,
        'Journal ',
        h(
          'span',
          { class: 'muted small' },
          `${trace.length} lines · ${(rep?.result ? rep.result.played : e.session?.log.length) ?? 0} inputs`,
        ),
        ' ',
        select(
          kinds,
          this.filter,
          (v) => {
            this.filter = v as typeof this.filter;
            this.refresh();
          },
          { 'aria-label': 'Journal filter' },
        ),
        ' ',
        tools,
      ),
    ];
    if (rep) {
      const log = rep.file.session.log;
      const n = Math.min(rep.upTo, log.length);
      const d = rep.result?.divergedAt;
      out.push(
        h(
          'div',
          { class: 'replay' },
          h(
            'div',
            { class: 'bar' },
            h('b', null, 'Replay '),
            h(
              'span',
              { class: 'muted small' },
              `${n} / ${log.length}${rep.busy ? ' …' : ''}${rep.result?.ended ? ' · the ending' : ''}`,
            ),
            h('input', {
              type: 'range',
              min: '0',
              max: String(log.length),
              value: String(n),
              'aria-label': 'Replay position',
              onchange: (ev: Event) => void this.scrub(g, Number((ev.target as HTMLInputElement).value)),
            }),
            h(
              'button',
              {
                class: 'small',
                onclick: () => {
                  this.rep = null;
                  this.refresh();
                },
              },
              'Close',
            ),
          ),
          d !== undefined
            ? h('p', { class: 'bad small' }, `✖ diverges at entry ${d + 1}: ${rep.result?.divergence}`)
            : null,
          h(
            'ol',
            { class: 'session' },
            log.map((en, i) =>
              h(
                'li',
                { class: `${i < n ? 'played' : ''}${d === i ? ' bad' : ''}`, onclick: () => void this.scrub(g, i + 1) },
                labelOf(g.game, en),
                en.ran?.length ? h('span', { class: 'muted small' }, ` ← ${en.ran.join(', ')}`) : null,
              ),
            ),
          ),
        ),
      );
    }
    out.push(
      rows.length
        ? h(
            'ol',
            { class: 'trace' },
            rows.map((x) =>
              h(
                'li',
                { class: `t-${x.kind}` },
                h('span', { class: 'muted small' }, `${new Date(x.t).toLocaleTimeString()} ${x.room} `),
                h('b', null, x.kind),
                ' ',
                x.text,
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'Nothing yet: play in the frame.'),
    );
    this.journal.replaceChildren(...out);
  }

  /** "Why does this action answer that?": every candidate rule with its conditions explained. */
  private renderWhy(g: { engine: Engine; game: GameDef }) {
    const e = g.engine;
    const s = e.state;
    const room = e.room();
    const targets = e.targets(room);
    const items = s.inventory;
    if (this.target && !targets.includes(this.target) && !items.includes(this.target)) this.target = '';
    const verbs = this.info.verbs.map((v): [string, string] => [v.id, v.label]);
    const topts: [string, string][] = [
      ['', '(target)'],
      ...targets.map((t): [string, string] => [t, `${e.nameOf(t, room)} (${t})`]),
      ...items.map((t): [string, string] => [t, `bag: ${t}`]),
    ];
    const iopts: [string, string][] = [['', '(no item)'], ...items.map((t): [string, string] => [t, t])];
    const bar = h(
      'div',
      { class: 'bar' },
      select(
        verbs,
        this.verb,
        (v) => {
          this.verb = v;
          this.refresh();
        },
        { 'aria-label': 'Verb' },
      ),
      select(
        iopts,
        this.item,
        (v) => {
          this.item = v;
          this.refresh();
        },
        { 'aria-label': 'Item' },
      ),
      select(
        topts,
        this.target,
        (v) => {
          this.target = v;
          this.refresh();
        },
        { 'aria-label': 'Target' },
      ),
    );
    const out: Node[] = [
      h('h3', null, 'Why? ', h('span', { class: 'muted small' }, 'the rules that could answer, first ✓ wins')),
      bar,
    ];
    if (this.target) {
      const a = this.item || this.target;
      const b = this.item ? this.target : undefined;
      const has = (x: Id | Id[] | undefined, v: Id | undefined) =>
        x === undefined ? v === undefined : v !== undefined && asList(x).includes(v);
      const lists: [Rule[], string][] = [
        [room.on ?? [], room.id],
        [g.game.rules.on ?? [], 'game'],
      ];
      let winner: Rule | null = null;
      for (const [list, scope] of lists)
        list.forEach((r, i) => {
          if (!asList(r.verb).includes(this.verb)) return;
          const match =
            (has(r.a, a) && has(r.b, b)) || (b && items.includes(a) && items.includes(b) && has(r.a, b) && has(r.b, a));
          if (!match) return;
          const x = explainCond(r.if, s, room.id);
          const wins = x.ok && !winner;
          if (wins) winner = r;
          out.push(
            h(
              'div',
              { class: `rule ${x.ok ? 'ok' : 'bad'}` },
              h(
                'div',
                { class: 'rulehead' },
                h('b', null, wins ? '▶ ' : x.ok ? '✓ ' : '✗ '),
                h('code', null, `${r.id ?? `${scope}.on[${i}]`}${r.exit ? ' (exit)' : ''}`),
                h(
                  'span',
                  { class: 'muted small' },
                  ` ${asList(r.verb).join('/')} ${asList(r.a).join('/')}${r.b ? ' → ' + asList(r.b).join('/') : ''}`,
                ),
              ),
              this.explained(x),
            ),
          );
        });
      if (!winner) {
        const why =
          this.verb === 'look' && !b
            ? room.look?.[a] || g.game.items[a]?.look
              ? 'the look line'
              : 'the look fallback'
            : this.verb === 'talk' && !b
              ? room.talk?.[a]
                ? 'the conversation topics'
                : a === g.game.hintItem
                  ? 'the hints'
                  : 'the talk fallback'
              : 'a kind reaction, a refusal or the fallback line';
        out.push(h('p', { class: 'muted' }, `No rule answers: ${why}.`));
      }
    } else out.push(h('p', { class: 'muted' }, 'Pick a target.'));
    this.why.replaceChildren(...out);
  }

  private explained(x: Explained): HTMLElement {
    return h(
      'div',
      { class: `cond ${x.ok ? 'ok' : 'bad'}` },
      `${x.ok ? '✓' : '✗'} ${x.text}`,
      x.parts
        ? h(
            'div',
            { class: 'nest' },
            x.parts.map((p) => this.explained(p)),
          )
        : null,
    );
  }

  dispose() {
    clearInterval(this.timer);
  }
}
