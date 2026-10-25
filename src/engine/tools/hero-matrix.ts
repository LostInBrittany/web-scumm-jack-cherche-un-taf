// The hero × language matrix (4.4.0): what each line that depends on the hero reads and plays, for every hero and in
// every language, from the data alone. A row per line with a stable id whose text (in any language) has a text switch
// or `{hero}` (core/text-switch.ts); a column per combination of the values the game's switched flags take (the hero
// the intro's choice sets: `form=knight`, `form=witch`…), its header the hero's variant (name per language, portrait);
// a cell per column and language: the text as the player reads it (`renderText`, `{hero}` the variant's name in that
// language), the clip that plays (`lineClip` over that language's clips, `langVoices`, as boot.ts does) and what is
// wrong: a keyed clip missing (the plain id plays instead, or nothing), a value no switch of the line lists (its first
// text shows), a line not translated, a translation that drops a choice its source makes. Read-only, pure: the Studio
// (server, in-browser demo) hands it the game and its locale tables.
import { lineIds } from '../core/content-ids';
import { check } from '../core/cond';
import { parseText, renderText } from '../core/text-switch';
import type { GameDef, GameState, Id, Value } from '../core/types';
import { langVoices, lineClip, voiceKey } from '../core/voice-key';
import { applyLocale, switchesKept, textPaths } from './i18n';

/** A flag a text switch reads, and the values to offer for it (`key` is `String(value)`, as a switch compares). */
export interface SwitchFlag {
  flag: string;
  values: { key: string; value: Value }[];
}

/** The values literal commands write, by flag (a `set` of the rooms, rules, scripts, events, the intro, the start). */
function written(game: GameDef): Map<string, Map<string, Value>> {
  const out = new Map<string, Map<string, Value>>();
  const add = (f: string, v: Value) => {
    const m = out.get(f) ?? new Map<string, Value>();
    if (!m.has(String(v))) m.set(String(v), v);
    out.set(f, m);
  };
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o.set === 'string') add(o.set, true);
      else if (Array.isArray(o.set) && typeof o.set[0] === 'string' && o.set[1] !== undefined)
        add(o.set[0], o.set[1] as Value);
      Object.values(o).forEach(walk);
    }
  };
  walk([game.rooms, game.rules, game.scripts, game.events, game.start.intro]);
  for (const [f, v] of Object.entries(game.start.flags ?? {})) add(f, v);
  for (const c of Object.values(game.checkpoints ?? {})) for (const [f, v] of Object.entries(c.flags ?? {})) add(f, v);
  return out;
}

/**
 * Every flag the game's texts switch on (4.3.0, the Play tab's picker), sorted, with the values written first (a
 * literal `set`, the start, a checkpoint: typed as written) then the ones only listed by a switch.
 */
export function gameSwitchFlags(game: GameDef): SwitchFlag[] {
  const listed = new Map<string, Set<string>>();
  for (const { text } of textPaths(game))
    for (const sw of parseText(text).switches) {
      const s = listed.get(sw.flag) ?? new Set<string>();
      for (const a of sw.alts) if (a.value !== '*') s.add(a.value);
      listed.set(sw.flag, s);
    }
  if (!listed.size) return [];
  const w = written(game);
  return [...listed.keys()].sort().map((flag) => {
    const values = new Map(w.get(flag));
    for (const k of listed.get(flag)!) if (!values.has(k)) values.set(k, k);
    return { flag, values: [...values].map(([key, value]) => ({ key, value })) };
  });
}

/** A column: one value per switched flag, and the hero as it looks then. */
interface MatrixColumn {
  /** `form=knight` (flags sorted, `~` between two): the column's name. */
  key: string;
  flags: Record<string, Value>;
  /** The hero (`game.hero`): the variant that applies (its index, absent: none), its portrait, its name by language. */
  hero: { id: Id; variant?: number; portrait?: Id; names: Record<string, string> };
}

/** What a line reads and plays for one hero in one language. */
interface MatrixCell {
  /** The text as the player reads it. */
  text: string;
  /** The clip the line asks first: its keyed id when its text has switches, else its plain id. */
  want: Id;
  /** The clip that plays (absent: none) and its file. */
  clip?: Id;
  file?: string;
  /** The keyed clip is missing, the plain id plays instead. */
  fallback?: true;
  /** The language has clips, but not the one the line asks (`fallback`: the plain one plays). */
  missing?: true;
  /** The language has no clips of its own: the game's own language's play (boot.ts). */
  borrowed?: true;
  /** A flag's value no switch of the text lists, with no `*=`: the first text listed shows (`renderText`). */
  unlisted?: string[];
}

interface MatrixRow {
  id: Id;
  who: Id;
  /** The text as written, by language. */
  texts: Record<string, string>;
  /** `cells[column][language]`, in the order of `columns` and `langs`. */
  cells: MatrixCell[][];
  /** The languages whose text is still the source's. */
  untranslated: string[];
  /** The languages whose text drops a choice the source's switches make (`switchesKept`, i18n.ts). */
  agreement: string[];
  /** Something to look at: an untranslated line, a lost agreement, a missing clip, an unlisted value. */
  problem: boolean;
}

