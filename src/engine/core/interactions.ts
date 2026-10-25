// Interactions: the rule, kind or fallback that answers an action; lines, hints and the talk loop.
// Part of the Engine (4.1.0 "Clarity"): its methods of the same name forward here, in the same order of effects.
import { listId, listText } from './list-lines';
import { ruleActionId, topicActionId } from './content-ids';
import { must } from './must';
import type { Action, ListLine, Id, RoomDef, Rule, VerbId } from './types';

import { HERO, type Ctx, type Source } from './engine-shared';
import type { Engine } from './engine';
import { seenKey } from './keys';
import { renderText } from './text-switch';
import { lineClip } from './voice-key';

// ------------------------------------------------------------------ resolution
/** Finds the reaction to an action and executes it. */
export async function resolve(eng: Engine, act: Action, ctx: Ctx): Promise<Source> {
  const { verb, a, b } = act;
  const room = ctx.room;
  const rule = eng.findRule(verb, a, b, room);
  if (rule) {
    eng.ran(rule.id);
    const last = rule.do.at(-1);
    eng.tailTalk = typeof last === 'object' && 'talk' in last ? last : null;
    try {
      await eng.exec(rule.do, ctx);
    } finally {
      eng.tailTalk = null;
    }
    return 'rule';
  }

  if (verb === 'look' && !b) {
    const lines = room.look?.[a] ?? (eng.state.inventory.includes(a) ? eng.game.items[a]?.look : undefined);
    if (lines) {
      const l = eng.pickLine(`look.${room.id}.${a}`, lines);
      await eng.say(HERO, listText(l), ctx, false, eng.voiceOf(l));
      return 'look';
    }
  }
  if (verb === 'talk' && !b) {
    if (a === eng.game.hintItem && eng.state.inventory.includes(a)) {
      await eng.hint(ctx);
      return 'hint';
    }
    if (room.talk?.[a]) {
      await eng.talkLoop(a, ctx, true);
      return 'talk';
    }
  }
  const kind = eng.findKind(verb, a, b, room);
  if (kind) {
    await eng.say(HERO, eng.fill(kind.say, a, b), ctx, false, eng.voiceOf(kind, kind.say));
    return 'kind';
  }
  if (verb === 'give' && b) {
    // Another playable character takes the item into their own inventory.
    if (
      eng.isPlayer(b) &&
      b !== eng.heroId() &&
      eng.state.inventory.includes(a) &&
      !eng.game.players?.sharedInventory
    ) {
      eng.transfer(a, b);
      await eng.say(HERO, eng.fill(eng.game.players?.give ?? 'Here, {name}: the {item}.', a, b), ctx);
      return 'rule';
    }
    const char = room.actors?.[b]?.char;
    const refuse = char ? eng.game.characters[char]?.refuse : undefined;
    if (refuse) {
      await eng.say(char!, eng.fill(refuse, a, b), ctx);
      return 'refuse';
    }
  }
  const key = verb === 'use' && b ? 'use2' : verb;
  await eng.sayFallback(HERO, key, ctx, a, b);
  return 'fallback';
}

/** Matching written rule (room, then game). Exposed for the solver. */
export function findRule(
  eng: Engine,
  verb: VerbId,
  a: Id,
  b: Id | undefined,
  room: RoomDef,
): (Rule & { id: string }) | null {
  const has = (x: Id | Id[] | undefined, v: Id | undefined) =>
    x === undefined ? v === undefined : v !== undefined && (Array.isArray(x) ? x.includes(v) : x === v);
  const verbOk = (r: Rule) => (Array.isArray(r.verb) ? r.verb.includes(verb) : r.verb === verb);
  const inv = eng.state.inventory;
  for (const [list, scope] of [
    [room.on ?? [], room.id],
    [eng.game.rules.on ?? [], 'game'],
  ] as const) {
    for (const [i, r] of list.entries()) {
      if (!verbOk(r) || !eng.cond(r.if, room.id)) continue;
      const hit =
        (has(r.a, a) && has(r.b, b)) || (!!b && inv.includes(a) && inv.includes(b) && has(r.a, b) && has(r.b, a)); // two inventory items: order doesn't matter
      if (hit) return { ...r, id: ruleActionId(scope, i, r) };
    }
  }
  return null;
}

export function findKind(
  eng: Engine,
  verb: VerbId,
  a: Id,
  b: Id | undefined,
  room: RoomDef,
): { id?: Id; say: string } | null {
  const target = b ?? a;
  const kinds = eng.kindsOf(target, room);
  const rules = eng.game.rules.kinds ?? [];
  const verbOk = (v: VerbId | VerbId[]) => (Array.isArray(v) ? v.includes(verb) : v === verb);
  const itemOk = (it: Id | Id[] | undefined) =>
    it === undefined || (b !== undefined && (Array.isArray(it) ? it.includes(a) : it === a));
  const hit =
    rules.find((k) => verbOk(k.verb) && k.target === target && itemOk(k.item)) ??
    rules.find((k) => verbOk(k.verb) && !k.target && k.kind && kinds.includes(k.kind) && itemOk(k.item));
  return hit ?? null;
}

/**
 * The placeholders of a fallback, kind or give line (4.1.4): `{item}` the thing acted on, `{target}` what it is used
 * on (empty without one), `{name}` the target or, failing that, the item. `{objet}`, `{cible}` and `{nom}` are the
 * same three under the names of 4.0, kept for every game written with them.
 */
const PLACEHOLDERS: Record<string, 'item' | 'target' | 'name'> = {
  item: 'item',
  target: 'target',
  name: 'name',
  objet: 'item',
  cible: 'target',
  nom: 'name',
};

