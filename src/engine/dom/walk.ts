import earcut from 'earcut';
// The named export, not the default (4.1.8): `navmesh` is a CommonJS/UMD module, and a bundler that follows Node's
// rule hands a default import the whole `module.exports`, not the class (Vite 8's Rolldown; Vite 6 took `.default`).
import { NavMesh } from 'navmesh';
import { must } from '../core/must';
import type { Layout, Point } from '../core/types';
import { depthScale, inPolygon, stageOf, type NormalLink, type NormalZone } from '../core/stage';
import { zoneRoute } from '../core/motion';

/** A walkable zone: triangulated once, then shortest paths between two points. */
export class WalkArea {
  private mesh: NavMesh | null = null;
  private tris: Point[][] = [];
  /** Boundary edges (outer polygon and holes), for line-of-sight tests. */
  private edges: [Point, Point][] = [];

  /** A layout's single `walk` polygon, or a zone `{ area, holes }`. */
  constructor(layoutOrZone: Layout | { area: Point[]; holes?: Point[][] }) {
    const w =
      'area' in layoutOrZone ? (layoutOrZone as { area: Point[]; holes?: Point[][] }) : (layoutOrZone as Layout).walk;
    if (!w || w.area.length < 3) return;
    const flat: number[] = [];
    const holes: number[] = [];
    for (const p of w.area) flat.push(p[0], p[1]);
    for (const h of w.holes ?? []) {
      holes.push(flat.length / 2);
      for (const p of h) flat.push(p[0], p[1]);
    }
    for (const poly of [w.area, ...(w.holes ?? [])])
      poly.forEach((p, i) => this.edges.push([p, must(poly[(i + 1) % poly.length], 'next vertex')]));
    const tri = earcut(flat, holes.length ? holes : undefined);
    const polys: { x: number; y: number }[][] = [];
    for (let i = 0; i < tri.length; i += 3)
      polys.push(
        [0, 1, 2].map((k) => {
          // earcut returns whole triangles of indices into `flat`.
          const v = must(tri[i + k], 'triangle vertex');
          return { x: must(flat[v * 2], 'vertex x'), y: must(flat[v * 2 + 1], 'vertex y') };
        }),
      );
    this.tris = polys.map((t) => t.map((v) => [v.x, v.y] as Point));
    this.mesh = new NavMesh(polys);
  }

  /** Closest point inside the zone. */
  clamp(p: Point): Point {
    if (!this.mesh || this.mesh.isPointInMesh({ x: p[0], y: p[1] })) return p;
    // projection onto the nearest triangle edge, nudged in by half a pixel
    let best: Point = p,
      bd = Infinity;
    for (const t of this.tris)
      for (let i = 0; i < 3; i++) {
        const a = must(t[i], 'triangle corner'),
          b = must(t[(i + 1) % 3], 'triangle corner');
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          L = dx * dx + dy * dy || 1;
        const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
        const q: Point = [a[0] + dx * k, a[1] + dy * k];
        const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
        if (d < bd) {
          bd = d;
          const [t0, t1, t2] = [must(t[0], 'corner 0'), must(t[1], 'corner 1'), must(t[2], 'corner 2')];
          const cx = (t0[0] + t1[0] + t2[0]) / 3,
            cy = (t0[1] + t1[1] + t2[1]) / 3;
          best = [q[0] + (cx - q[0]) * 0.02, q[1] + (cy - q[1]) * 0.02];
        }
      }
    return best;
  }

  /** Is the straight segment free: it crosses no boundary edge, and its middle is inside the zone? */
  private free(a: Point, b: Point): boolean {
    if (!this.mesh) return true;
    const mid = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
    if (!this.mesh.isPointInMesh(mid)) return false;
    const cross = (o: Point, p: Point, q: Point) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    for (const [c, d] of this.edges) {
      const d1 = cross(a, b, c),
        d2 = cross(a, b, d),
        d3 = cross(c, d, a),
        d4 = cross(c, d, b);
      // proper crossing only: touching an edge or a vertex is allowed (points are clamped onto the zone)
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return false;
    }
    return true;
  }

  /**
   * Path (successive points, excluding the start). With no defined zone: a straight line. The navmesh's path follows
   * the triangulation and can take detours around a corner it does not need: it is then pulled straight, point by
   * point, as long as the shortcut stays in the zone.
   */
  path(from: Point, to: Point): Point[] {
    if (!this.mesh) return [to];
    const a = this.clamp(from),
      b = this.clamp(to);
    if (this.free(a, b)) return [b];
    const res = this.mesh.findPath({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
    if (!res || !res.length) return [b];
    const pts = [a, ...res.slice(1).map((v) => [v.x, v.y] as Point)];
    const out: Point[] = [];
    for (let i = 0; i < pts.length - 1; ) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.free(must(pts[i], 'path point'), must(pts[j], 'path point'))) j--;
      out.push(must(pts[j], 'path point'));
      i = j;
    }
    return out;
  }
}

