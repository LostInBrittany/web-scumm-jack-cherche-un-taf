// The Play tab's "Text switches" picker (4.3.0, PLAN-4.3-HERO-CHOICE §5): the flags the game's text switches read
// (`{form?m=…|f=…}`, core/text-switch.ts), each with the values it can take, as a select. Choosing one sets the flag in
// the game in the frame (a `set` command, as the DEV panel's "Set the flag"), so the room, the hero's sprite variant,
// `{hero}` and every line show that hero. The values offered are the ones the switches list and the ones a literal `set`
// (or the start, a checkpoint) writes. The pick is also kept in `previewFlags`: the Rooms tab renders a text holding a
// switch with it (rooms-lines.ts). The local Studio only: a hosted Studio's game is on another origin (game-origin.ts).
import type { Engine } from '@engine/core/engine';
import type { GameDef, Value } from '@engine/core/types';
import { gameSwitchFlags, type SwitchFlag } from '@engine/tools/hero-matrix';
import { h, select, toast } from './ui';

// The flags and their values: engine-side since 4.4.0, the hero × language matrix reads them too (hero-matrix.ts).
export { gameSwitchFlags as switchFlags, type SwitchFlag };

/** The values picked last in the Play tab, by flag: what the Rooms tab previews a switch with. */
export const previewFlags: Record<string, Value> = {};

type FrameGame = {
  engine: Engine;
  game: GameDef;
  view?: { refreshVisibility?: () => void; redraw?: () => void };
};

export class HeroPicker {
  readonly el = h('div', { class: 'panel switches', hidden: true });
  private shown: GameDef | null = null;
  private flags: SwitchFlag[] = [];
  private selects = new Map<string, HTMLSelectElement>();
  private hero = h('span', { class: 'muted small' });

  constructor(private frame: () => FrameGame | null) {}

  /** Called on the Play tab's refresh: draws once per game, then follows the frame's flags. */
  refresh(): void {
    const g = this.frame();
    if (!g?.engine.state) {
      this.el.hidden = true;
      return;
    }
    if (this.shown !== g.game) {
      this.shown = g.game;
      this.flags = gameSwitchFlags(g.game);
      this.draw();
    }
    this.el.hidden = !this.flags.length;
    const flags = g.engine.state.flags;
    for (const [f, s] of this.selects) {
      const v = flags[f];
      if (document.activeElement !== s) s.value = v === undefined ? '' : String(v);
    }
    this.hero.textContent = `hero: ${g.engine.text('{hero}')}`;
  }

  private draw() {
    this.selects.clear();
    const rows = this.flags.map(({ flag, values }) => {
      const s = select(
        [['', '(unset)'], ...values.map(({ key }): [string, string] => [key, key])],
        '',
        (k) => void this.pick(flag, values.find((v) => v.key === k)?.value),
        { 'aria-label': `Flag ${flag}` },
      ) as HTMLSelectElement;
      this.selects.set(flag, s);
      return h('label', { class: 'small' }, h('code', null, flag), ' ', s, ' ');
    });
    this.el.replaceChildren(
      h('h3', null, 'Text switches ', this.hero),
      h(
        'p',
        { class: 'muted small' },
        'The flags the texts switch on: pick a value to see that hero (sprites, name, lines) in the frame.',
      ),
      h('div', { class: 'bar' }, ...rows),
    );
  }

  /** Sets the flag in the frame's game (unset: removed), then redraws the room. */
  private async pick(flag: string, value: Value | undefined) {
    const g = this.frame();
    if (!g) return;
    try {
      if (value === undefined) {
        delete g.engine.state.flags[flag];
        delete previewFlags[flag];
      } else {
        await g.engine.script([{ set: [flag, value] }]);
        previewFlags[flag] = value;
      }
      g.engine.save();
      g.view?.refreshVisibility?.();
      g.view?.redraw?.();
    } catch (e) {
      toast(`The flag was not set: ${(e as Error).message}`, 'error');
    }
    this.refresh();
  }
}