export function fill(eng: Engine, text: string, a: Id, b?: Id): string {
  const room = eng.room();
  const value = { item: eng.nameOf(a, room), target: b ? eng.nameOf(b, room) : '', name: eng.nameOf(b ?? a, room) };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (PLACEHOLDERS[k] ? value[PLACEHOLDERS[k]] : m));
}

/**
 * A text as the player reads it now (4.3.0, core/text-switch.ts): `{<flag>?<value>=<text>|…|*=<text>}` takes the text
 * listed for the flag's current value, `{hero}` the active hero's name (its variant's). Called where a text is shown,
 * after `fill()` and after the translation; it reads the state and never changes it.
 */
export function text(eng: Engine, s: string): string {
  if (!eng.state) return s;
  return renderText(s, eng.state.flags, () => {
    const id = eng.heroId();
    return eng.character(id)?.name ?? eng.game.characters[id]?.name ?? id;
  });
}

/**
 * A line's voice clip (the rule of `say` lines): `<id>~<flag>=<value>…` when its text (as written) has switches and
 * `audio.voices` has that clip (4.3.0, core/voice-key.ts), else its id when `audio.voices` has a clip under it.
 */
export function voiceOf(eng: Engine, l: ListLine | { id?: Id }, text?: string): Id | undefined {
  const id = typeof l === 'string' ? undefined : 'text' in l ? listId(l) : l.id;
  const written = text ?? (typeof l !== 'string' && 'text' in l ? l.text : undefined);
  return lineClip(eng.game.audio?.voices, id, written, eng.state?.flags);
}

export async function sayFallback(eng: Engine, who: Id, key: string, ctx: Ctx, a: Id, b?: Id) {
  const l = eng.fallback(key);
  await eng.say(who, eng.fill(listText(l), a, b), ctx, false, eng.voiceOf(l));
}

export function fallback(eng: Engine, key: string): ListLine {
  const list = eng.game.rules.fallbacks[key as VerbId] ?? eng.game.rules.fallbacks.look ?? ['…'];
  let i = Math.floor(eng.rand() * list.length);
  if (list.length > 1 && i === eng.lastFallback[key]) i = (i + 1) % list.length;
  eng.lastFallback[key] = i;
  return must(list[i], `fallback line ${key}[${i}]`);
}

export function pickLine(eng: Engine, key: string, lines: string | ListLine[]): ListLine {
  if (typeof lines === 'string') return lines;
  const n = eng.state.counters[key] ?? 0;
  eng.state.counters[key] = n + 1;
  return must(lines[n % lines.length], `line ${key}`);
}

export async function hint(eng: Engine, ctx: Ctx) {
  const room = ctx.room;
  const hints = room.hints ?? [];
  const idx = hints.findIndex((h) => !eng.cond(h.until, room.id));
  const voice = eng.game.hintVoice ?? eng.heroId();
  eng.ran(`hint:${room.id}/${idx < 0 ? 'none' : idx}`);
  if (idx < 0) {
    await eng.sayFallback(voice, 'talk', ctx, eng.game.hintItem!);
    return;
  }
  const l = eng.pickLine(`hint.${room.id}.${idx}`, must(hints[idx], `hint ${idx}`).lines);
  await eng.say(voice, listText(l), ctx, false, eng.voiceOf(l));
}

/**
 * Conversation topic menu, until "Bye". With `saveTopics` (the conversation is the rest of its action: the talk verb
 * on a character with topics, or a rule's last command), each topic is saved once whole (4.3.0, #218).
 */
export async function talkLoop(eng: Engine, actor: Id, ctx: Ctx, saveTopics = false) {
  const room = ctx.room;
  const char = room.actors?.[actor]?.char ?? actor;
  const g = eng.game.globalTalk ?? {};
  for (;;) {
    const topics = (room.talk?.[actor] ?? []).map((t, i) => ({ t, i })).filter(({ t }) => eng.cond(t.if, room.id));
    const topicKey = (t: (typeof topics)[number]['t'], i: number) => seenKey.topic(t, room.id, actor, i);
    const opts = topics.map(({ i, t }) => ({ text: t.topic, seen: !!eng.state.seen[topicKey(t, i)] }));
    if (g.hug) opts.push({ text: g.hug, seen: false, global: true } as never);
    opts.push({ text: g.bye ?? '…', seen: false, global: true } as never);
    const pick = await eng.choose(opts, char);
    if (pick < topics.length) {
      const { t, i } = must(topics[pick], `topic ${pick}`);
      eng.ran(topicActionId(room.id, actor, i, t));
      await eng.say(HERO, t.topic, ctx);
      await eng.exec(t.do, ctx);
      eng.state.seen[topicKey(t, i)] = 1;
      eng.writes?.add(`seen:${topicKey(t, i)}`);
      // A conversation is one action, saved at "Bye": a topic's progress (a flag, an item, a minigame won) would be
      // lost if the page died before it (#218). The topic is whole here; `saveMade` stays at the action's end. Only
      // when nothing of the action follows the conversation: a talk in a cutscene, a topic's `do` or the middle of a
      // rule would save half a `do` that a reload never finishes.
      if (saveTopics) eng.save();
      continue;
    }
    if (g.hug && pick === topics.length) {
      await eng.say(HERO, g.hug, ctx);
      await eng.say(char, eng.game.characters[char]?.hug ?? '♥', ctx);
      continue;
    }
    if (g.byeLine) await eng.say(HERO, g.byeLine, ctx);
    return;
  }
}
