// Rooms tab, the sheets (4.1.8, programme §4.7: the Studio's biggest owners split into model / IO / view): the
// selected entity's sheet (name, facts, look lines, reactions, talk topics as a list or a tree) and the room's sheet
// (name, stage, painter, hints, on enter, scripts, events). Both are built from the lines and command lists of
// rooms-lines.ts and return their parts; the tab (rooms.ts) puts them in place and answers the host interface: the
// room shown, the writes, the structured edits (a reaction or the stage as a form).
import type { Cond, Rule } from '@engine/core/types';
import { dialogueTree, type DialogueNode } from '@engine/tools/dialogue';
import { must } from '../engine/core/must';
import { imgUrl } from './api';
import { appender, cmds, line, type LinesHost, timed } from './rooms-lines';
import { asList, condText, entityDef, entityName, KIND_LABEL, ruleHead, SECTION, type Sel } from './rooms-text';
import { h, select } from './ui';

/** What the sheets ask of the tab, beyond the lines. */
export interface SheetHost extends LinesHost {
  /** A reaction as a form (`on[i]`); a new one when `blank` is given. */
  editRule(i: number, blank?: Rule): void;
  /** The stage (layers, lights, particles, transition) as a form. */
  editStage(): void;
}

// ---------------------------------------------------------------------------
// The selected entity's sheet
// ---------------------------------------------------------------------------

