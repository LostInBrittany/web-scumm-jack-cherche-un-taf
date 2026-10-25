// Small helpers of the player's modules (element factory, timings of taps, the FPS meter). (4.1.0 "Clarity", from dom/app.ts.)
import { cmdLists, someCmd } from '../core/cmds';
import type { GameDef, VerbDef } from '../core/types';

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  // Images are decorative unless a caller names them (the scene is reachable through the a11y targets, items by name).
  if (tag === 'img') (e as HTMLImageElement).alt = '';
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/** How far from a target (logical px of the 640×400 scene) a tap on nothing counts as a near miss (3.8). */
export const NEAR_MISS = 24;

/** Two taps on the same target within this many ms are a double tap: it acts with the default verb (4.0). */
export const DOUBLE_TAP_MS = 400;

/** A frame counter fixed in the top-left corner: frames in the last second, and the lowest second since it started. */
/** Returns what stops it (4.1.4): the frame loop ended, the box removed. */
export function fpsMeter(): () => void {
  const box = document.createElement('div');
  box.className = 'fps-meter';
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed',
    left: '4px',
    top: '4px',
    zIndex: '9999',
    font: '12px monospace',
    color: '#0f0',
    background: 'rgba(0,0,0,.6)',
    padding: '2px 4px',
    pointerEvents: 'none',
  });
  document.body.append(box);
  let frames = 0,
    low = Infinity,
    t0 = performance.now();
  let raf = 0;
  const tick = (t: number) => {
    frames++;
    if (t - t0 >= 1000) {
      const fps = Math.round((frames * 1000) / (t - t0));
      low = Math.min(low, fps);
      box.textContent = `${fps} fps · low ${low}`;
      frames = 0;
      t0 = t;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    box.remove();
  };
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/** A verb's label as HTML, its key's first occurrence underlined (#203), as SCUMM showed its shortcuts. */
export function verbLabelHtml(v: Pick<VerbDef, 'label' | 'key'>): string {
  const key = v.key?.toLocaleLowerCase();
  const i = key ? v.label.toLocaleLowerCase().indexOf(key) : -1;
  if (!key || i < 0) return esc(v.label);
  const j = i + key.length;
  return `${esc(v.label.slice(0, i))}<u>${esc(v.label.slice(i, j))}</u>${esc(v.label.slice(j))}`;
}

/** Whether the game captions any sound effect (the settings' captions row). */
export function someCaption(game: GameDef): boolean {
  return cmdLists(game).some(({ list }) => someCmd(list, (c) => 'sfx' in c && !!c.caption));
}

/** What the App knows of its world link (4.1.1): the module itself (dom/reality-ui.ts) is loaded only when needed. */
export interface RealityLinkLike {
  status: string;
  statusText(): string;
  menu(m: HTMLElement, back: () => void): void;
  /** Ends the link's client and releases its lock without forgetting the link (`App.destroy`, 4.1.4). */
  stop?(): Promise<void>;
}
