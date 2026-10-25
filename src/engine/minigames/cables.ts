import { MINIGAME_META } from './meta';
import type { Minigame, MinigameCtx } from './types';
import { el, finisher, num, operable, random, shuffled, skipButton, sleep, stage, str } from './util';
import { must } from '../core/must';

// "The tangle of cables": four plugs on the left, a big knot in the middle, a panel of sockets on the right.
// Touching a plug wiggles its cable through the knot: you can see where it comes out, near its socket.
// Drag the plug to the socket of its color. A wrong connection triggers a gag, never a failure.
//
// Params (all images come from the game; color ids are free-form):
//   board    Id                      the socket panel (4 sockets, one below another)
//   knot     Id                      the big knot in the middle
//   plugs    Record<color, Id>       one plug per color (4 at most), in the order shown
//   sockets? color[]                 order of the sockets on the panel, top to bottom (default: `plugs` order)
//   tints?   Record<color, css>      color of the drawn cable (default: the color id itself, e.g. 'red')
//   gags?    ('lamp'|'phone'|'toaster'|'windows')[]  default: those whose images/text are provided
//   lampOn?, lampOff?, phone?, toaster?  gag images;  windowsText?  text of the fake blue screen
//   sfx?     { ring?, stamp? }       ring of the phone gag, sound of a plug connected correctly
//   tipDeg?  number                  direction of the plug's tip in its image (degrees, screen coordinates; 0 = right,
//                                    90 = down). Default 120, the sample plugs.
//   socketX?, socketY?  number, number[]  where the sockets are on the board image, as fractions of its width and
//                                    height (socketY top to bottom). Default 0.25 and [0.18, 0.38, 0.59, 0.785].
//   plugInset? number                how far left of its socket a connected plug's centre sits (logical units),
//                                    so a long plug's pins end in the socket. Default 4.
//   helpAfter?, background?, intro?, win?

type Color = string;
const SOCKET_REL = { x: 0.25, y: [0.18, 0.38, 0.59, 0.785] };
const PANEL = { cx: 548, cy: 205, h: 160 };
const KNOT = { cx: 300, cy: 205, h: 220 };
// 56 logical units: at the frame's real scale (u ≈ 0.9-0.98 on the targeted phones), 44 fell
// below the 44 px CSS recommended for a touch target. See docs/PRODUCTION.md WP-D.
export const PLUG_H = 56;
/** Radius (logical units) within which a dropped plug connects to the nearest socket. */
export const SOCKET_TOL = 42;
const REST_X = 64;
const REST_Y = [118, 178, 238, 298];
/** Direction of the plug's tip in the source image (degrees, screen coordinates), unless `tipDeg` says otherwise. */
const TIP_DEG = 120;

type P = [number, number];
interface Cable {
  color: Color;
  rest: P;
  pos: P;
  inner: P[];
  exit: P;
  socket: P;
  done: boolean;
  plug: HTMLImageElement;
  under: [SVGPathElement, SVGPathElement];
  over: [SVGPathElement, SVGPathElement];
}

const SVGNS = 'http://www.w3.org/2000/svg';

/** Smooth curve through all the points (Catmull-Rom converted to Bézier). */
function smooth(pts: P[]): string {
  if (pts.length < 2) return '';
  const first = must(pts[0], 'first point of a curve');
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = must(pts[Math.max(0, i - 1)], 'curve point'),
      p1 = must(pts[i], 'curve point'),
      p2 = must(pts[i + 1], 'curve point'),
      p3 = must(pts[Math.min(pts.length - 1, i + 2)], 'curve point');
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const strMap = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]))
    : {};