/** The parts of the selected entity's sheet; a hint alone when nothing (or nothing known) is selected. */
export function entitySheet(host: SheetHost, s: Sel): HTMLElement[] {
  const d = host.data?.def;
  if (!d || !s || !entityDef(d, s))
    return [h('p', { class: 'muted hint' }, 'Select a prop, an actor or a hotspot in the list or in the view.')];
  const id = s.id;
  const sec = SECTION[s.kind];
  const parts: (HTMLElement | null)[] = [];

  // Header: name
  const nameLine = line(host, `${sec}.${id}.name`, { label: 'name' });
  const title = entityName(d, host.info.characters, s.kind, id);
  parts.push(
    h(
      'header',
      { class: 'sheethead' },
      h('span', { class: `kind k-${s.kind}` }, KIND_LABEL[s.kind]),
      h('h2', null, id),
      title && title !== id ? h('span', { class: 'muted' }, title) : null,
    ),
  );
  if (nameLine) parts.push(nameLine);

  // Facts (read-only)
  const facts: HTMLElement[] = [];
  if (s.kind === 'prop') {
    const p = must(d.props?.[id], 'selected prop');
    if (p.img) facts.push(h('div', { class: 'fact' }, h('b', null, 'image'), thumb(p.img), h('code', null, p.img)));
    if (p.states)
      facts.push(
        h(
          'div',
          { class: 'fact' },
          h('b', null, 'states'),
          h(
            'div',
            { class: 'states' },
            Object.entries(p.states).map(([st, im]) =>
              h(
                'figure',
                { class: st === p.initial ? 'initial' : '' },
                thumb(im),
                h('figcaption', null, st, st === p.initial ? ' ★' : ''),
              ),
            ),
          ),
        ),
      );
    if (!p.name) facts.push(h('div', { class: 'fact muted' }, 'No name: scenery, not clickable.'));
  }
  if (s.kind === 'actor') {
    const a = must(d.actors?.[id], 'selected actor');
    facts.push(
      h(
        'div',
        { class: 'fact' },
        h('b', null, 'character'),
        h('code', null, a.char),
        a.pose ? h('span', null, ` pose ${a.pose}`) : null,
        a.facing ? h('span', null, ` facing ${a.facing}`) : null,
        a.interactive === false ? h('span', { class: 'muted' }, ' (not interactive)') : null,
      ),
    );
  }
  // A declared exit (shown as its hotspot): what a single tap with no verb does (#188), the game's setting or its own.
  const exit = s.kind === 'hotspot' ? d.exits?.[id] : undefined;
  if (exit)
    facts.push(
      h(
        'label',
        { class: 'fact' },
        h('b', null, 'single tap'),
        select(
          [
            ['', 'as the game says (input.exitOnTap)'],
            ['go', 'goes through'],
            ['walk', 'walks there'],
          ],
          exit.onTap ?? '',
          (v) => host.writeValue(`exits.${id}.onTap`, v || undefined),
        ),
      ),
    );
  const vis = (entityDef(d, s) as { visible?: Cond }).visible;
  facts.push(
    h('div', { class: 'fact' }, h('b', null, 'visible'), vis === undefined ? 'always' : h('code', null, condText(vis))),
  );
  parts.push(h('div', { class: 'facts' }, facts));

  // Look lines
  const look = d.look?.[id];
  const lookPaths =
    look === undefined ? [] : Array.isArray(look) ? look.map((_, i) => `look.${id}[${i}]`) : [`look.${id}`];
  parts.push(
    h(
      'section',
      null,
      h(
        'h3',
        null,
        'Look ',
        h('span', { class: 'muted small' }, lookPaths.length > 1 ? 'one line per look, in turn' : ''),
      ),
      lookPaths.length
        ? lookPaths.map((p) => line(host, p, { deletable: true }))
        : h('p', { class: 'warn' }, 'No look line yet: everything visible should have one.'),
      appender(host, `look.${id}`, 'New look line…'),
    ),
  );

  // Reactions touching this entity
  const rules = (d.on ?? [])
    .map((r, i) => [r, i] as const)
    .filter(([r]) => asList(r.a).includes(id) || asList(r.b).includes(id));
  parts.push(
    h(
      'section',
      null,
      h('h3', null, 'Reactions ', h('span', { class: 'muted' }, String(rules.length))),
      rules.length
        ? rules.map(([r, i]) =>
            h(
              'div',
              { class: 'rule' },
              h(
                'div',
                { class: 'rulehead' },
                h('span', null, ruleHead(host.info, r)),
                r.if !== undefined ? h('code', { class: 'cond' }, `if ${condText(r.if)}`) : null,
                h('span', { class: 'muted small' }, `on[${i}]`),
                h(
                  'button',
                  {
                    class: 'small',
                    title: 'Edit the verb, targets, condition and commands as a form',
                    onclick: () => host.editRule(i),
                  },
                  'Edit…',
                ),
              ),
              cmds(host, r.do, `on[${i}].do`),
            ),
          )
        : h('p', { class: 'muted' }, "None in this room: the game's fallback answers apply."),
      h(
        'button',
        { class: 'small', onclick: () => host.editRule((d.on ?? []).length, { verb: 'look', a: id, do: [] }) },
        '+ Reaction',
      ),
    ),
  );

  // Talk topics
  if (s.kind === 'actor') {
    const topics = d.talk?.[id] ?? [];
    const list = h(
      'div',
      null,
      ...(topics.length
        ? topics.map((t, i) =>
            h(
              'div',
              { class: 'rule' },
              h(
                'div',
                { class: 'rulehead' },
                line(host, `talk.${id}[${i}].topic`, { label: 'topic' }) ?? h('span', null, t.topic),
                t.if !== undefined ? h('code', { class: 'cond' }, `if ${condText(t.if)}`) : null,
              ),
              cmds(host, t.do, `talk.${id}[${i}].do`),
            ),
          )
        : [h('p', { class: 'muted' }, 'No topics (only the game-wide ones).')]),
    );
    // The same topics as a tree (read-only): topics, lines, choices and their options, branches; tapping a node
    // scrolls to its editor in the list.
    const tree = h('div', { class: 'dtree', hidden: true }, dialogueNodes(dialogueTree(topics, `talk.${id}`), list));
    const toggle = h(
      'button',
      {
        class: 'small',
        onclick: () => {
          const t = tree.hidden;
          tree.hidden = !t;
          list.hidden = t;
          toggle.textContent = t ? 'List' : 'Tree';
        },
      },
      'Tree',
    );
    parts.push(
      h(
        'section',
        null,
        h(
          'h3',
          null,
          'Talk topics ',
          h('span', { class: 'muted' }, String(topics.length)),
          ' ',
          topics.length ? toggle : null,
        ),
        list,
        tree,
      ),
    );
  }
  return parts.filter((x): x is HTMLElement => !!x);
}

/** The dialogue tree as nested lists; a node with a content path scrolls to that editor in `list`. */
function dialogueNodes(nodes: DialogueNode[], list: HTMLElement): HTMLElement {
  return h(
    'ul',
    null,
    ...nodes.map((n) => {
      const label =
        n.kind === 'topic'
          ? `"${n.text}"`
          : n.kind === 'line'
            ? `${n.who}: ${n.text}`
            : n.kind === 'option'
              ? `○ "${n.text}"`
              : n.kind === 'choice'
                ? '? choice'
                : n.text;
      const path = n.path;
      const go = path
        ? () => {
            list.hidden = false;
            const el = list.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
            el?.scrollIntoView({ block: 'center' });
            el?.querySelector<HTMLElement>('textarea, input')?.focus();
          }
        : undefined;
      return h(
        'li',
        { class: `d-${n.kind}` },
        h('span', { class: n.path ? 'dnode link' : 'dnode', onclick: go }, label),
        n.cond && n.kind !== 'if' ? h('code', { class: 'cond' }, `if ${n.cond}`) : null,
        n.children?.length ? dialogueNodes(n.children, list) : null,
      );
    }),
  );
}

