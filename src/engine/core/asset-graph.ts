// The asset graph: which files each part of the game needs, from the content, in one place. The renderer's room
// preload, the background warm-up, the full offline plan, the provenance keys and the weight budgets all read it, so
// a file one of them knows about cannot escape the others (wiki/en/engine.how-it-works.md#assets).
//
// Keys: `img:<manifest image id>`, `sfx:<file>`, `music:<file>` (a score's stem files too), `voice:<file>`, `video:<file>`. Scopes:
// - `title`: the title screen (backdrop, logo, music, video), the column's and the map button's icons, the bag at the
//   start, the interface's sounds;
// - `room:<id>`: what showing and playing that room can ask for: its backdrop, props in every state and animation,
//   every character who can stand there (its actors, the playable characters who can reach it, characters moved
//   there) with variants, mouths and portrait, its music, and what its commands can play or show (sound effects,
//   music changes, voice clips, the icons of items gained there, the people called on the phone, the choices' card
//   images, the images and sounds a minigame is given);
// - `map`: the map's regions, portraits, vehicles and pins;
// - `game`: what the game-wide rules, events and scripts can play or show, in any room;
// - `offline`: every file the game ships (the manifest's images and videos, every audio file): the full warm-up.
// A room's scope over-approximates what one visit loads (all the variants, every character who could be there): the
// renderer loads a subset of it, never anything outside it.
import { eachCmd } from './cmds';
import type { Cmd, GameDef, Id, Layout, RoomDef } from './types';
import { stageImages } from './stage';
import { voiceBase } from './voice-key';

export type AssetKind = 'img' | 'sfx' | 'music' | 'voice' | 'video';
export interface AssetManifestLike {
  images: Record<string, unknown>;
  videos?: Record<string, unknown>;
}
/** Per minigame, the dotted param paths that name images and sound effects (`MinigameDefinition.bindings`). */
export type MinigameBindings = Record<Id, { images?: string[]; sfx?: string[] }>;

export interface AssetGraph {
  title: string[];
  map: string[];
  game: string[];
  rooms: Record<Id, string[]>;
  offline: string[];
}

const add = (out: Set<string>, kind: AssetKind, v: string | undefined) => {
  if (v) out.add(`${kind}:${v}`);
};
const asList = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const at = (o: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);

/** The images a character can show: sprites, mouths and portrait, its own and every variant's. */
export function characterImages(game: GameDef, c: Id): string[] {
  const def = game.characters[c];
  if (!def) return [];
  const out = new Set<string>();
  for (const set of [def.sprites, ...(def.variants ?? []).map((v) => v.sprites)])
    for (const frames of Object.values(set ?? {})) frames.forEach((f) => out.add(f));
  for (const m of [def.mouths, ...(def.variants ?? []).map((v) => v.mouths)])
    for (const ms of Object.values(m ?? {}))
      [ms.closed, ...ms.open, ms.blink, ms.smile].forEach((f) => f && out.add(f));
  for (const p of [def.portrait, ...(def.variants ?? []).map((v) => v.portrait)]) if (p) out.add(p);
  return [...out];
}

/** The images of a room's stage (backdrop, layers, masks, particles) and props (every state and animation frame):
 *  what the renderer draws for the place itself. */
export function roomImages(room: RoomDef, layout?: Layout): string[] {
  const out = new Set<string>([room.decor, ...stageImages(room, layout)]);
  for (const p of Object.values(room.props ?? {})) {
    if (p.img) out.add(p.img);
    Object.values(p.states ?? {}).forEach((x) => out.add(x));
    Object.values(p.anims ?? {}).forEach((a) => a.frames.forEach((f) => out.add(f)));
  }
  return [...out];
}

/** Every command list a room owns. */
function roomCmds(room: RoomDef): (Cmd[] | undefined)[] {
  return [
    room.onEnter,
    ...(room.on ?? []).map((r) => r.do),
    ...Object.values(room.talk ?? {}).flatMap((ts) => ts.map((t) => t.do)),
    ...(room.scripts ?? []).map((s) => s.do),
    ...(room.events ?? []).map((e) => e.do),
  ];
}

