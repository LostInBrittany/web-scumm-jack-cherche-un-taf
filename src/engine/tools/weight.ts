// What a player downloads, in bytes: before the first room can be played (`initial`: the app shell the service worker
// precaches, the title and the first room), to show each room, and over each chapter (every room a player can be in
// during it). The scopes come from the asset graph (src/engine/core/asset-graph.ts), which the renderer's preload, the
// warm-up and the offline plan read too; `scripts/e2e-weight.mjs` checks the prediction against the bytes a browser
// really transfers.
// `npm run weight` prints it against `assetBudgets` (`initialKB`, `roomKB`, `chapterKB`); wiki/en/create.checking.md#commands.
import {
  assetGraph,
  initialScope,
  type AssetGraph,
  type AssetManifestLike,
  type MinigameBindings,
} from '../core/asset-graph';
import type { GameDef, Id, Layout, RoomDef } from '../core/types';
import { transitionFor } from '../core/score';
import { must } from '../core/must';

export interface WeightBudgets {
  initialKB?: number;
  roomKB?: number;
  chapterKB?: number;
  backgroundScoreKB?: number;
  offlineTotalKB?: number;
  decodedAudioMB?: number;
  transitionPeakMB?: number;
}

/** Every budget a release must set (`npm run weight -- --release`). */
export const RELEASE_BUDGETS = [
  'initialKB',
  'roomKB',
  'chapterKB',
  'backgroundScoreKB',
  'offlineTotalKB',
  'decodedAudioMB',
  'transitionPeakMB',
] as const;

/** The stem files of every score (`music:<file>` keys): what the director downloads in the background. */
export function stemAssets(game: GameDef): string[] {
  return [
    ...new Set(Object.values(game.audio?.scores ?? {}).flatMap((s) => Object.values(s.stems).map((f) => `music:${f}`))),
  ].sort();
}

/** The largest score decoded, in bytes (its declared `pcmBytes`; 0 without scores, null when one does not say). */
function decodedAudio(game: GameDef): number | null {
  const pcm = Object.values(game.audio?.scores ?? {}).map((s) => s.pcmBytes);
  return pcm.includes(undefined) ? null : Math.max(0, ...(pcm as number[]));
}

/** The tracks the game plays as stingers (`{ music: { stinger } }`), as asset keys (`music:<file>` or `sfx:<file>`). */
export function stingerAssets(game: GameDef): string[] {
  const ids = new Set<string>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.stinger === 'string') ids.add(o.stinger);
    for (const x of Object.values(o)) walk(x);
  };
  walk(game);
  const music = game.audio?.music ?? {},
    sfx = game.audio?.sfx ?? {};
  return [...ids].flatMap((id) => (music[id] ? [`music:${music[id]}`] : sfx[id] ? [`sfx:${sfx[id]}`] : [])).sort();
}

/**
 * The most decoded audio the director holds at once (3.6.1): during a transition, the old score until its landing,
 * the new one and the bridge; without one, the largest score; plus the largest stinger on top. `pcm`: a file's decoded
 * bytes (ffprobe, tools/stem-facts.ts), null when unknown. Null when a score's `pcmBytes` or a file's weight is unknown.
 */
export function transitionPeak(game: GameDef, pcm: (key: string) => number | null): number | null {
  const scores = game.audio?.scores ?? {};
  const largest = decodedAudio(game);
  if (largest === null) return null;
  const music = game.audio?.music ?? {};
  let peak = largest;
  for (const from of Object.keys(scores))
    for (const to of Object.keys(scores)) {
      if (from === to) continue;
      const rule = transitionFor(game.audio?.transitions, from, to);
      if (!rule) continue;
      const bridge = rule.bridge && music[rule.bridge] ? pcm(`music:${music[rule.bridge]}`) : 0;
      if (bridge === null) return null;
      peak = Math.max(
        peak,
        must(scores[from], `score ${from}`).pcmBytes! + must(scores[to], `score ${to}`).pcmBytes! + bridge,
      );
    }
  let sting = 0;
  for (const k of stingerAssets(game)) {
    const b = pcm(k);
    if (b === null) return null;
    sting = Math.max(sting, b);
  }
  return peak + sting;
}

/** The asset keys a room can need (`room:<id>` of the asset graph, src/engine/core/asset-graph.ts). */
export function roomAssets(game: GameDef, room: RoomDef, graph: AssetGraph = assetGraph(game)): string[] {
  return graph.rooms[room.id] ?? [];
}

/** What the first room needs, plus the title, the column's icons and the bag at the start (the graph's initial scope). */
export function initialAssets(game: GameDef, graph: AssetGraph = assetGraph(game)): string[] {
  return initialScope(graph, game);
}

