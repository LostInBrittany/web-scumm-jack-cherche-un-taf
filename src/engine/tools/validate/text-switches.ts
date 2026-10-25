// The validator's checks of text switches (4.3.0, PLAN-4.3-HERO-CHOICE §3.2, §5; grammar in core/text-switch.ts): every
// text of the game (the paths of `npm run i18n`) is parsed. A malformed switch, a switch or `{hero}` in a text the
// engine shows as written (a title, a menu, a verb, a character's name, a minigame's text), a switch on a flag no
// command sets, a value listed that nothing writes, and a value written that the switch neither lists nor covers with
// `*=` are errors. A flag whose values the validator cannot list (counted with `inc`, a minigame's result, Remix's)
// needs `*=`: a warning without it. A switch is a read of its flag: no "set but never read" for a flag a text reads.
import { parseText, type TextSwitch } from '../../core/text-switch';
import type { GameDef } from '../../core/types';
import { textPaths } from '../i18n';

interface Sink {
  err: (where: string, msg: string) => void;
  warn: (where: string, msg: string) => void;
  /** The validator's set flags (commands, start, checkpoints, and the minigames' and Remix's that a condition reads). */
  flagsSet: ReadonlyMap<string, string>;
  /** The validator's read flags: a switch on a set flag is added (a read of it). */
  flagsRead: Map<string, string>;
  /** The game's custom commands: their `effects` write flags too. */
  commands?: Record<string, { effects?: unknown[] }>;
}

/**
 * The texts the engine shows as written, never through `Engine.text`: the game's title, room names (the map, the
 * save slots), verbs, characters' names and their variants' (the speech box, the transcript and the talk header show
 * `character().name` as it is, 4.3.0), the interface, credits, the title screen, the map, the sealed ending, and
 * minigames' texts (a minigame reads its params itself).
 */
const PLAIN =
  /^(?:title$|verb:|char:[^/]+\/(?:name|variants\[\d+\]\.name)$|ui\/|credits\[|titleScreen\/|map\/|ending\/|room:[^/]+\/name$)|\.params[.[]/;

/** A switch as written in a text, with where. */
interface WrittenSwitch {
  where: string;
  sw: TextSwitch;
  source: string;
}

/** Every switch of the game's texts (the paths of `npm run i18n`), and the malformed spans and misplaced ones reported. */
function textSwitches(game: GameDef, s: Pick<Sink, 'err'>): WrittenSwitch[] {
  const out: WrittenSwitch[] = [];
  for (const { path, text } of textPaths(game)) {
    const p = parseText(text);
    for (const m of p.malformed) s.err(path, `malformed text switch "${m.source}": ${m.reason}`);
    if (PLAIN.test(path)) {
      if (p.switches.length || p.hero)
        s.err(
          path,
          `${p.hero ? '{hero}' : `"${text.slice(p.switches[0]!.start, p.switches[0]!.end)}"`} in a text shown as written: switches and {hero} are filled in lines, choices, looks, hints, toasts, captions, item and object names and objective titles only`,
        );
      continue;
    }
    for (const sw of p.switches) out.push({ where: path, sw, source: text.slice(sw.start, sw.end) });
  }
  return out;
}

/** The values each flag can take, as strings (`String(value)`), with where one is written; `open` when not listable. */
function writtenValues(game: GameDef, commands: Sink['commands']) {
  const values = new Map<string, Map<string, string>>();
  const open = new Map<string, string>();
  const played = new Set<string>();
  const add = (f: string, v: unknown, where: string) => {
    const m = values.get(f) ?? new Map<string, string>();
    if (!m.has(String(v))) m.set(String(v), where);
    values.set(f, m);
  };
  const walk = (x: unknown, where: string) => {
    if (Array.isArray(x)) x.forEach((y, i) => walk(y, `${where}[${i}]`));
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o.set === 'string') add(o.set, true, where);
      else if (Array.isArray(o.set) && typeof o.set[0] === 'string') add(o.set[0], o.set[1], where);
      if (typeof o.inc === 'string' && !open.has(o.inc)) open.set(o.inc, `counted with inc at ${where}`);
      if (typeof o.minigame === 'string') played.add(o.minigame);
      for (const [k, v] of Object.entries(o)) walk(v, where ? `${where}.${k}` : k);
    }
  };
  walk({ rooms: game.rooms, rules: game.rules, scripts: game.scripts, events: game.events }, '');
  walk(game.start.intro, 'start.intro');
  for (const [k, c] of Object.entries(commands ?? {})) walk(c.effects, `commands.${k}.effects`);
  for (const [f, v] of Object.entries(game.start.flags ?? {})) add(f, v, 'start.flags');
  for (const [cid, c] of Object.entries(game.checkpoints ?? {}))
    for (const [f, v] of Object.entries(c.flags ?? {})) add(f, v, `checkpoints.${cid}.flags`);
  return { values, open, played };
}

export function textSwitchChecks(game: GameDef, s: Sink): void {
  const list = textSwitches(game, s);
  if (!list.length) return;
  const { values, open, played } = writtenValues(game, s.commands);
  for (const { where, sw, source } of list) {
    const f = sw.flag;
    // A minigame's result and Remix's flags are the world's: set, with values the validator does not list.
    const world =
      f.startsWith('minigame.') && played.has(f.slice(9))
        ? "a minigame's result"
        : f.startsWith('remix.') && game.remix
          ? "Remix's"
          : '';
    if (!s.flagsSet.has(f) && !world) {
      s.err(where, `text switch "${source}" reads flag "${f}", which no command sets`);
      continue;
    }
    if (!s.flagsRead.has(f) && s.flagsSet.has(f)) s.flagsRead.set(f, where);
    const written = values.get(f);
    const why = open.get(f) ?? (world || (!written ? `set at ${s.flagsSet.get(f)}` : ''));
    if (why) {
      if (!sw.hasDefault)
        s.warn(
          where,
          `text switch "${source}": the values of "${f}" cannot be listed (${why}): add "*=" so every value has a text`,
        );
      continue;
    }
    for (const a of sw.alts)
      if (a.value !== '*' && !written!.has(a.value))
        s.err(
          where,
          `text switch "${source}" lists value "${a.value}" for "${f}", which no set writes (written: ${[...written!.keys()].join(', ')})`,
        );
    if (!sw.hasDefault)
      for (const [v, at] of written!)
        if (!sw.alts.some((a) => a.value === v))
          s.err(
            where,
            `text switch "${source}" has no text for "${f}" = "${v}" (written at ${at}): list it or add "*="`,
          );
  }
}