/** One move of a walk: to a point, either walking or through a link (stairs, a ladder, a jump, a teleport). */
export interface WalkStep {
  to: Point;
  via?: NormalLink;
}

/**
 * A room's floors (3.4): its walk zones (`layout.walkZones`, else the single `walk` as zone `main`) joined by its
 * walk links. A path inside a zone is the zone's shortest path; across zones, the fewest links, then walking to each
 * link's start, crossing it (its mode, duration and facing), and on. A closed link (`stage.links[id].if`) is not
 * crossed: the walk stops before it (`blocked`). Each zone has its own depth scale. Presentation only: the solver and
 * the rules never read it.
 */
export class WalkTopology {
  readonly zones: NormalZone[];
  readonly links: NormalLink[];
  private areas = new Map<string, WalkArea>();

  constructor(
    private layout: Layout,
    room?: Parameters<typeof stageOf>[0],
  ) {
    const S = stageOf(room ?? ({ id: '', name: '', decor: '' } as Parameters<typeof stageOf>[0]), layout);
    this.zones = S.zones;
    this.links = S.links;
    for (const z of this.zones) this.areas.set(z.id, new WalkArea(z));
  }

  /** The zone a point stands in (else the nearest one), or null when the room has no zone at all. */
  zoneAt(p: Point): NormalZone | null {
    if (!this.zones.length) return null;
    const inside = this.zones.filter((z) => inPolygon(p, z.area) && !z.holes.some((h) => inPolygon(p, h)));
    if (inside.length) return inside.reduce((a, b) => (b.elevation > a.elevation ? b : a));
    let best = must(this.zones[0], 'first zone'),
      bd = Infinity;
    for (const z of this.zones) {
      const q = this.areas.get(z.id)!.clamp(p);
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  }

  /** The closest walkable point (in the point's zone). */
  clamp(p: Point): Point {
    const z = this.zoneAt(p);
    return z ? this.areas.get(z.id)!.clamp(p) : p;
  }

  /** Character scale at a point: its zone's `scale`, else the layout's. */
  scaleAt(p: Point): number {
    const z = this.zoneAt(p);
    return depthScale(z?.scale ?? this.layout.scale, p[1]);
  }

  /**
   * The steps from one point to another. `open` says whether a link can be crossed now (its condition). When the
   * target's zone cannot be reached, the walk goes as near as it can and `blocked` is the closed link in the way.
   */
  route(
    from: Point,
    to: Point,
    open: (link: NormalLink) => boolean = () => true,
  ): { steps: WalkStep[]; blocked?: NormalLink } {
    const za = this.zoneAt(from),
      zb = this.zoneAt(to);
    if (!za || !zb) return { steps: [{ to }] };
    const inZone = (z: NormalZone, a: Point, b: Point): WalkStep[] =>
      this.areas
        .get(z.id)!
        .path(a, b)
        .map((p) => ({ to: p }));
    if (za.id === zb.id) return { steps: inZone(za, from, to) };
    // Fewest links (breadth first, core/motion.ts), only through open ones; remember a closed one met on the way.
    const g = zoneRoute(this.links, za.id, zb.id, open);
    const { seen, blocked } = g;
    // Unreachable: as far as the walk can go, the foot of the closed link in the way (else the nearest point of the
    // starting zone).
    let goal = zb.id,
      last: Point = to;
    if (!g.reached) {
      const near =
        blocked && (seen.has(blocked.from.zone) ? blocked.from : seen.has(blocked.to.zone) ? blocked.to : null);
      if (!near) return { steps: inZone(za, from, this.areas.get(za.id)!.clamp(to)), ...(blocked ? { blocked } : {}) };
      goal = near.zone;
      last = near.at;
    }
    const chain = g.chainTo(goal);
    const steps: WalkStep[] = [];
    let at = from,
      zone = za;
    for (const { link, forward } of chain) {
      const [start, end] = forward ? [link.from, link.to] : [link.to, link.from];
      steps.push(...inZone(zone, at, start.at));
      steps.push({ to: end.at, via: link });
      at = end.at;
      zone = this.zones.find((z) => z.id === end.zone)!;
    }
    steps.push(...inZone(zone, at, last));
    return { steps, ...(goal !== zb.id && blocked ? { blocked } : {}) };
  }
}