export const cables: Minigame = {
  ...MINIGAME_META.cables,
  run(ctx: MinigameCtx) {
    const p = ctx.params;
    const rand = random(ctx);
    const plugs = strMap(p.plugs);
    const tints = strMap(p.tints);
    const HEX = (c: Color) => tints[c] ?? c;
    const colors = Object.keys(plugs).slice(0, 4);
    const PANEL_ORDER: Color[] = Array.isArray(p.sockets) ? p.sockets.map(String) : colors;
    const boardId = str(p.board, ''),
      knotId = str(p.knot, '');
    const lampOn = str(p.lampOn, ''),
      lampOff = str(p.lampOff, ''),
      phoneImg = str(p.phone, ''),
      toasterImg = str(p.toaster, '');
    const sfx = (p.sfx && typeof p.sfx === 'object' ? p.sfx : {}) as { ring?: unknown; stamp?: unknown };
    const ring = str(sfx.ring, ''),
      stamp = str(sfx.stamp, '');
    const helpAfter = num(p.helpAfter, 4);
    const tipDeg = num(p.tipDeg, TIP_DEG);
    const socketX = num(p.socketX, SOCKET_REL.x);
    const plugInset = num(p.plugInset, 4);
    const socketY = Array.isArray(p.socketY) && p.socketY.length ? p.socketY.map(Number) : SOCKET_REL.y;
    const windowsText = str(p.windowsText, '');
    // A gag without its images (or without its text) is not offered.
    const available: Record<string, boolean> = {
      lamp: !!(lampOn && lampOff),
      phone: !!phoneImg,
      toaster: !!toasterImg,
      windows: !!windowsText,
    };
    let gagList = (Array.isArray(p.gags) ? (p.gags as string[]) : ['lamp', 'phone', 'toaster', 'windows']).filter(
      (g) => available[g],
    );
    if (!gagList.length) gagList = ['shake'];
    const f = finisher(ctx.signal);
    const box = stage(ctx);
    box.style.background = str(p.background, 'radial-gradient(ellipse at 50% 45%,#2c3350,#10121c)');
    if (p.intro) ctx.instruct(str(p.intro, ''));

    const u = ctx.u;
    const L = (x: number) => `${(x / 640) * 100}%`;
    const T = (y: number) => `${(y / 400) * 100}%`;

    // --- panel and sockets
    const [pw0, ph0] = ctx.size(boardId);
    const pw = (PANEL.h * pw0) / (ph0 || 1);
    const px0 = PANEL.cx - pw / 2,
      py0 = PANEL.cy - PANEL.h / 2;
    const panel = el('img', 'mg-img') as HTMLImageElement;
    panel.src = ctx.img(boardId);
    panel.alt = '';
    Object.assign(panel.style, {
      left: L(px0),
      top: T(py0),
      width: `${pw * u}px`,
      height: `${PANEL.h * u}px`,
      zIndex: '5',
    });
    box.append(panel);
    const socketOf = (c: Color): P => {
      const i = Math.max(0, PANEL_ORDER.indexOf(c));
      // a socket past the fourth has no slot on the panel: NaN, as before the index was checked
      return [px0 + socketX * pw, py0 + (socketY[i] ?? Number.NaN) * PANEL.h];
    };
    const rings = new Map<Color, HTMLDivElement>();
    for (const c of colors) {
      const [sx, sy] = socketOf(c);
      const ring = el('div');
      Object.assign(ring.style, {
        position: 'absolute',
        left: L(sx),
        top: T(sy),
        width: `${30 * u}px`,
        height: `${30 * u}px`,
        transform: 'translate(-50%,-50%)',
        borderRadius: '50%',
        zIndex: '6',
        pointerEvents: 'none',
      });
      box.append(ring);
      rings.set(c, ring);
    }

    // --- cables: layer below the knot, knot, layer above (active cable, stowed cables)
    const mkSvg = (z: number) => {
      const s = document.createElementNS(SVGNS, 'svg');
      s.setAttribute('viewBox', '0 0 640 400');
      s.setAttribute('preserveAspectRatio', 'none');
      Object.assign(s.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: String(z),
        overflow: 'visible',
      });
      box.append(s);
      return s;
    };
    const svgUnder = mkSvg(2);
    const [kw0, kh0] = ctx.size(knotId);
    const kw = (KNOT.h * kw0) / (kh0 || 1);
    const knot = el('img', 'mg-img') as HTMLImageElement;
    knot.src = ctx.img(knotId);
    knot.alt = '';
    Object.assign(knot.style, {
      left: L(KNOT.cx - kw / 2),
      top: T(KNOT.cy - KNOT.h / 2),
      width: `${kw * u}px`,
      height: `${KNOT.h * u}px`,
      zIndex: '3',
      transformOrigin: '50% 50%',
      transition: 'transform .5s ease, opacity .5s',
    });
    box.append(knot);
    const svgOver = mkSvg(4);

    const mkPath = (svg: SVGSVGElement, color: string): [SVGPathElement, SVGPathElement] => {
      const a = document.createElementNS(SVGNS, 'path');
      const b = document.createElementNS(SVGNS, 'path');
      for (const [pth, w, col] of [
        [a, 11, '#170d1f'],
        [b, 6.5, color],
      ] as const) {
        pth.setAttribute('fill', 'none');
        pth.setAttribute('stroke', col);
        pth.setAttribute('stroke-width', String(w));
        pth.setAttribute('stroke-linecap', 'round');
        pth.setAttribute('stroke-linejoin', 'round');
        svg.append(pth);
      }
      return [a, b];
    };

    // the order on the left must not match the sockets: otherwise there'd be nothing to follow
    let left = shuffled(colors, rand);
    for (let k = 0; k < 5 && left.every((c, i) => c === colors[i]); k++) left = shuffled(colors, rand);

    const cablesList: Cable[] = left.map((c, i) => {
      const socket = socketOf(c);
      const rest: P = [REST_X, REST_Y[i] ?? 118 + i * 60];
      const inner: P[] = [0, 1, 2].map(
        (k) =>
          [
            KNOT.cx - kw * 0.32 + k * kw * 0.3 + (rand() - 0.5) * 30,
            KNOT.cy - KNOT.h * 0.33 + rand() * KNOT.h * 0.66,
          ] as P,
      );
      const exit: P = [KNOT.cx + kw * 0.48, socket[1] + (rand() - 0.5) * 8];
      const plug = el('img', 'mg-img') as HTMLImageElement;
      const plugId = must(plugs[c], 'plug of a listed color');
      plug.src = ctx.img(plugId);
      plug.alt = '';
      const [fw0, fh0] = ctx.size(plugId);
      Object.assign(plug.style, {
        width: `${((PLUG_H * fw0) / (fh0 || 1)) * u}px`,
        height: `${PLUG_H * u}px`,
        zIndex: '8',
        transformOrigin: '50% 50%',
        pointerEvents: 'auto',
        cursor: 'grab',
        touchAction: 'none',
      });
      box.append(plug);
      return {
        color: c,
        rest,
        pos: [...rest] as P,
        inner,
        exit,
        socket,
        done: false,
        plug,
        under: mkPath(svgUnder, HEX(c)),
        over: mkPath(svgOver, HEX(c)),
      };
    });

    /** The plug points left at rest (free end), right while held or once connected. */
    const placePlug = (cb: Cable, pointRight: boolean) => {
      const rot = (pointRight ? 0 : 180) - tipDeg;
      Object.assign(cb.plug.style, {
        left: L(cb.pos[0]),
        top: T(cb.pos[1]),
        transform: `translate(-50%,-50%) rotate(${rot}deg)`,
      });
    };
    /** Point where the cable exits the plug: opposite the tip. */
    const tail = (cb: Cable, pointRight: boolean): P => [cb.pos[0] + (pointRight ? -16 : 16), cb.pos[1]];

    let active: Cable | null = null;
    let helper: Cable | null = null;
    let misses = 0;
    let dragging = false;
    let busy = false;

    const draw = (t: number) => {
      for (const cb of cablesList) {
        const hot = cb === active || cb === helper;
        if (cb.done) {
          const d = smooth([
            cb.exit,
            [(cb.exit[0] + cb.socket[0]) / 2, cb.socket[1]],
            [cb.socket[0] - 14, cb.socket[1]],
          ]);
          cb.under.forEach((x) => x.setAttribute('d', ''));
          cb.over.forEach((x) => x.setAttribute('d', d));
          continue;
        }
        const right = cb === active && dragging;
        const wig = hot ? 1 : 0;
        const inner = cb.inner.map(
          ([x, y], k) => [x + Math.sin(t / 90 + k * 1.7) * 9 * wig, y + Math.cos(t / 110 + k * 2.3) * 11 * wig] as P,
        );
        const d = smooth([tail(cb, right), ...inner, cb.exit, [cb.exit[0] + 12, cb.exit[1]]]);
        cb.under.forEach((x) => x.setAttribute('d', d));
        cb.over.forEach((x) => x.setAttribute('d', hot ? d : ''));
        cb.over[1].style.filter = hot ? `drop-shadow(0 0 3px ${HEX(cb.color)})` : '';
      }
    };
    let raf = 0;
    const loop = (t: number) => {
      if (f.finished) return;
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    cablesList.forEach((cb) => placePlug(cb, false));

    const toLogical = (e: PointerEvent): P => {
      const r = box.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 640, ((e.clientY - r.top) / r.height) * 400];
    };

    const knotScale = () => {
      const left = cablesList.filter((c) => !c.done).length;
      const k = left / cablesList.length;
      knot.style.transform = `scale(${Math.max(0.001, k)})`;
      knot.style.opacity = left ? '1' : '0';
    };

    const returnPlug = async (cb: Cable) => {
      const from: P = [...cb.pos] as P;
      const t0 = performance.now();
      await new Promise<void>((res) => {
        const step = (n: number) => {
          const k = Math.min(1, (n - t0) / 300);
          cb.pos = [from[0] + (cb.rest[0] - from[0]) * k, from[1] + (cb.rest[1] - from[1]) * k];
          placePlug(cb, k < 0.5);
          if (k < 1 && !f.finished) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      });
    };

    const gag = async () => {
      const kind = gagList[Math.floor(rand() * gagList.length)];
      const g = el('div');
      Object.assign(g.style, {
        position: 'absolute',
        left: '50%',
        bottom: '4%',
        transform: 'translateX(-50%)',
        zIndex: '50',
        pointerEvents: 'none',
      });
      box.append(g);
      const img = (id: string, h: number) => {
        const im = el('img') as HTMLImageElement;
        im.src = ctx.img(id);
        im.alt = '';
        im.style.height = `${h * u}px`;
        im.style.display = 'block';
        return im;
      };
      if (kind === 'shake') {
        box.classList.remove('mg-shake');
        void box.offsetWidth;
        box.classList.add('mg-shake');
        await sleep(400, ctx.signal);
      } else if (kind === 'lamp') {
        const im = img(lampOff, 110);
        g.append(im);
        for (let i = 0; i < 3; i++) {
          im.src = ctx.img(lampOn);
          await sleep(180, ctx.signal);
          im.src = ctx.img(lampOff);
          await sleep(160, ctx.signal);
        }
      } else if (kind === 'phone') {
        const im = img(phoneImg, 100);
        im.classList.add('mg-shake');
        g.append(im);
        if (ring) ctx.sfx(ring);
        await sleep(400, ctx.signal);
        im.classList.remove('mg-shake');
        void im.offsetWidth;
        im.classList.add('mg-shake');
        await sleep(700, ctx.signal);
      } else if (kind === 'toaster') {
        const im = img(toasterImg, 100);
        g.append(im);
        g.style.position = 'absolute';
        for (const dx of [-14, 14]) {
          const toast = el('div');
          Object.assign(toast.style, {
            position: 'absolute',
            left: `calc(50% + ${dx * u}px)`,
            top: `${20 * u}px`,
            width: `${22 * u}px`,
            height: `${26 * u}px`,
            background: '#e0a860',
            border: `${Math.max(2, 2 * u)}px solid #6b3e14`,
            borderRadius: `${8 * u}px ${8 * u}px ${3 * u}px ${3 * u}px`,
            transform: 'translate(-50%,0)',
            transition: 'transform .45s cubic-bezier(.2,1.6,.4,1)',
          });
          g.prepend(toast);
          requestAnimationFrame(() => {
            toast.style.transform = `translate(-50%, ${-60 * u}px) rotate(${dx > 0 ? 25 : -25}deg)`;
          });
        }
        await sleep(1100, ctx.signal);
      } else {
        const scr = el('div', '', windowsText);
        Object.assign(scr.style, {
          background: '#0a3fa8',
          color: '#fff',
          border: `${3 * u}px solid #cfd8ff`,
          borderRadius: `${6 * u}px`,
          padding: `${10 * u}px ${16 * u}px`,
          fontSize: `${Math.max(12, 13 * u)}px`,
          whiteSpace: 'nowrap',
          boxShadow: '0 6px 20px rgba(0,0,0,.5)',
        });
        g.append(scr);
        await sleep(1300, ctx.signal);
        scr.style.transition = 'opacity .3s';
        scr.style.opacity = '0';
        await sleep(300, ctx.signal);
      }
      g.remove();
    };

    const updateHelp = () => {
      helper = misses >= helpAfter ? (cablesList.find((c) => !c.done) ?? null) : null;
      for (const [c, ring] of rings) ring.classList.toggle('mg-hl', !!helper && helper.color === c);
    };

    const win = async () => {
      if (p.win) ctx.instruct(str(p.win, ''));
      await sleep(1400, ctx.signal);
      f.finish();
    };

    let held: Cable | null = null;
    const dropOn = new Map<Cable, (cb: Cable, hit: Color | null) => Promise<void>>();
    const firstSocket = () => [...rings.values()][0];
    for (const cb of cablesList) {
      cb.plug.addEventListener('pointerdown', (e) => {
        if (busy || cb.done || f.finished) return;
        e.preventDefault();
        e.stopPropagation();
        active = cb;
        dragging = true;
        cb.plug.setPointerCapture?.(e.pointerId);
        cb.plug.style.cursor = 'grabbing';
        cb.pos = toLogical(e);
        placePlug(cb, true);
      });
      cb.plug.addEventListener('pointermove', (e) => {
        if (active !== cb || !dragging) return;
        cb.pos = toLogical(e);
        placePlug(cb, true);
      });
      const release = async (e: PointerEvent) => {
        if (active !== cb || !dragging) return;
        dragging = false;
        cb.plug.style.cursor = 'grab';
        const at = toLogical(e);
        let hit: Color | null = null,
          best = SOCKET_TOL; // generous margin: aiming at a socket with a finger on a small screen
        for (const c of colors) {
          const s = socketOf(c);
          const d = Math.hypot(s[0] - at[0], s[1] - at[1]);
          if (d < best) {
            best = d;
            hit = c;
          }
        }
        await drop(cb, hit);
      };
      const drop = async (cb: Cable, hit: Color | null) => {
        if (hit === cb.color) {
          cb.done = true;
          active = null;
          cb.pos = [cb.socket[0] - plugInset, cb.socket[1]];
          placePlug(cb, true);
          cb.plug.style.cursor = 'default';
          rings.get(cb.color)?.classList.remove('mg-hl');
          if (stamp) ctx.sfx(stamp);
          knotScale();
          updateHelp();
          if (cablesList.every((c) => c.done)) void win();
          return;
        }
        if (hit) {
          busy = true;
          misses++;
          await gag();
          busy = false;
          updateHelp();
        }
        await returnPlug(cb);
        active = null;
      };
      cb.plug.addEventListener('pointerup', release);
      cb.plug.addEventListener('pointercancel', release);
      // At the keyboard: Enter on a plug picks it up (its cable lights up), Enter on a socket plugs it there.
      operable(cb.plug, `${ctx.labels.plug ?? '⏚'} ${cb.color}`, () => {
        if (busy || cb.done || f.finished) return;
        if (held && held !== cb) {
          held.pos = [...held.rest] as P;
          placePlug(held, false);
        }
        held = cb;
        active = cb;
        cb.pos = [cb.rest[0] + 30, cb.rest[1]];
        placePlug(cb, true);
        firstSocket()?.focus?.({ preventScroll: true });
      });
      dropOn.set(cb, drop);
    }
    for (const [c, ring] of rings) {
      operable(ring, `${ctx.labels.socket ?? '◎'} ${c}`, async () => {
        const cb = held;
        if (!cb || busy || f.finished) return;
        held = null;
        await dropOn.get(cb)!(cb, c);
        const next = cablesList.find((x) => !x.done);
        next?.plug.focus?.({ preventScroll: true });
      });
      ring.style.pointerEvents = 'none';
    }
    queueMicrotask(() => cablesList[0]?.plug.focus?.({ preventScroll: true }));

    ctx.signal.addEventListener('abort', () => cancelAnimationFrame(raf), { once: true });
    skipButton(ctx, box, () => f.finish());
    return f.promise.then(() => {
      cancelAnimationFrame(raf);
      box.remove();
    });
  },
};
