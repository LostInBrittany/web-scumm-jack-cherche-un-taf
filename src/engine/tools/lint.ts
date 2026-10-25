// Content lint: what the validator cannot say (it checks shapes and references) and the solver does not say loudly
// (it answers "can it be finished"). From the puzzle graph: conditions nothing can satisfy, rules another rule hides,
// items nothing needs, hints that cannot fire; from a solver run: live actions never run, rooms never reached. Each
// finding names its content path (the Rooms tab's `data-path`) and the stable id when there is one, and says what
// to do. `GameDef.lint.ignore` silences a code, or a code for one thing.
import type { Cond, GameDef, Id, Layout, Point, Rule } from '../core/types';
import { inPolygon, stageOf } from '../core/stage';
import type { CustomCommands } from '../core/custom';
import { condAtoms, condFlags, type CondAtom } from '../core/cond';
import { variantFlag } from '../core/remix/manifest';
import { atomNodeId, liveClasses, puzzleGraph, puzzleIssues, type PuzzleGraph } from './puzzle';
import { listenerActionId, ruleActionId, topicActionId } from '../core/content-ids';
import type { SolveResult } from './solve';
import { must } from '../core/must';
import { heroLooks, shownFlags } from './lint-hero';

type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  code: string;
  severity: Severity;
  /** Where in the content: the room (none for game-level things), the path the Rooms tab understands, the stable id. */
  where: { room?: Id; path: string; id?: string };
  message: string;
  fix: string;
  /** Came from a solver run (absent: static). */
  solver?: 'witness' | 'prove';
}

export interface LintOptions {
  /** A solver result: adds the findings that need a search (actions never run, rooms never reached). */
  solve?: SolveResult;
  commands?: CustomCommands;
  /** Overrides `game.lint.ignore`. */
  ignore?: string[];
}

export interface LintResult {
  findings: Finding[];
  ignored: number;
  counts: Record<Severity, number>;
}

const asList = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const sev = (findings: Finding[]) => ({
  error: findings.filter((f) => f.severity === 'error').length,
  warning: findings.filter((f) => f.severity === 'warning').length,
  info: findings.filter((f) => f.severity === 'info').length,
});

/** The ids of the state nodes something produces, and the ones the start state already holds. */
function producers(game: GameDef, g: PuzzleGraph) {
  const produced = new Set(g.edges.filter((e) => e.kind === 'produces').map((e) => e.to));
  for (const [f, v] of Object.entries(game.start.flags ?? {})) if (v) produced.add(`flag:${f}`);
  for (const i of game.start.inventory ?? []) produced.add(`item:${i}`);
  for (const p of game.start.unlocked ?? []) produced.add(`place:${p}`);
  // Remix (4.1.15): the world writes the reserved flags of its dimensions; each world is proved on its own
  // (`npm run verify:variants`).
  for (const d of game.remix?.dimensions ?? []) {
    produced.add(`flag:${variantFlag(d.id)}`);
    if (d.kind === 'puzzle-order') for (const g of d.groups) produced.add(`flag:${variantFlag(d.id, g)}`);
  }
  for (const p of Object.values(game.players?.start ?? {}))
    for (const i of p.inventory ?? []) produced.add(`item:${i}`);
  for (const cp of Object.values(game.checkpoints ?? {})) {
    for (const i of cp.inventory ?? []) produced.add(`item:${i}`);
    for (const [f, v] of Object.entries(cp.flags ?? {})) if (v) produced.add(`flag:${f}`);
    for (const p of cp.unlocked ?? []) produced.add(`place:${p}`);
  }
  return produced;
}

/** The positive atoms of a condition that nothing produces: the condition can never become true. */
function unsatisfiable(c: Cond | undefined, room: Id | undefined, produced: Set<string>): CondAtom[] {
  return condAtoms(c, room).filter(
    (a) => !a.neg && (a.kind === 'flag' || a.kind === 'has' || a.kind === 'unlocked') && !produced.has(atomNodeId(a)),
  );
}
const atomText = (a: CondAtom) =>
  a.kind === 'has' ? `item "${a.id}"` : a.kind === 'unlocked' ? `place "${a.id}"` : `flag "${a.id}"`;

