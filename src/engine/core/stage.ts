// A room's stage, normalized (3.4): the layers, lights, particles and walk zones the painters and the walker read,
// whatever the room was written with. An old room (`decor`, one `walk` polygon) is a stage of one backdrop layer and
// one zone named `main`: nothing to rewrite, and its picture does not change (tests/visual). Pure: no DOM.
import { must } from './must';
import type { Cond, EmitterDef, Id, Layout, LightDef, Point, RoomDef, StageLayer, TransitionKind } from './types';

interface NormalLayer extends StageLayer {
  x: number;
  y: number;
  /** Depth line: a scenery layer sorts with the characters by it; the other roles have their own band. */
  z: number;
  parallax: [number, number];
  blend: 'normal' | 'multiply' | 'screen' | 'overlay';
  opacity: number;
}
export interface NormalZone {
  id: Id;
  area: Point[];
  holes: Point[][];
  scale?: [[number, number], [number, number]];
  elevation: number;
  zoom: number;
}
export interface NormalLink {
  id: Id;
  from: { zone: Id; at: Point };
  to: { zone: Id; at: Point };
  mode: 'walk' | 'stairs' | 'ladder' | 'jump' | 'teleport';
  anim?: string;
  ms: number;
  facing?: 'left' | 'right';
  oneWay: boolean;
  if?: Cond;
  locked?: string;
}
export interface NormalStage {
  layers: NormalLayer[];
  lights: (LightDef & { at?: Point; radius?: number })[];
  emitters: (EmitterDef & { area?: [number, number, number, number] })[];
  occluders: { id: Id; polygon?: Point[]; mask?: Id; layer?: Id; z: number; feather: number; invert: boolean }[];
  zones: NormalZone[];
  links: NormalLink[];
  transition: { kind: TransitionKind; ms: number };
  /** Features only the canvas painter draws (masks from images or layers, lights, particles, blend modes). */
  canvasOnly: string[];
}

/** Depth bands: backdrop behind everything, foreground and effects in front of every character (y ≤ 400 + props' 200). */
export const Z_BACKDROP = -1000,
  Z_FOREGROUND = 10000;
const Z_EFFECT = 20000;
const LINK_MS: Record<NormalLink['mode'], number> = { walk: 0, stairs: 900, ladder: 1200, jump: 600, teleport: 300 };

