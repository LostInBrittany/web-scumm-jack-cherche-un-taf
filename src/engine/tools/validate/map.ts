// The validator's checks of the travel map: its regions and their images, each place's room, region, faces (one
// portrait or several, 4.4.0), news condition and the pin it joins (4.4.0: an existing place of the same region that
// joins no other pin), the vehicles' images and the map's music.
import type { Cond, GameDef } from '../../core/types';

export function mapChecks(
  game: GameDef,
  o: {
    err: (where: string, msg: string) => void;
    img: (id: string | undefined, where: string) => void;
    cond: (c: Cond | undefined, where: string) => void;
    rooms: { has: (id: string) => boolean };
    music: Record<string, unknown>;
  },
): void {
  const m = game.map;
  if (!m) return;
  const { err, img, cond, rooms, music } = o;
  if (!m.regions[m.start]) err('map', `unknown start region: "${m.start}"`);
  for (const [rid, reg] of Object.entries(m.regions)) {
    img(reg.image, `map.${rid}`);
    if (reg.parent && !m.regions[reg.parent]) err(`map.${rid}`, `unknown parent region: "${reg.parent}"`);
  }
  for (const [pid, p] of Object.entries(m.places)) {
    const w = `map.${pid}`;
    if (!rooms.has(p.room)) err(w, `unknown room: "${p.room}"`);
    if (!m.regions[p.region]) err(w, `unknown region: "${p.region}"`);
    for (const f of ([] as string[]).concat(p.portrait ?? [])) img(f, w);
    if (p.joins !== undefined) {
      const host = m.places[p.joins];
      if (p.joins === pid) err(w, 'joins itself');
      else if (!host) err(w, `joins an unknown place: "${p.joins}"`);
      else if (host.joins) err(w, `joins "${p.joins}", which joins another pin itself`);
      else if (host.region !== p.region) err(w, `joins "${p.joins}", in another region`);
    }
    cond(p.news, w);
  }
  for (const v of Object.values(m.vehicles ?? {})) img(v, 'map.vehicles');
  if (m.music && !music[m.music]) err('map', `unknown music: "${m.music}"`);
}
