// The content lint's rows about the hero a player chooses (4.3.0 "Hero Choice", PLAN-4.3-HERO-CHOICE §5). A flag the
// intro sets for the hero (`form`) is read by the hero's variants and by text switches, never by a condition: the
// solver calls the command that sets it decoration, and nothing checks that each value gets a look. Two findings:
// - `hero-looks-default` (info): two or more values a `set` writes for a flag the hero's variants read match none of
//   them, so those heroes look the same, the written one. One such value is the usual design (the written look is a
//   hero of its own); two is a typo in a variant's `if` or a variant not written yet.
// - the flags shown (`shownFlags`): read by a variant or a switch, so `action-dead` does not call their `set` dead.
import { check, condFlags } from '../core/cond';
import { parseText } from '../core/text-switch';
import type { GameDef, GameState, Value } from '../core/types';
import { textPaths } from './i18n';
import type { Finding } from './lint';

/** The flags the player sees through a character's variant (any character) or a text switch. */
export function shownFlags(game: GameDef): Set<string> {
  const out = new Set<string>();
  for (const c of Object.values(game.characters)) for (const v of c.variants ?? []) condFlags(v.if, out);
  for (const { text } of textPaths(game)) for (const s of parseText(text).switches) out.add(s.flag);
  return out;
}

/** Every value a `set` command writes, per flag, with the first content path that writes it. */
function setValues(game: GameDef): Map<string, Map<string, { value: Value; path: string; room?: string }>> {
  const out = new Map<string, Map<string, { value: Value; path: string; room?: string }>>();
  const add = (flag: string, value: Value, path: string, room?: string) => {
    const m = out.get(flag) ?? new Map();
    const k = JSON.stringify(value);
    if (!m.has(k)) m.set(k, { value, path, ...(room ? { room } : {}) });
    out.set(flag, m);
  };
  const walk = (x: unknown, path: string, room?: string) => {
    if (Array.isArray(x)) x.forEach((y, i) => walk(y, `${path}[${i}]`, room));
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o.set === 'string') add(o.set, true, path, room);
      else if (Array.isArray(o.set) && typeof o.set[0] === 'string') add(o.set[0], o.set[1] as Value, path, room);
      for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k, room);
    }
  };
  for (const r of game.rooms)
    walk({ on: r.on, talk: r.talk, onEnter: r.onEnter, scripts: r.scripts, events: r.events }, '', r.id);
  walk({ rules: game.rules, scripts: game.scripts, events: game.events }, '');
  walk(game.start.intro, 'start.intro');
  return out;
}

/** `hero-looks-default`: values of the hero's flag that two or more heroes share with the written look. */
export function heroLooks(game: GameDef): Finding[] {
  const heroes = [...new Set([game.hero, ...(game.players?.ids ?? [])])];
  const sets = setValues(game);
  const out: Finding[] = [];
  for (const id of heroes) {
    const variants = game.characters[id]?.variants ?? [];
    const flags = new Set<string>();
    for (const v of variants) condFlags(v.if, flags);
    for (const flag of flags) {
      const written = [...(sets.get(flag)?.values() ?? [])];
      // Only this flag holds: a variant that also needs an item or a place does not count as this value's look.
      const state = (value: Value) =>
        ({
          flags: { [flag]: value },
          inventory: [],
          props: {},
          visited: {},
          unlocked: [],
          seen: {},
          where: {},
          room: '',
          active: id,
        }) as unknown as GameState;
      const plain = written.filter(
        (w) => !variants.some((v) => condFlags(v.if).has(flag) && check(v.if, state(w.value), '')),
      );
      if (plain.length < 2) continue;
      const names = plain.map((w) => JSON.stringify(w.value));
      for (const w of plain)
        out.push({
          code: 'hero-looks-default',
          severity: 'info',
          where: { ...(w.room ? { room: w.room } : {}), path: w.path },
          message: `sets "${flag}" to ${JSON.stringify(w.value)}, which no variant of the hero "${id}" matches: the heroes ${names.join(', ')} all look like the written one (its sprites, portrait and name)`,
          fix: `give each of those values a variant (\`if: { flag: '${flag}', eq: … }\`), or check the variants' conditions for a typo`,
        });
    }
  }
  return out;
}
