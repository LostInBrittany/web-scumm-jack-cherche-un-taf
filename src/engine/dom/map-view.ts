// The map: places, travel, regions, and the travel animation.
// Part of the player (4.1.0 "Clarity"): App's methods of the same name forward here.
import { check } from '../core/cond';
import { must } from '../core/must';
import type { GameState, Id, PlaceDef } from '../core/types';
import { roving } from './a11y';
import { el, esc, sleep } from './app-shared';
import type { App } from './app';

// ---------------------------------------------------------------- map
export async function openMap(app: App, state: GameState): Promise<Id | null> {
  const map = app.game.map;
  if (!map) return null;
  const here = Object.entries(map.places).find(([, p]) => p.room === state.room)?.[0];
  let region = here ? must(map.places[here], `place ${here}`).region : map.start;
  if (map.music) app.audio.push(map.music);
  const ov = el('div', 'overlay mapview');
  ov.style.background = '#000';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', app.game.ui.mapTitle);
  app.scene.append(ov);
  app.verbsEl.hidden = true;
  app.invEl.hidden = true;
  app.invNav.hidden = true;
  // The place list is a prompt like a `choice`: `choosing` keeps refresh() from dimming the side column (busy) while
  // the player is expected to tap it. Without it, any refresh during the map (a script tick, a save) made the list
  // untappable; CI runners hit it, phones can too.
  app.choosing = true;
  app.side.classList.remove('off');
  const list = el('div', 'choices');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', app.game.ui.mapTitle);
  roving(list, '.choice');
  app.side.insertBefore(list, app.toolsEl);
  const places = () =>
    Object.entries(map.places).filter(([id, p]) => state.unlocked.includes(id) && p.region === region);
  const icons = app.game.skin.icons;
  const pin = map.vehicles?.pin ?? icons.pin,
    newsImg = map.vehicles?.news ?? icons.news;
  const cleanup = () => {
    app.choosing = false;
    ov.remove();
    list.remove();
    app.verbsEl.hidden = false;
    app.invEl.hidden = false;
    app.renderInv();
    if (map.music) app.audio.pop();
  };

  return new Promise<Id | null>((resolve) => {
    let layer: HTMLElement = ov;
    let svg: SVGSVGElement;
    const draw = () => {
      ov.innerHTML = '';
      list.innerHTML = '';
      const R = must(map.regions[region], `map region ${region}`);
      const parent = R.parent ? map.regions[R.parent] : null;
      if (parent) {
        const bg = el('img', 'bg') as HTMLImageElement;
        bg.src = app.bank.img(parent.image);
        Object.assign(bg.style, {
          position: 'absolute',
          inset: '0',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'blur(3px) brightness(.55)',
        });
        ov.append(bg);
        const [w, h] = app.bank.size(R.image);
        layer = el('div');
        Object.assign(layer.style, {
          position: 'absolute',
          top: '2.5%',
          bottom: '2.5%',
          left: '50%',
          transform: 'translateX(-50%)',
          aspectRatio: `${w}/${h}`,
        });
        const im = el('img') as HTMLImageElement;
        im.src = app.bank.img(R.image);
        Object.assign(im.style, {
          width: '100%',
          height: '100%',
          display: 'block',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.6))',
        });
        layer.append(im);
        ov.append(layer);
      } else {
        layer = el('div');
        Object.assign(layer.style, { position: 'absolute', inset: '0' });
        const im = el('img') as HTMLImageElement;
        im.src = app.bank.img(R.image);
        Object.assign(im.style, { width: '100%', height: '100%', objectFit: 'cover' });
        layer.append(im);
        ov.append(layer);
      }
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      Object.assign(svg.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      });
      layer.append(svg);
      const size = parent ? 7.5 : 6;
      list.append(el('div', 'who', `<img src="${app.bank.img(icons.map)}" alt="">${esc(app.game.ui.mapTitle)}`));
      // One pin per place, except the places that join another's pin (4.4.0): their faces sit on it, each face a way
      // to its own place. Several faces (a portrait list, or joined places) sit side by side, overlapping a little: the
      // pin widens, each face keeps its size.
      const groups = new Map<Id, [Id, PlaceDef][]>();
      for (const [id, p] of places()) {
        const host = p.joins ?? id;
        groups.set(host, [...(groups.get(host) ?? []), [id, p]]);
      }
      for (const [host, members] of groups) {
        const at = (map.places[host] ?? members[0]![1]).pos;
        const faces = members.flatMap(([id, p]) =>
          (p.portrait === undefined ? (pin ? [pin] : []) : ([] as Id[]).concat(p.portrait)).map((img) => ({
            id,
            p,
            img,
          })),
        );
        const n = Math.max(1, faces.length);
        const fw = 100 / (1 + 0.6 * (n - 1));
        const style = (i: number) =>
          n > 1
            ? ` style="width:${fw}%;${i ? `margin-left:${-0.4 * fw}%;` : ''}position:relative;z-index:${n - i}"`
            : '';
        const needle = pin
          ? `<img class="needle" src="${app.bank.img(pin)}" alt=""${n > 1 ? ` style="width:${0.4 * fw}%"` : ''}>`
          : '';
        const isHere = members.some(([id]) => id === here);
        const news = members.some(([, p]) => (p.news ? check(p.news, state) : false));
        let b: HTMLElement;
        if (members.length === 1) {
          // One place: the pin is its button, as before.
          const [id, p] = members[0]!;
          b = el('button', 'pin' + (isHere ? ' here' : ''));
          b.setAttribute('aria-label', p.name);
          const faceHtml = faces
            .map((f, i) => `<img class="face" src="${app.bank.img(f.img)}" alt=""${style(i)}>`)
            .join('');
          b.innerHTML = (n > 1 ? `<span class="faces" style="display:flex">${faceHtml}</span>` : faceHtml) + needle;
          b.onclick = () => void go(id);
        } else {
          // Several places: one button per face, each named after its place.
          b = el('div', 'pin' + (isHere ? ' here' : ''));
          const row = el('span', 'faces');
          row.style.display = 'flex';
          faces.forEach((f, i) => {
            const fb = el('button', 'facebtn' + (f.id === here ? ' here' : ''));
            fb.setAttribute('aria-label', f.p.name);
            fb.innerHTML = `<img class="face" src="${app.bank.img(f.img)}" alt="">`;
            Object.assign(fb.style, {
              width: `${fw}%`,
              marginLeft: i ? `${-0.4 * fw}%` : '0',
              position: 'relative',
              zIndex: `${n - i}`,
            });
            fb.onclick = () => void go(f.id);
            row.append(fb);
          });
          b.append(row);
          b.insertAdjacentHTML('beforeend', needle);
        }
        Object.assign(b.style, { left: `${at[0]}%`, top: `${at[1]}%`, width: `${size * 1.1 * (1 + 0.6 * (n - 1))}%` });
        if (news && newsImg)
          b.insertAdjacentHTML('beforeend', `<img class="news" src="${app.bank.img(newsImg)}" alt="">`);
        layer.append(b);
      }
      for (const [id, p] of places()) {
        const news = p.news ? check(p.news, state) : false;
        const li = el('button', 'choice', `• ${esc(p.name)}${news ? ' <span style="color:#ffd84d">!</span>' : ''}`);
        li.onclick = () => void go(id);
        list.append(li);
      }
      // zoom button to the parent or child region
      const child = Object.entries(map.regions).find(([, r]) => r.parent === region);
      const other = R.parent ?? child?.[0];
      if (other) {
        const sw = el('button', 'bigbtn', esc(R.parent ? app.game.ui.world + ' ⤢' : app.game.ui.zoomIn + ' ⤡'));
        Object.assign(sw.style, {
          position: 'absolute',
          right: '2%',
          bottom: '3%',
          color: '#ffd84d',
          fontSize: `${Math.max(8, Math.round(app.sw * 0.016))}px`,
          zIndex: '20',
        });
        sw.onclick = () => {
          region = other;
          draw();
        };
        ov.append(sw);
      }
      const back = el('button', 'choice gl', '• ' + esc(app.game.ui.mapBack));
      back.onclick = () => {
        cleanup();
        resolve(null);
      };
      list.append(back);
      queueMicrotask(() => list.querySelector<HTMLElement>('.choice')?.focus({ preventScroll: true }));
    };
    const go = async (id: Id) => {
      if (id === here) {
        cleanup();
        resolve(null);
        return;
      }
      const p = must(map.places[id], `place ${id}`);
      const herePlace = here ? must(map.places[here], `place ${here}`) : undefined;
      // Two places of the same pin (4.4.0): no journey to draw.
      if (here && (herePlace?.joins ?? here) === (p.joins ?? id)) {
        cleanup();
        resolve(id);
        return;
      }
      const posOf = (q: PlaceDef) => (q.joins ? (map.places[q.joins]?.pos ?? q.pos) : q.pos);
      const to = posOf(p);
      const from = herePlace && herePlace.region === region ? posOf(herePlace) : null;
      const origin = from ?? [50, 50];
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mx = (origin[0] + to[0]) / 2,
        my = Math.min(origin[1], to[1]) - 10;
      path.setAttribute('d', `M${origin[0]} ${origin[1] - 2} Q${mx} ${my} ${to[0]} ${to[1] - 2}`);
      Object.assign(path.style, {
        fill: 'none',
        stroke: '#e02828',
        strokeWidth: '3',
        vectorEffect: 'non-scaling-stroke',
      });
      svg.append(path);
      const L = path.getTotalLength();
      path.style.strokeDasharray = `${L}`;
      path.style.strokeDashoffset = `${L}`;
      path.style.transition = 'stroke-dashoffset 1.6s linear';
      requestAnimationFrame(() => {
        path.style.strokeDashoffset = '0';
      });
      const veh = el('img') as HTMLImageElement;
      const vehImg = p.vehicle === 'plane' ? (map.vehicles?.plane ?? icons.plane) : (map.vehicles?.car ?? icons.car);
      if (vehImg) veh.src = app.bank.img(vehImg);
      Object.assign(veh.style, {
        position: 'absolute',
        width: p.vehicle === 'plane' ? '6%' : '4%',
        transform: 'translate(-50%,-50%)',
        zIndex: '15',
        pointerEvents: 'none',
      });
      if (vehImg) layer.append(veh);
      const planeSfx = app.game.skin.sounds?.plane;
      if (p.vehicle === 'plane' && planeSfx) app.audio.sfx(planeSfx);
      const t0 = performance.now();
      await new Promise<void>((r) => {
        const f = (n: number) => {
          const k = Math.min(1, (n - t0) / 1600);
          const pt = path.getPointAtLength(L * k);
          veh.style.left = `${pt.x}%`;
          veh.style.top = `${pt.y}%`;
          if (k < 1) requestAnimationFrame(f);
          else r();
        };
        requestAnimationFrame(f);
      });
      await sleep(300);
      cleanup();
      resolve(id);
    };
    draw();
  });
}
