// Text switches (4.3.0, PLAN-4.3-HERO-CHOICE §3.2): two placeholders filled when a line is shown, never at boot, so a
// choice the player made (a flag in the save) picks the words. Pure: no DOM, no engine; `Engine.text` reads the flags
// and the hero's name and calls `renderText`; the validator and `npm run i18n -- status` read `parseText`.
//
// Grammar (a text is read left to right; anything that is not one of these two stays as written):
//
//   {hero}                                   the active hero's display name (its variant's, when one applies)
//   {<flag>?<value>=<text>|<value>=<text>|…} the text listed for the flag's current value
//
//   flag   := [A-Za-z0-9_.-]+                 a flag id, as in `{ set: [flag, value] }`
//   value  := one or more characters, none of `=`, `|`, `{`, `}`; or `*`, the fallback
//   text   := zero or more characters, none of `|`, `{`, `}` (it may be empty, may hold spaces and `=`)
//
// - A flag's value is compared as a string: `String(value)` (`true`, `false`, `2`, `f`), exactly, without trimming.
// - No value matches (the flag is unset, or holds a value the switch does not list): the `*=` text; without one, the
//   first text listed. Raw braces never reach the screen from a well-formed switch.
// - No nesting and no escaping: an alternative holds no brace at all, so neither another switch nor `{hero}` nor
//   `{item}` goes inside one; `|` and `}` end an alternative. Write two switches side by side instead.
// - A malformed switch (`{form?}`, `{form?m}`, `{form?m=a` without `}`, a brace inside, a value listed twice) is left
//   exactly as written; the validator reports it.
// - Other placeholders are not touched: `{item}`, `{target}`, `{name}` (fallbacks, filled before), `{code:…}`,
//   `{hint:…}` (Remix, filled at boot). A text with no `{hero}` and no `{<flag>?` comes back unchanged, the same string.
import type { Value } from './types';

/** One alternative of a switch: `value=text` (`value` is `*` for the fallback). */
interface SwitchAlt {
  value: string;
  text: string;
}

/** A well-formed switch: where it is in the text (`start` to `end`, exclusive), its flag and its alternatives. */
export interface TextSwitch {
  start: number;
  end: number;
  flag: string;
  alts: SwitchAlt[];
  /** It has a `*=` alternative. */
  hasDefault: boolean;
}

/** What a text holds: its switches, whether it names the hero, and the spans that look like a switch but are not one. */
export interface ParsedText {
  switches: TextSwitch[];
  hero: boolean;
  malformed: { start: number; end: number; source: string; reason: string }[];
}

const OPEN = /\{([\w.-]+)\?/g;
const HERO = '{hero}';

/** True when the text may hold a switch or `{hero}`: the fast path skips the rest (and a missing text, as it is). */
function mayHold(s: string): boolean {
  return typeof s === 'string' && s.includes('{') && (s.includes('?') || s.includes(HERO));
}

/** Reads the alternatives of a switch body (between `?` and `}`); a string says why it is malformed. */
function readAlts(body: string): SwitchAlt[] | string {
  if (!body) return 'no alternative';
  const alts: SwitchAlt[] = [];
  const seen = new Set<string>();
  for (const part of body.split('|')) {
    const eq = part.indexOf('=');
    if (eq < 0) return `"${part}" has no "=" (write value=text)`;
    const value = part.slice(0, eq);
    if (!value) return `"${part}" has no value before "="`;
    if (seen.has(value)) return `value "${value}" is listed twice`;
    seen.add(value);
    alts.push({ value, text: part.slice(eq + 1) });
  }
  return alts;
}

/** Every switch of a text, `{hero}`, and what is malformed. */
export function parseText(s: string): ParsedText {
  // A text of the wrong type (a verb's `key: 1`, refused by its own check) holds nothing: the validator goes on (4.3.0).
  const out: ParsedText = { switches: [], hero: typeof s === 'string' && s.includes(HERO), malformed: [] };
  if (!mayHold(s)) return out;
  OPEN.lastIndex = 0;
  for (let m = OPEN.exec(s); m; m = OPEN.exec(s)) {
    const start = m.index;
    const from = start + m[0].length;
    const close = s.indexOf('}', from);
    const inner = s.indexOf('{', from);
    if (close < 0) {
      out.malformed.push({ start, end: s.length, source: s.slice(start), reason: 'no closing "}"' });
      break;
    }
    if (inner >= 0 && inner < close) {
      out.malformed.push({
        start,
        end: close + 1,
        source: s.slice(start, close + 1),
        reason: 'a brace inside a switch (no nesting: write two switches side by side)',
      });
      OPEN.lastIndex = inner;
      continue;
    }
    const alts = readAlts(s.slice(from, close));
    const source = s.slice(start, close + 1);
    if (typeof alts === 'string') out.malformed.push({ start, end: close + 1, source, reason: alts });
    else
      out.switches.push({
        start,
        end: close + 1,
        flag: m[1]!,
        alts,
        hasDefault: alts.some((a) => a.value === '*'),
      });
    OPEN.lastIndex = close + 1;
  }
  return out;
}

/** The text a switch shows for a flag's value: the matching value's, else `*=`, else the first listed. */
export function pickAlt(sw: Pick<TextSwitch, 'alts'>, value: Value | undefined): string {
  const key = value === undefined ? undefined : String(value);
  const hit = (key !== undefined && sw.alts.find((a) => a.value === key && a.value !== '*')) || undefined;
  return (hit ?? sw.alts.find((a) => a.value === '*') ?? sw.alts[0])?.text ?? '';
}

/**
 * The text as the player reads it: each switch replaced by its alternative for `flags`, then `{hero}` by `hero`.
 * A text without either comes back unchanged (the same string). `hero` may be a function: it is called only when the
 * text names the hero.
 */
export function renderText(s: string, flags: Readonly<Record<string, Value>>, hero: string | (() => string)): string {
  if (!mayHold(s)) return s;
  const { switches } = parseText(s);
  let out = s;
  if (switches.length) {
    out = '';
    let at = 0;
    for (const sw of switches) {
      out += s.slice(at, sw.start) + pickAlt(sw, flags[sw.flag]);
      at = sw.end;
    }
    out += s.slice(at);
  }
  return out.includes(HERO) ? out.split(HERO).join(typeof hero === 'string' ? hero : hero()) : out;
}

/**
 * The flags a text's switches read, sorted and once each: what a voice clip of the line depends on
 * (PLAN-4.3 §3.4, `<id>~form=f`).
 */
export function switchFlags(s: string): string[] {
  return [...new Set(parseText(s).switches.map((w) => w.flag))].sort();
}