function thumb(id: string) {
  return h('img', { class: 'thumb', src: imgUrl(id), alt: id, title: id, loading: 'lazy' });
}

// ---------------------------------------------------------------------------
// The room's sheet
// ---------------------------------------------------------------------------

/** The sections of the room's sheet (the notes block is appended by the tab); null before the room is loaded. */
export function roomSheet(host: SheetHost): HTMLElement[] | null {
  const data = host.data;
  const d = data?.def;
  if (!data || !d) return null;
  const hints = d.hints ?? [];
  return [
    h(
      'section',
      null,
      h('h3', null, 'Room ', h('span', { class: 'muted small' }, data.file)),
      line(host, 'name', { label: 'name' }) ?? h('p', null, d.name),
      // 3.4: the stage (layers, lights, particles, transition, walk links' logic) as a form; its geometry is placed
      // in the view (the editor's Stage and Walk zones folders). The painter: DOM (the reference) or canvas.
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { class: 'small', onclick: () => host.editStage() },
          d.stage ? `Stage… (${(d.stage.layers ?? []).length} layers)` : 'Stage…',
        ),
        h(
          'label',
          { class: 'small' },
          'painter ',
          select(
            [
              ['', `game (${(host.info as unknown as { renderer?: string }).renderer ?? 'dom'})`],
              ['dom', 'DOM'],
              ['canvas', 'canvas'],
            ],
            d.renderer ?? '',
            (v) => host.writeValue('renderer', v || undefined),
          ),
        ),
      ),
    ),
    h(
      'section',
      null,
      h(
        'h3',
        null,
        'Hints ',
        h('span', { class: 'muted small' }, 'the first one whose condition is still false is given'),
      ),
      hints.length
        ? hints.map((hd, i) =>
            h(
              'div',
              { class: 'rule' },
              h(
                'div',
                { class: 'rulehead' },
                h('code', { class: 'cond' }, `until ${condText(hd.until)}`),
                h('span', { class: 'muted small' }, `hints[${i}]`),
              ),
              hd.lines.map((_, j) => line(host, `hints[${i}].lines[${j}]`, { deletable: hd.lines.length > 1 })),
              appender(host, `hints[${i}].lines`, 'New hint line…'),
            ),
          )
        : h('p', { class: 'muted' }, 'No hints in this room.'),
    ),
    h(
      'section',
      null,
      h('h3', null, 'On enter'),
      d.onEnter?.length
        ? timed(host, d.onEnter, 'onEnter')
        : h('p', { class: 'muted' }, 'Nothing happens on entering.'),
    ),
    h(
      'section',
      null,
      h('h3', null, 'Scripts ', h('span', { class: 'muted small' }, 'run on their own while the player is here')),
      d.scripts?.length
        ? d.scripts.map((sc, i) =>
            h(
              'div',
              { class: 'rule' },
              h(
                'div',
                { class: 'rulehead' },
                h('code', null, sc.id),
                h(
                  'span',
                  { class: 'muted small' },
                  `${sc.loop ? 'loop' : 'once'}${sc.while ? ` while ${condText(sc.while)}` : ''}`,
                ),
              ),
              timed(host, sc.do, `scripts[${i}].do`),
            ),
          )
        : h('p', { class: 'muted' }, 'No scripts in this room.'),
    ),
    h(
      'section',
      null,
      h('h3', null, 'Events ', h('span', { class: 'muted small' }, 'listeners of { emit }')),
      d.events?.length
        ? d.events.map((ev, i) =>
            h(
              'div',
              { class: 'rule' },
              h(
                'div',
                { class: 'rulehead' },
                h('code', null, `on ${ev.on}`),
                h('span', { class: 'muted small' }, `${ev.once ? 'once' : ''}${ev.if ? ` if ${condText(ev.if)}` : ''}`),
              ),
              cmds(host, ev.do, `events[${i}].do`),
            ),
          )
        : h('p', { class: 'muted' }, 'No listeners in this room.'),
    ),
  ];
}