export function stageOf(room: RoomDef, layout: Layout = {}): NormalStage {
  const st = room.stage ?? {};
  const written = st.layers ?? [];
  // The backdrop is `decor` unless a layer says otherwise.
  const layers0: StageLayer[] = written.some((l) => l.role === 'backdrop')
    ? written
    : [{ id: 'decor', image: room.decor, role: 'backdrop' }, ...written];
  const band = (role: StageLayer['role']) =>
    role === 'backdrop' ? Z_BACKDROP : role === 'foreground' ? Z_FOREGROUND : role === 'effect' ? Z_EFFECT : 0;
  const layers: NormalLayer[] = layers0.map((l, i) => {
    const g = layout.layers?.[l.id] ?? {};
    return {
      ...l,
      x: g.x ?? 0,
      y: g.y ?? 0,
      z: l.role === 'scenery' ? (g.z ?? 0) : band(l.role) + (g.z ?? i),
      parallax: g.parallax ?? [1, 1],
      blend: g.blend ?? 'normal',
      opacity: g.opacity ?? 1,
    };
  });
  const zones: NormalZone[] = layout.walkZones
    ? Object.entries(layout.walkZones).map(([id, z]) => ({
        id,
        area: z.area,
        holes: z.holes ?? [],
        ...(z.scale ? { scale: z.scale } : layout.scale ? { scale: layout.scale } : {}),
        elevation: z.elevation ?? 0,
        zoom: z.zoom ?? 1,
      }))
    : layout.walk
      ? [
          {
            id: 'main',
            area: layout.walk.area,
            holes: layout.walk.holes ?? [],
            ...(layout.scale ? { scale: layout.scale } : {}),
            elevation: 0,
            zoom: 1,
          },
        ]
      : [];
  const links: NormalLink[] = Object.entries(layout.walkLinks ?? {}).map(([id, l]) => ({
    id,
    from: l.from,
    to: l.to,
    mode: l.mode,
    ...(l.anim ? { anim: l.anim } : {}),
    ms: l.ms ?? LINK_MS[l.mode],
    ...(l.facing ? { facing: l.facing } : {}),
    oneWay: !!l.oneWay,
    ...(st.links?.[id]?.if !== undefined ? { if: st.links[id].if } : {}),
    ...(st.links?.[id]?.locked ? { locked: st.links[id].locked } : {}),
  }));
  const lights = (st.lights ?? []).map((l) => ({ ...l, ...(layout.lights?.[l.id] ?? {}) }));
  const emitters = (st.emitters ?? []).map((e) => ({ ...e, ...(layout.emitters?.[e.id] ?? {}) }));
  const occluders = Object.entries(layout.occluders ?? {}).map(([id, o]) => ({
    id,
    ...(o.polygon ? { polygon: o.polygon } : {}),
    ...(o.mask ? { mask: o.mask } : {}),
    ...(o.layer ? { layer: o.layer } : {}),
    z: o.z,
    feather: o.feather ?? 0,
    invert: !!o.invert,
  }));
  const t = st.transition ?? 'cut';
  const transition =
    typeof t === 'string'
      ? { kind: t, ms: t === 'cut' ? 0 : 400 }
      : { kind: t.kind, ms: t.ms ?? (t.kind === 'cut' ? 0 : 400) };
  const canvasOnly = [
    ...occluders
      .filter((o) => o.mask || o.layer || o.feather || o.invert)
      .map(
        (o) =>
          `occluder ${o.id} (${o.mask ? 'mask image' : o.layer ? 'layer alpha' : o.feather ? 'feather' : 'invert'})`,
      ),
    ...lights.map((l) => `light ${l.id}`),
    ...emitters.map((e) => `emitter ${e.id}`),
    ...layers.filter((l) => l.blend !== 'normal').map((l) => `layer ${l.id} (blend ${l.blend})`),
  ];
  return { layers, lights, emitters, occluders, zones, links, transition, canvasOnly };
}

/** The painter a room asks for (room, then game, then the DOM reference). */
export const rendererOf = (room: RoomDef, game: { renderer?: 'dom' | 'canvas' }): 'dom' | 'canvas' =>
  room.renderer ?? game.renderer ?? 'dom';

/** Every image a room's stage can show (layers, masks, particle images): for the asset graph. */
export function stageImages(room: RoomDef, layout: Layout = {}): Id[] {
  const s = stageOf(room, layout);
  return [
    ...new Set([
      ...s.layers.map((l) => l.image),
      ...s.occluders.flatMap((o) => (o.mask ? [o.mask] : [])),
      ...s.emitters.flatMap((e) => (e.image ? [e.image] : [])),
    ]),
  ];
}

/** A character's scale from its depth (feet y) on a `[[back y, scale], [front y, scale]]` ramp; 1 without one. */
export function depthScale(scale: Layout['scale'], y: number): number {
  if (!scale) return 1;
  const [[y0, s0], [y1, s1]] = scale;
  const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
  return s0 + (s1 - s0) * t;
}

/** Character scale at a point of a room: the walk zone it stands in (`walkZones`), else the layout's `scale`. */
export function scaleAt(layout: Layout, p: Point): number {
  const z = Object.values(layout.walkZones ?? {}).find((z) => inPolygon(p, z.area));
  return depthScale(z?.scale ?? layout.scale, p[1]);
}

/** Whether a point is inside a polygon (even-odd). */
export function inPolygon(p: Point, poly: Point[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = must(poly[i], 'polygon vertex'),
      [xj, yj] = must(poly[j], 'polygon vertex');
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
