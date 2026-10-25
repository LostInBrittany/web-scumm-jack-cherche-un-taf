// Lists every image and sound the game content references (JSON on stdout when run as a script).
// Used by tools/assets.py (only what is used gets prepared) and by tools/pages/review.ts. The game: GAME (see tools/game.ts).
import { pathToFileURL } from 'node:url';
import type { GameModule } from './game';

export interface Refs {
  images: string[];
  audio: { music: Record<string, string>; sfx: Record<string, string>; voices?: Record<string, string> };
}

/** Collects the image ids (and audio tables) cited by a game module. Pure: no file access. */
export function collectRefs({
  game,
  extraImages,
  layouts,
}: Pick<GameModule, 'game' | 'extraImages'> & { layouts?: GameModule['layouts'] }): Refs {
  const images = new Set<string>();
  const add = (id: string | undefined) => {
    if (id) images.add(id);
  };
  const looksLikeImage = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(v);

  function scanParams(v: unknown) {
    if (looksLikeImage(v)) add(v);
    else if (Array.isArray(v)) v.forEach(scanParams);
    else if (v && typeof v === 'object') Object.values(v).forEach(scanParams);
  }

  function scanCmds(cmds: unknown) {
    if (!Array.isArray(cmds)) return;
    for (const c of cmds) {
      if (!c || typeof c !== 'object') continue;
      const o = c as Record<string, unknown>;
      if ('minigame' in o) {
        scanParams(o.params);
        scanCmds(o.then);
      }
      for (const k of ['then', 'else', 'once', 'cutscene', 'do', 'after']) scanCmds(o[k]);
      if (o.at && typeof o.at === 'object') Object.values(o.at as Record<string, unknown>).forEach(scanCmds);
      for (const k of ['nth', 'cycle', 'random', 'parallel'])
        if (Array.isArray(o[k])) (o[k] as unknown[]).forEach(scanCmds);
      if (Array.isArray(o.choice))
        (o.choice as { img?: string; do: unknown }[]).forEach((x) => {
          add(x.img); // a card's image (4.3.0)
          scanCmds(x.do);
        });
    }
  }

  for (const r of game.rooms) {
    add(r.decor);
    // The stage (3.4): its layers' and particles' images, and the occluders' mask images in the layout.
    for (const l of r.stage?.layers ?? []) add(l.image);
    for (const e of r.stage?.emitters ?? []) add(e.image);
    for (const o of Object.values(layouts?.[r.id]?.occluders ?? {})) add(o.mask);
    for (const p of Object.values(r.props ?? {})) {
      add(p.img);
      Object.values(p.states ?? {}).forEach(add);
      for (const a of Object.values(p.anims ?? {})) {
        a.frames.forEach(add);
        Object.values(a.at ?? {}).forEach(scanCmds);
      }
    }
    scanCmds(r.onEnter);
    r.on?.forEach((x) => scanCmds(x.do));
    Object.values(r.talk ?? {}).forEach((ts) => ts.forEach((t) => scanCmds(t.do)));
    r.scripts?.forEach((x) => scanCmds(x.do));
    r.events?.forEach((x) => scanCmds(x.do));
  }
  game.rules.on?.forEach((x) => scanCmds(x.do));
  game.scripts?.forEach((x) => scanCmds(x.do));
  game.events?.forEach((x) => scanCmds(x.do));
  scanCmds(game.start.intro);
  for (const c of Object.values(game.characters)) {
    add(c.portrait);
    Object.values(c.sprites ?? {}).forEach((l) => l.forEach(add));
    const mouths = (m?: Record<string, { closed: string; open: string[]; blink?: string; smile?: string }>) =>
      Object.values(m ?? {}).forEach((x) => [x.closed, ...x.open, x.blink, x.smile].forEach((f) => f && add(f)));
    mouths(c.mouths);
    for (const v of c.variants ?? []) {
      add(v.portrait);
      Object.values(v.sprites ?? {}).forEach((l) => l.forEach(add));
      mouths(v.mouths);
    }
  }
  for (const it of Object.values(game.items)) add(it.icon);
  if (game.map) {
    Object.values(game.map.regions).forEach((r) => add(r.image));
    Object.values(game.map.places).forEach((p) => ([] as string[]).concat(p.portrait ?? []).forEach(add));
    Object.values(game.map.vehicles ?? {}).forEach(add);
  }

  // Interface skin, title and credits screens, sealed ending (ticket parameters).
  const sk = game.skin.icons;
  [
    sk.map,
    sk.pause,
    sk.music,
    sk.spark,
    sk.pin,
    sk.news,
    sk.plane,
    sk.car,
    sk.cardFallback,
    ...(sk.confetti ?? []),
  ].forEach(add);
  add(game.titleScreen?.decor);
  add(game.titleScreen?.logo);
  add(game.creditsScreen?.decor);
  scanParams(game.ending?.scratch);
  // Images the game asks to keep even if nothing cites them.
  (extraImages ?? []).forEach(add);

  // A score's stems are music files too (3.5), keyed `<score>.<stem>`.
  const stems = Object.fromEntries(
    Object.entries(game.audio?.scores ?? {}).flatMap(([id, sc]) =>
      Object.entries(sc.stems).map(([k, f]) => [`${id}.${k}`, f]),
    ),
  );
  return {
    images: [...images].sort(),
    audio: {
      music: { ...(game.audio?.music ?? {}), ...stems },
      sfx: game.audio?.sfx ?? {},
      // A translation's clips ship too (4.4.0: before, only `audio.voices` did and a French clip was never encoded),
      // keyed `<lang>:<id>`; the player finds them by file name (`voicesByLang`, boot.ts).
      voices: {
        ...(game.audio?.voices ?? {}),
        ...Object.fromEntries(
          Object.entries(game.audio?.voicesByLang ?? {}).flatMap(([lang, m]) =>
            Object.entries(m).map(([id, f]) => [`${lang}:${id}`, f]),
          ),
        ),
      },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GAME_DIR, loadGameModule } = await import('./game');
  // Outside Vite the module's layouts are empty: the occluders' masks are read from layout/*.json.
  const { loadLayouts } = await import('../src/engine/tools/load');
  const { resolve } = await import('node:path');
  const mod = await loadGameModule();
  process.stdout.write(
    JSON.stringify(collectRefs({ ...mod, layouts: loadLayouts(resolve(GAME_DIR, 'layout')) }), null, 1),
  );
}