/**
 * A track's files: its single mix, or the stems of its score where the music director plays them (3.5). With
 * `stems` off (Save-Data, a low-end device: the director steps aside), the mix only.
 */
function addMusic(game: GameDef, out: Set<string>, id: Id | undefined, stems: boolean) {
  if (!id) return;
  const a = game.audio ?? {};
  const score = stems ? a.scores?.[id] : undefined;
  if (score) for (const f of Object.values(score.stems)) add(out, 'music', f);
  else add(out, 'music', a.music?.[id]);
}

/** The keyed clips (`<id>~<flag>=<value>…`, voice-key.ts) of `audio.voices`, by the line id they belong to. */
function keyedClips(voices: Record<Id, string> | undefined): Map<Id, string[]> {
  const out = new Map<Id, string[]>();
  for (const [k, f] of Object.entries(voices ?? {})) {
    const base = voiceBase(k);
    if (base !== k) out.set(base, [...(out.get(base) ?? []), f]);
  }
  return out;
}

/** What commands can play or show: sounds, music, voice clips, gained items' icons, phone callers, minigame assets. */
function cmdAssets(
  game: GameDef,
  lists: (Cmd[] | undefined)[],
  out: Set<string>,
  bindings: MinigameBindings,
  stems = true,
) {
  const a = game.audio ?? {};
  const keyed = keyedClips(a.voices);
  const voice = (id?: Id, explicit?: Id) => {
    const v = explicit ?? id;
    if (v && a.voices?.[v]) add(out, 'voice', a.voices[v]);
    // A line with switches has a clip per value (`<id>~<flag>=<value>`, voice-key.ts): any of them may play.
    if (!explicit && id) for (const f of keyed.get(id) ?? []) add(out, 'voice', f);
  };
  for (const list of lists)
    eachCmd(list, (c) => {
      if (typeof c === 'string') return;
      if ('sfx' in c) add(out, 'sfx', a.sfx?.[c.sfx]);
      else if ('music' in c) {
        const m = c.music;
        if (typeof m === 'string' || 'push' in m) addMusic(game, out, typeof m === 'string' ? m : m.push, stems);
        else if ('once' in m) add(out, 'music', a.music?.[m.once]);
        else if ('stinger' in m) {
          add(out, 'music', a.music?.[m.stinger]);
          if (!a.music?.[m.stinger]) add(out, 'sfx', a.sfx?.[m.stinger]);
        }
      } else if ('say' in c) voice(c.id, (c as { voice?: Id }).voice);
      else if ('toast' in c || 'guide' in c) voice(c.id);
      else if ('choice' in c)
        c.choice.forEach((o) => {
          voice(o.id);
          add(out, 'img', o.img);
        });
      else if ('gain' in c) add(out, 'img', game.items[c.gain]?.icon);
      else if ('transfer' in c) add(out, 'img', game.items[c.transfer[0]]?.icon);
      else if ('phone' in c) {
        for (const w of asList(c.phone))
          if (typeof w === 'string') characterImages(game, w).forEach((f) => add(out, 'img', f));
        add(out, 'sfx', a.sfx?.[game.skin?.sounds?.phone ?? '']);
      } else if ('minigame' in c) {
        const b = bindings[c.minigame] ?? {};
        for (const p of b.images ?? [])
          for (const v of asList(at(c.params, p) as string | string[] | undefined))
            if (typeof v === 'string') add(out, 'img', v);
        for (const p of b.sfx ?? [])
          for (const v of asList(at(c.params, p) as string | string[] | undefined))
            if (typeof v === 'string') add(out, 'sfx', a.sfx?.[v]);
      }
    });
}

/**
 * The rooms each playable character can stand in, from the exits, the map and the commands that send someone
 * somewhere: a character confined to its era never shows in another era's rooms.
 */