export interface HeroMatrix {
  /** The game's language first, then the locales'. */
  langs: string[];
  flags: SwitchFlag[];
  columns: MatrixColumn[];
  rows: MatrixRow[];
  /** Combinations left out past `maxColumns`. */
  truncated?: number;
}

/** The flag combinations, flags sorted, values in `gameSwitchFlags`'s order. */
function combos(flags: SwitchFlag[]): Record<string, Value>[] {
  let out: Record<string, Value>[] = [{}];
  for (const f of flags) out = out.flatMap((c) => f.values.map((v) => ({ ...c, [f.flag]: v.value })));
  return flags.length ? out : [];
}

/** A state with these flags over the start's, for a variant's condition (world-queries.ts `character`). */
function stateWith(game: GameDef, flags: Record<string, Value>): GameState {
  return {
    v: 0,
    room: game.start.room,
    inventory: [...(game.start.inventory ?? [])],
    flags: { ...game.start.flags, ...flags },
    props: {},
    actors: {},
    hero: {},
    unlocked: [],
    visited: {},
    counters: {},
    seen: {},
    started: 0,
  };
}

/** The values of `flags` no switch of the text lists, when the switch has no `*=` to take them. */
function unlistedOf(text: string, flags: Record<string, Value>): string[] {
  const out = new Set<string>();
  for (const sw of parseText(text).switches) {
    const v = flags[sw.flag];
    if (v === undefined || sw.hasDefault || sw.alts.some((a) => a.value === String(v))) continue;
    out.add(`${sw.flag}=${String(v)}`);
  }
  return [...out];
}

/**
 * The matrix of a game and its locale tables (`locales/<lang>.json`, path → text). `maxColumns` (default 24) caps
 * the hero combinations: a game switching on three flags of four values each would otherwise read 64 columns wide.
 */
export function heroMatrix(
  game: GameDef,
  locales: Record<string, Record<string, string>> = {},
  o: { maxColumns?: number } = {},
): HeroMatrix {
  const base = game.lang ?? 'en';
  const langs = [base, ...Object.keys(locales).filter((l) => l !== base)];
  const localized = new Map(langs.map((l) => [l, l === base ? game : applyLocale(game, locales[l])]));
  const flags = gameSwitchFlags(game);
  const all = combos(flags),
    max = o.maxColumns ?? 24;
  const columns: MatrixColumn[] = all.slice(0, max).map((f) => {
    const s = stateWith(game, f);
    const vs = game.characters[game.hero]?.variants ?? [];
    const i = vs.findIndex((v) => check(v.if, s));
    const names: Record<string, string> = {};
    for (const [l, g] of localized) {
      const c = g.characters[game.hero];
      names[l] = (i >= 0 ? c?.variants?.[i]?.name : undefined) ?? c?.name ?? game.hero;
    }
    const portrait = (i >= 0 ? vs[i]!.portrait : undefined) ?? game.characters[game.hero]?.portrait;
    return {
      key: Object.entries(f)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join('~'),
      flags: f,
      hero: { id: game.hero, ...(i >= 0 ? { variant: i } : {}), ...(portrait ? { portrait } : {}), names },
    };
  });
  // The clips each language plays: its own (`voicesByLang`), else the game's (boot.ts).
  const clips = new Map(
    langs.map((l) => {
      const own = langVoices(game, l);
      return [l, { voices: own ?? game.audio?.voices ?? {}, borrowed: l !== base && !own }];
    }),
  );
  const texts = new Map(langs.map((l) => [l, new Map(lineIds(localized.get(l)!).map((x) => [x.id, x.text]))]));
  const rows: MatrixRow[] = [];
  for (const line of lineIds(game)) {
    const byLang: Record<string, string> = {};
    for (const l of langs) byLang[l] = texts.get(l)!.get(line.id) ?? line.text;
    if (!Object.values(byLang).some((t) => parseText(t).switches.length || parseText(t).hero)) continue;
    const untranslated = langs.filter((l) => l !== base && line.text && byLang[l] === line.text);
    const agreement = langs.filter(
      (l) => l !== base && byLang[l] !== line.text && !switchesKept(line.text, byLang[l]!),
    );
    let problem = untranslated.length > 0 || agreement.length > 0;
    const cells = columns.map((c) =>
      langs.map((l): MatrixCell => {
        const t = byLang[l]!,
          v = clips.get(l)!;
        const want = voiceKey(line.id, t, c.flags) ?? line.id;
        const clip = lineClip(v.voices, line.id, t, c.flags);
        const unlisted = unlistedOf(t, c.flags);
        const missing = Object.keys(v.voices).length > 0 && clip !== want;
        if (missing || unlisted.length) problem = true;
        return {
          text: renderText(t, c.flags, c.hero.names[l]!),
          want,
          ...(clip ? { clip, file: v.voices[clip] } : {}),
          ...(clip && clip !== want ? { fallback: true as const } : {}),
          ...(missing ? { missing: true as const } : {}),
          ...(v.borrowed && clip ? { borrowed: true as const } : {}),
          ...(unlisted.length ? { unlisted } : {}),
        };
      }),
    );
    rows.push({ id: line.id, who: line.who, texts: byLang, cells, untranslated, agreement, problem });
  }
  return {
    langs,
    flags,
    columns,
    rows,
    ...(all.length > columns.length ? { truncated: all.length - columns.length } : {}),
  };
}