export interface Weighed {
  bytes: number;
  files: number;
  missing: string[];
}
export function weigh(keys: string[], sizes: Record<string, number | null>): Weighed {
  let bytes = 0,
    files = 0;
  const missing: string[] = [];
  for (const k of keys) {
    const b = sizes[k];
    if (b === null || b === undefined) missing.push(k);
    else {
      bytes += b;
      files++;
    }
  }
  return { bytes, files, missing };
}

export interface WeightReport {
  initial: Weighed;
  rooms: ({ id: Id } & Weighed)[];
  chapters: ({ id: string; rooms: Id[] } & Weighed)[];
  /** The scores' stems (3.6), every file the offline warm-up stores (app shell included), the largest score decoded. */
  background: Weighed;
  offline: Weighed;
  decodedAudio: number | null;
  /** The most decoded audio held at once (3.6.1: a transition's two scores and bridge, a stinger on top). */
  transitionPeak: number | null;
  /** One line per budget exceeded. */
  over: string[];
}

const kb = (b: number) => Math.round(b / 1024);

export function weightReport(
  game: GameDef,
  sizes: Record<string, number | null>,
  chapters: { id: string; rooms: Id[] }[] = [],
  budgets: WeightBudgets = game.assetBudgets ?? {},
  opts: {
    bindings?: MinigameBindings;
    layouts?: Record<Id, Layout>;
    shell?: string[];
    stems?: boolean;
    manifest?: AssetManifestLike;
    pcm?: (key: string) => number | null;
  } = {},
): WeightReport {
  const graph = assetGraph(game, {
    bindings: opts.bindings,
    layouts: opts.layouts,
    stems: opts.stems,
    manifest: opts.manifest,
  });
  const byRoom = new Map(game.rooms.map((r) => [r.id, roomAssets(game, r, graph)]));
  // The first visit: the app shell (what the service worker precaches, when the build is there) and the initial scope.
  const initial = weigh([...(opts.shell ?? []), ...initialAssets(game, graph)], sizes);
  const rooms = game.rooms
    .map((r) => ({ id: r.id, ...weigh(byRoom.get(r.id)!, sizes) }))
    .sort((a, b) => b.bytes - a.bytes);
  const ch = chapters.map((c) => ({
    ...c,
    ...weigh([...new Set(c.rooms.flatMap((r) => byRoom.get(r) ?? []))], sizes),
  }));
  const over: string[] = [];
  if (budgets.initialKB !== undefined && kb(initial.bytes) > budgets.initialKB)
    over.push(`initial download ${kb(initial.bytes)} KB > initialKB ${budgets.initialKB}`);
  if (budgets.roomKB !== undefined)
    for (const r of rooms)
      if (kb(r.bytes) > budgets.roomKB) over.push(`room ${r.id} ${kb(r.bytes)} KB > roomKB ${budgets.roomKB}`);
  if (budgets.chapterKB !== undefined)
    for (const c of ch)
      if (kb(c.bytes) > budgets.chapterKB)
        over.push(`chapter ${c.id} ${kb(c.bytes)} KB > chapterKB ${budgets.chapterKB}`);
  const background = weigh(stemAssets(game), sizes);
  const offline = weigh([...new Set([...(opts.shell ?? []), ...graph.offline])], sizes);
  const pcm = decodedAudio(game);
  if (budgets.backgroundScoreKB !== undefined && kb(background.bytes) > budgets.backgroundScoreKB)
    over.push(`stems ${kb(background.bytes)} KB > backgroundScoreKB ${budgets.backgroundScoreKB}`);
  if (budgets.offlineTotalKB !== undefined && kb(offline.bytes) > budgets.offlineTotalKB)
    over.push(`offline total ${kb(offline.bytes)} KB > offlineTotalKB ${budgets.offlineTotalKB}`);
  if (budgets.decodedAudioMB !== undefined) {
    if (pcm === null)
      over.push(
        `decoded audio unknown: a score has no pcmBytes (npm run audio -- stems), decodedAudioMB ${budgets.decodedAudioMB}`,
      );
    else if (Math.round(pcm / 1048576) > budgets.decodedAudioMB)
      over.push(`decoded audio ${Math.round(pcm / 1048576)} MB > decodedAudioMB ${budgets.decodedAudioMB}`);
  }
  const peak = transitionPeak(game, opts.pcm ?? (() => null));
  if (budgets.transitionPeakMB !== undefined) {
    if (peak === null)
      over.push(
        `decoded peak unknown: a score has no pcmBytes or a bridge or stinger could not be measured (ffprobe), transitionPeakMB ${budgets.transitionPeakMB}`,
      );
    else if (Math.round(peak / 1048576) > budgets.transitionPeakMB)
      over.push(`decoded peak ${Math.round(peak / 1048576)} MB > transitionPeakMB ${budgets.transitionPeakMB}`);
  }
  return { initial, rooms, chapters: ch, background, offline, decodedAudio: pcm, transitionPeak: peak, over };
}