export function playerRooms(game: GameDef): Map<Id, Set<Id>> {
  const next = new Map<Id, Set<Id>>(game.rooms.map((r) => [r.id, new Set<Id>()]));
  const placeRooms = Object.values(game.map?.places ?? {}).map((p) => p.room);
  for (const r of game.rooms) {
    const n = next.get(r.id)!;
    for (const x of Object.values(r.exits ?? {})) n.add(x.to);
    for (const list of roomCmds(r))
      eachCmd(list, (c) => {
        if (typeof c !== 'string' && 'goto' in c) n.add(c.goto);
        if (typeof c !== 'string' && 'map' in c) placeRooms.forEach((p) => n.add(p));
      });
    if (placeRooms.includes(r.id)) placeRooms.forEach((p) => n.add(p));
  }
  for (const list of [
    ...(game.rules?.on ?? []).map((x) => x.do),
    ...(game.events ?? []).map((e) => e.do),
    ...(game.scripts ?? []).map((s) => s.do),
    game.start.intro,
  ])
    eachCmd(list, (c) => {
      if (typeof c !== 'string' && 'goto' in c) for (const n of next.values()) n.add(c.goto);
    });
  const out = new Map<Id, Set<Id>>();
  const ids = game.players?.ids ?? [game.hero];
  for (const p of ids) {
    const start = p === ids[0] ? game.start.room : (game.players?.start?.[p]?.room ?? game.start.room);
    const seen = new Set<Id>([start]);
    for (const q = [start]; q.length; )
      for (const n of next.get(q.pop()!) ?? [])
        if (!seen.has(n)) {
          seen.add(n);
          q.push(n);
        }
    for (const cp of Object.values(game.checkpoints ?? {})) {
      const r = cp.active === p ? cp.room : cp.players?.[p]?.room;
      if (r) seen.add(r);
    }
    out.set(p, seen);
  }
  return out;
}