export function lintContent(game: GameDef, layouts: Record<Id, Layout>, opts: LintOptions = {}): LintResult {
  const g = puzzleGraph(game, { commands: opts.commands as Record<string, { effects?: unknown[] }> | undefined });
  const produced = producers(game, g);
  const classes = liveClasses(g);
  const issues = puzzleIssues(g);
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);
  /** Action node id → where it is written, for the findings the graph raises by node. */
  const pathOf = new Map<string, Finding['where']>();

  // ---- conditions nothing can satisfy, per kind of owner
  const rules = (list: Rule[] | undefined, scope: string, room: Id | undefined, pathBase: string) => {
    list?.forEach((r, i) => {
      if (r.exit) return;
      const path = `${pathBase}[${i}]`;
      pathOf.set(ruleActionId(scope, i, r), { room, path, id: r.id });
      for (const a of unsatisfiable(r.if, room, produced))
        add({
          code: 'cond-never-true',
          severity: 'error',
          where: { room, path, id: r.id },
          message: `requires ${atomText(a)}, which nothing sets`,
          fix: 'set it somewhere, or drop the condition',
        });
      // The engine takes the first matching rule: an earlier rule with no condition (or the same one) hides this one.
      const same = (x: Rule) =>
        asList(x.verb).some((v) => asList(r.verb).includes(v)) &&
        asList(x.a).some((v) => asList(r.a).includes(v)) &&
        JSON.stringify(asList(x.b)) === JSON.stringify(asList(r.b));
      const shadow = list.findIndex(
        (x, j) => j < i && !x.exit && same(x) && (x.if === undefined || JSON.stringify(x.if) === JSON.stringify(r.if)),
      );
      if (shadow >= 0)
        add({
          code: 'rule-shadowed',
          severity: 'warning',
          where: { room, path, id: r.id },
          message: `never runs: ${pathBase}[${shadow}] matches the same action first${must(list[shadow], 'shadowing rule').if === undefined ? ' with no condition' : ' with the same condition'}`,
          fix: 'move it before, or give the earlier rule a condition',
        });
    });
  };
  for (const r of game.rooms) {
    rules(r.on, r.id, r.id, 'on');
    for (const [actor, topics] of Object.entries(r.talk ?? {}))
      topics.forEach((t, i) => {
        pathOf.set(topicActionId(r.id, actor, i, t), { room: r.id, path: `talk.${actor}[${i}]`, id: t.id });
        for (const a of unsatisfiable(t.if, r.id, produced))
          add({
            code: 'topic-never-visible',
            severity: 'warning',
            where: { room: r.id, path: `talk.${actor}[${i}]`, id: t.id },
            message: `"${t.topic}" requires ${atomText(a)}, which nothing sets`,
            fix: 'set it somewhere, or drop the condition',
          });
      });
    (r.events ?? []).forEach((ev, i) => {
      pathOf.set(listenerActionId(r.id, i, ev), { room: r.id, path: `events[${i}]`, id: ev.id });
      for (const a of unsatisfiable(ev.if, r.id, produced))
        add({
          code: 'listener-dead',
          severity: 'warning',
          where: { room: r.id, path: `events[${i}]`, id: ev.id },
          message: `on "${ev.on}" requires ${atomText(a)}, which nothing sets`,
          fix: 'set it somewhere, or drop the condition',
        });
    });
    (r.hints ?? []).forEach((h, i) => {
      for (const a of unsatisfiable(h.until, r.id, produced))
        add({
          code: 'hint-stuck',
          severity: 'error',
          where: { room: r.id, path: `hints[${i}]`, id: h.id },
          message: `waits for ${atomText(a)}, which nothing sets: it is given forever`,
          fix: 'make `until` something the player can reach',
        });
      const twin = (r.hints ?? []).findIndex((x, j) => j < i && JSON.stringify(x.until) === JSON.stringify(h.until));
      if (twin >= 0)
        add({
          code: 'hint-never-fires',
          severity: 'warning',
          where: { room: r.id, path: `hints[${i}]`, id: h.id },
          message: `has the same \`until\` as hints[${twin}], which is given first`,
          fix: 'give it its own `until`, or merge the lines',
        });
    });
    for (const [id, ex] of Object.entries(r.exits ?? {}))
      if (ex.if && !ex.locked)
        add({
          code: 'exit-locked-silent',
          severity: 'info',
          where: { room: r.id, path: `exits.${id}` },
          message: `"${ex.name}" has a condition but no \`locked\` line: the player gets the fallback`,
          fix: 'add a `locked` line that hints at what is missing',
        });
  }
  rules(game.rules.on, 'game', undefined, 'rules/on');
  (game.events ?? []).forEach((ev, i) => {
    for (const a of unsatisfiable(ev.if, undefined, produced))
      add({
        code: 'listener-dead',
        severity: 'warning',
        where: { path: `events[${i}]`, id: ev.id },
        message: `on "${ev.on}" requires ${atomText(a)}, which nothing sets`,
        fix: 'set it somewhere, or drop the condition',
      });
  });

  // ---- choices (every command list), found through the puzzle graph's owners is heavier than a walk: walk the content
  const walkChoices = (list: unknown, room: Id | undefined, path: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((c, i) => {
      if (!c || typeof c !== 'object') return;
      const here = `${path}[${i}]`;
      const o = c as Record<string, unknown>;
      if (Array.isArray(o.choice)) {
        const options = o.choice as { text: string; if?: Cond; id?: string; do?: unknown }[];
        if (options.length === 1)
          add({
            code: 'choice-single',
            severity: 'info',
            where: { room, path: here, id: must(options[0], 'single option').id },
            message: `a choice with one option ("${must(options[0], 'single option').text}")`,
            fix: 'a plain line reads the same; or add the alternative',
          });
        options.forEach((opt, j) => {
          for (const a of unsatisfiable(opt.if, room, produced))
            add({
              code: 'choice-dead',
              severity: 'warning',
              where: { room, path: `${here}.choice[${j}]`, id: opt.id },
              message: `"${opt.text}" requires ${atomText(a)}, which nothing sets`,
              fix: 'set it somewhere, or drop the condition',
            });
          walkChoices(opt.do, room, `${here}.choice[${j}].do`);
        });
      }
      for (const k of ['then', 'else', 'once', 'cutscene', 'after', 'do'] as const)
        walkChoices(o[k], room, `${here}.${k}`);
      for (const k of ['nth', 'cycle', 'random', 'parallel'] as const)
        if (Array.isArray(o[k])) (o[k] as unknown[]).forEach((b, j) => walkChoices(b, room, `${here}.${k}[${j}]`));
    });
  };
  for (const r of game.rooms) {
    r.on?.forEach((x, i) => walkChoices(x.do, r.id, `on[${i}].do`));
    for (const [actor, topics] of Object.entries(r.talk ?? {}))
      topics.forEach((t, i) => walkChoices(t.do, r.id, `talk.${actor}[${i}].do`));
    walkChoices(r.onEnter, r.id, 'onEnter');
    r.scripts?.forEach((s) => {
      pathOf.set(`script:${s.id}`, { room: r.id, path: `scripts.${s.id}`, id: s.id });
      walkChoices(s.do, r.id, `scripts.${s.id}.do`);
    });
    r.events?.forEach((e, i) => walkChoices(e.do, r.id, `events[${i}].do`));
  }
  walkChoices(game.start.intro, game.start.room, 'start.intro');

  // ---- items: red herrings and never gained
  const itemWhere = (id: Id) => ({ path: `items.${id}`, id });
  for (const n of issues.deadEnds.filter((x) => x.kind === 'item')) {
    const id = n.id.slice('item:'.length);
    if (game.hintItem === id) continue;
    add({
      code: 'item-red-herring',
      severity: 'warning',
      where: itemWhere(id),
      message: `"${game.items[id]?.name ?? id}" can be picked up but no rule needs it`,
      fix: 'use it in a rule, or make it a look-only prop; keep it on purpose with lint.ignore',
    });
  }
  for (const n of issues.orphans.filter((x) => x.kind === 'item')) {
    const id = n.id.slice('item:'.length);
    if (produced.has(n.id)) continue;
    add({
      code: 'item-never-gained',
      severity: 'warning',
      where: itemWhere(id),
      message: `"${game.items[id]?.name ?? id}" is needed by a rule but nothing gives it`,
      fix: 'add a `gain`, or put it in `start.inventory`',
    });
  }

  // ---- actions dead for the solver that still change something: decoration, or a lost thread. A flag the player sees
  // through a character's variant or a text switch (4.3.0: the hero chosen in the intro) is not a lost thread.
  const shown = shownFlags(game);
  for (const n of g.nodes) {
    if (!['rule', 'topic', 'listener', 'script'].includes(n.kind) || classes.get(n.id) !== 'dead') continue;
    const outs = g.edges.filter((e) => e.from === n.id && e.kind === 'produces');
    if (!outs.length || outs.every((e) => e.to.startsWith('flag:') && shown.has(e.to.slice(5)))) continue;
    add({
      code: 'action-dead',
      severity: 'info',
      where: pathOf.get(n.id) ?? { room: n.where !== 'game' ? n.where : undefined, path: n.id },
      message: `${n.label}: changes things nothing live reads (decoration for the solver)`,
      fix: 'fine if intended; otherwise read what it sets somewhere',
    });
  }

  // ---- the hero chosen in the intro (4.3.0): values of its flag that several heroes share with the written look
  for (const f of heroLooks(game)) add(f);

  // ---- from a solver run
  const s = opts.solve;
  if (s) {
    const mode = s.mode;
    // A required signal's fallback is what a player does when the world never answers. `validate` only checks that
    // a rule matches it; the closed witness (no world outside) says whether that rule is the way through: a game
    // that finishes closed by another route has a fallback nobody plays, declared on a rule that may well be dead.
    if (s.status === 'solved' && s.reality?.startsWith('closed'))
      (game.reality?.signals ?? []).forEach((sg, i) => {
        const f = sg.fallback;
        if (sg.availability !== 'required' || !f) return;
        const played = s.steps.some(
          (e) => 'act' in e && e.act.verb === f.verb && e.act.a === f.a && (f.b === undefined || e.act.b === f.b),
        );
        if (played) return;
        add({
          code: 'fallback-unplayed',
          severity: 'warning',
          where: { path: `reality.signals[${i}].fallback` },
          message: `required signal "${sg.id}": its fallback (${f.verb} ${f.a}${f.b ? ` ${f.b}` : ''}) is not on the closed witness; the game finishes without the world outside by another route`,
          fix: 'declare as the fallback the action the closed witness plays, or make the declared one the way through',
          solver: mode,
        });
      });
    // A completed proof is the only run that can say "nothing reaches it"; a witness or a truncated proof only says
    // "not seen", as information.
    const proved = mode === 'prove' && !s.truncated;
    const search = proved ? 'exhaustive search' : mode === 'prove' ? 'truncated search' : 'solver';
    const sev = proved ? 'warning' : 'info';
    const unreachableFix = (what: string) =>
      proved
        ? `nothing reaches it: check ${what}`
        : mode === 'prove'
          ? 'the search hit its state budget: raise `--max` or prove by chapters'
          : 'run `npm run lint -- --prove` to know whether it is reachable';
    // What answered a try at all (`attempted`), and the start entry (the intro and its guided tutorial run inside it).
    // `perAction` only counts tries that changed the state: a topic that just talks would look unreachable.
    const ran = new Set(Object.keys(s.profile.attempted ?? s.profile.perAction));
    for (const e of s.steps) for (const id of e.ran ?? []) ran.add(id);
    const changed = new Set(Object.keys(s.profile.perAction));
    for (const e of s.steps) for (const id of e.ran ?? []) changed.add(id);
    const live = new Set([...classes.entries()].filter(([, c]) => c !== 'dead').map(([id]) => id));
    const noEffect = (id: string, where: Finding['where'], label: string) => {
      if (live.has(id) && ran.has(id) && !changed.has(id))
        add({
          code: 'rule-no-effect',
          severity: 'info',
          where,
          message: `${label}: the ${search} ran it, it never changed anything`,
          fix: 'fine for lines only; otherwise its `set`/`gain` is always already true where it runs',
          solver: mode,
        });
    };
    // A reaction gated on a world of Remix (a reserved `remix.*` flag) belongs to other worlds than the one searched
    // here: `npm run verify:variants` searches each world.
    const otherWorld = (c: Cond | undefined) => [...condFlags(c)].some((f) => f.startsWith('remix.'));
    for (const r of game.rooms) {
      r.on?.forEach((rule, i) => {
        if (rule.exit) return;
        const id = ruleActionId(r.id, i, rule);
        const where = { room: r.id, path: `on[${i}]`, id: rule.id };
        if (live.has(id) && !ran.has(id) && !otherWorld(rule.if))
          add({
            code: 'rule-never-run',
            severity: sev,
            where,
            message: `the ${search} never ran it`,
            fix: unreachableFix('its condition and what gates it'),
            solver: mode,
          });
        noEffect(id, where, 'this rule');
      });
      for (const [actor, topics] of Object.entries(r.talk ?? {}))
        topics.forEach((t, i) => {
          const id = topicActionId(r.id, actor, i, t);
          const where = { room: r.id, path: `talk.${actor}[${i}]`, id: t.id };
          if (live.has(id) && !ran.has(id) && !otherWorld(t.if))
            add({
              code: 'rule-never-run',
              severity: sev,
              where,
              message: `"${t.topic}": the ${search} never picked it`,
              fix: unreachableFix('its condition'),
              solver: mode,
            });
          noEffect(id, where, `"${t.topic}"`);
        });
      r.events?.forEach((ev, i) => {
        const id = listenerActionId(r.id, i, ev);
        const where = { room: r.id, path: `events[${i}]`, id: ev.id };
        if (live.has(id) && !ran.has(id))
          add({
            code: 'rule-never-run',
            severity: sev,
            where,
            message: `on "${ev.on}": never fired in the ${search}`,
            fix: proved ? 'check that something emits the event under its condition' : unreachableFix('what emits it'),
            solver: mode,
          });
        noEffect(id, where, `on "${ev.on}"`);
      });
    }
    const reached = new Set(s.roomsReached);
    for (const r of game.rooms)
      if (!reached.has(r.id))
        add({
          code: 'room-never-reached',
          severity: sev,
          where: { room: r.id, path: 'id' },
          message: `the ${search} never entered it`,
          fix: proved ? 'an exit, a `goto` or a map place must lead there' : unreachableFix('its exits'),
          solver: mode,
        });
  }

  // ---- walk links (3.4): a closed link stops the walk, never the action, so the rules of a target standing behind a
  // gated link must be gated by the same condition, else the hero acts from the other side of a shut gate.
  for (const r of game.rooms) {
    const L = layouts[r.id];
    if (!L?.walkZones) continue;
    const S = stageOf(r, L);
    const gated = S.links.filter((l) => l.if !== undefined);
    if (!gated.length) continue;
    const startZone =
      S.zones.find((z) => L.entries?.default && inPolygon(L.entries.default, z.area))?.id ?? S.zones[0]?.id;
    const free = new Set([startZone]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const k of S.links)
        if (k.if === undefined)
          for (const [a, b] of [[k.from.zone, k.to.zone], ...(k.oneWay ? [] : [[k.to.zone, k.from.zone]])])
            if (free.has(a) && !free.has(b)) {
              free.add(b);
              grew = true;
            }
    }
    const spot = (id: Id): Point | null => {
      const h = L.hotspots?.[id];
      if (h?.approach) return h.approach;
      if (h?.rect) return [h.rect[0] + h.rect[2] / 2, h.rect[1] + h.rect[3]];
      if (h?.poly) return h.poly[0] ?? null;
      const p = L.props?.[id] ?? L.actors?.[id];
      return p ? (p.approach ?? [p.x, p.y]) : null;
    };
    const zoneOf = (p: Point) => S.zones.find((z) => inPolygon(p, z.area))?.id;
    (r.on ?? []).forEach((rule, i) => {
      for (const t of [...asList(rule.a), ...asList(rule.b)]) {
        const p = spot(t);
        const z = p ? zoneOf(p) : undefined;
        if (!z || free.has(z)) continue;
        const ways = gated.filter((l) => l.from.zone === z || l.to.zone === z);
        const has = (c: Cond) => JSON.stringify(rule.if ?? null).includes(JSON.stringify(c));
        if (ways.length && !ways.some((l) => has(l.if!)))
          add({
            code: 'walk-link-gate',
            severity: 'warning',
            where: { room: r.id, path: `on[${i}]`, ...(rule.id ? { id: rule.id } : {}) },
            message: `"${t}" stands behind the walk link${ways.length > 1 ? 's' : ''} ${ways.map((l) => `"${l.id}"`).join(', ')}, which a condition closes; this rule does not check it, so the hero would act from the other side`,
            fix: `add the link's condition to the rule's \`if\` (${JSON.stringify(must(ways[0], 'gated link').if)})`,
          });
      }
    });
  }

  // ---- ignore list: `code`, `code:<id>`, `code:<room>/<path>`
  const ignore = new Set(opts.ignore ?? game.lint?.ignore ?? []);
  const kept = out.filter(
    (f) =>
      !(
        ignore.has(f.code) ||
        (f.where.id && ignore.has(`${f.code}:${f.where.id}`)) ||
        ignore.has(`${f.code}:${f.where.room ? `${f.where.room}/` : ''}${f.where.path}`)
      ),
  );
  const order: Severity[] = ['error', 'warning', 'info'];
  kept.sort(
    (a, b) =>
      order.indexOf(a.severity) - order.indexOf(b.severity) ||
      a.code.localeCompare(b.code) ||
      (a.where.room ?? '').localeCompare(b.where.room ?? '') ||
      a.where.path.localeCompare(b.where.path),
  );
  return { findings: kept, ignored: out.length - kept.length, counts: sev(kept) };
}

const mark: Record<Severity, string> = { error: '✖', warning: '⚠', info: 'ℹ' };
export const whereText = (f: Finding) =>
  `${f.where.room ? `${f.where.room}/` : ''}${f.where.path}${f.where.id ? ` (${f.where.id})` : ''}`;

/** The findings as Markdown (the Studio panel and the MCP tool). */
export function lintMarkdown(r: LintResult, mode: 'static' | 'witness' | 'prove' = 'static'): string {
  const out = [
    `# Content lint (${mode})`,
    '',
    `${r.counts.error} error(s) · ${r.counts.warning} warning(s) · ${r.counts.info} info · ${r.ignored} ignored`,
    '',
  ];
  for (const s of ['error', 'warning', 'info'] as Severity[]) {
    const list = r.findings.filter((f) => f.severity === s);
    if (!list.length) continue;
    out.push(`## ${s === 'error' ? 'Errors' : s === 'warning' ? 'Warnings' : 'Info'}`, '');
    for (const f of list) out.push(`- ${mark[s]} \`${f.code}\` ${whereText(f)}: ${f.message} → ${f.fix}`);
    out.push('');
  }
  if (!r.findings.length) out.push('Nothing to report.', '');
  return out.join('\n');
}