export function assetGraph(
  game: GameDef,
  opts: {
    manifest?: AssetManifestLike;
    bindings?: MinigameBindings;
    layouts?: Record<Id, Layout>;
    stems?: boolean;
  } = {},
): AssetGraph {
  const a = game.audio ?? {};
  // The music director's stems where a score has them (the default), else the single mixes.
  const stems = opts.stems ?? true;
  const bindings = opts.bindings ?? {};
  const reach = playerRooms(game);
  // Characters moved into a room by a command, wherever the command is.
  const movedTo = new Map<Id, Set<Id>>();
  const allLists = [
    ...game.rooms.flatMap(roomCmds),
    ...(game.rules?.on ?? []).map((x) => x.do),
    ...(game.events ?? []).map((e) => e.do),
    ...(game.scripts ?? []).map((s) => s.do),
    game.start.intro,
  ];
  for (const list of allLists)
    eachCmd(list, (c) => {
      if (typeof c !== 'string' && 'moveActor' in c)
        (movedTo.get(c.moveActor[1]) ?? (movedTo.set(c.moveActor[1], new Set()), movedTo.get(c.moveActor[1])!)).add(
          c.moveActor[0],
        );
    });

  const rooms: Record<Id, string[]> = {};
  for (const r of game.rooms) {
    const out = new Set<string>(roomImages(r, opts.layouts?.[r.id]).map((f) => `img:${f}`));
    const chars = new Set<Id>([...Object.values(r.actors ?? {}).map((x) => x.char), ...(movedTo.get(r.id) ?? [])]);
    for (const [p, rs] of reach) if (rs.has(r.id)) chars.add(p);
    for (const [id, c] of Object.entries(game.characters)) if (c.room === r.id) chars.add(id);
    for (const c of chars) characterImages(game, c).forEach((f) => out.add(`img:${f}`));
    addMusic(game, out, r.music, stems);
    cmdAssets(game, roomCmds(r), out, bindings, stems);
    rooms[r.id] = [...out].sort();
  }

  const title = new Set<string>();
  const T = game.titleScreen;
  add(title, 'img', T?.decor);
  add(title, 'img', T?.logo);
  addMusic(game, title, T?.music, stems);
  add(title, 'video', T?.video);
  const icons = game.skin?.icons;
  for (const x of [icons?.map, icons?.pause, icons?.music]) add(title, 'img', x);
  for (const it of game.start.inventory ?? []) add(title, 'img', game.items[it]?.icon);
  cmdAssets(game, [game.start.intro], title, bindings, stems);

  const map = new Set<string>();
  const M = game.map;
  for (const reg of Object.values(M?.regions ?? {})) add(map, 'img', reg.image);
  for (const p of Object.values(M?.places ?? {})) for (const f of asList(p.portrait)) add(map, 'img', f);
  for (const v of Object.values(M?.vehicles ?? {})) add(map, 'img', v);
  addMusic(game, map, M?.music, stems);
  for (const x of [icons?.pin, icons?.news, icons?.plane, icons?.car]) add(map, 'img', x);
  add(map, 'sfx', game.skin?.sounds?.plane ? a.sfx?.[game.skin.sounds.plane] : undefined);

  const g = new Set<string>();
  cmdAssets(
    game,
    [
      ...(game.rules?.on ?? []).map((x) => x.do),
      ...(game.events ?? []).map((e) => e.do),
      ...(game.scripts ?? []).map((s) => s.do),
    ],
    g,
    bindings,
    stems,
  );
  // Answers by kind (`rules.kinds`) speak with their id's voice clip, in any room.
  const keyed = keyedClips(a.voices);
  for (const k of game.rules?.kinds ?? []) {
    const id = (k as { id?: Id }).id;
    if (id && a.voices?.[id]) add(g, 'voice', a.voices[id]);
    if (id) for (const f of keyed.get(id) ?? []) add(g, 'voice', f);
  }
  for (const x of Object.values(icons ?? {}))
    for (const f of asList(x as string | string[] | undefined)) add(g, 'img', f);
  for (const s of Object.values(game.skin?.sounds ?? {})) add(g, 'sfx', s ? a.sfx?.[s] : undefined);
  for (const it of Object.values(game.items)) add(g, 'img', it.icon);
  add(g, 'video', game.creditsScreen?.video);
  add(g, 'img', game.creditsScreen?.decor);

  // With the manifest, the images and videos are the files it lists (a sprite sheet's every cell, an image only a
  // custom command draws): a content reference the manifest lacks is a validation error, not a file to cache.
  const offline = new Set<string>(
    opts.manifest
      ? []
      : [...Object.values(rooms).flat(), ...title, ...map, ...g].filter(
          (k) => k.startsWith('img:') || k.startsWith('video:'),
        ),
  );
  if (opts.manifest) {
    Object.keys(opts.manifest.images).forEach((id) => offline.add(`img:${id}`));
    Object.keys(opts.manifest.videos ?? {}).forEach((f) => offline.add(`video:${f}`));
  }
  for (const f of Object.values(a.sfx ?? {})) offline.add(`sfx:${f}`);
  for (const f of Object.values(a.music ?? {})) offline.add(`music:${f}`);
  // Both the stems and the mix: which one a device plays is decided there (dom/director.ts `directorFits`).
  for (const sc of Object.values(a.scores ?? {})) for (const f of Object.values(sc.stems)) offline.add(`music:${f}`);
  for (const f of Object.values(a.voices ?? {})) offline.add(`voice:${f}`);
  for (const m of Object.values(a.voicesByLang ?? {})) for (const f of Object.values(m)) offline.add(`voice:${f}`);
  return { title: [...title].sort(), map: [...map].sort(), game: [...g].sort(), rooms, offline: [...offline].sort() };
}

/** What the first room needs before it is playable, with the title: the `initial` scope of the weight budgets. */
export function initialScope(graph: AssetGraph, game: GameDef): string[] {
  return [...new Set([...graph.title, ...(graph.rooms[game.start.room] ?? [])])].sort();
}

/** A key's kind and id (`img:hero/r1c1` → ['img', 'hero/r1c1']). */
export const splitKey = (k: string): [AssetKind, string] => [
  k.slice(0, k.indexOf(':')) as AssetKind,
  k.slice(k.indexOf(':') + 1),
];
