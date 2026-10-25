// The pause menu's quest journal (4.1.12, ADR 0014): the game's objectives as a list, each step under its parent,
// done ✓ or open ○, a side objective marked. Read from the engine's tracker (core/objectives.ts); the titles are the
// game's, translated with the rest of its texts (`objectives/<id>.title`). Part of the player: App.objectivesMenu.
import type { Id } from '../core/types';
import { el, esc } from './app-shared';
import type { App } from './app';

export function objectivesMenu(app: App, _d: HTMLElement, m: HTMLElement) {
  const all = app.game.objectives ?? {};
  const done = app.engine.objectives.completed();
  m.innerHTML = `<h3>${esc(app.t('objectives').toUpperCase())}</h3>`;
  const list = el('ul', 'objectives');
  list.setAttribute('role', 'list');
  const ids = Object.keys(all);
  // A parent first, its steps under it; an unknown parent (refused by the validator) shows the step at the top.
  const children = (parent: Id | undefined) =>
    ids.filter((id) =>
      parent === undefined ? !all[id]!.parent || !all[all[id]!.parent!] : all[id]!.parent === parent,
    );
  const add = (id: Id, depth: number, seen: Set<Id>) => {
    if (seen.has(id)) return;
    seen.add(id);
    const o = all[id]!;
    const ok = done.has(id);
    const li = el(
      'li',
      `objective${ok ? ' done' : ''}${o.optional ? ' optional' : ''}`,
      `<span>${ok ? '✓' : '○'}</span> ${esc(app.engine.text(o.title))}`,
    );
    li.dataset.objective = id;
    li.style.paddingLeft = `${depth * 1.2}em`;
    list.append(li);
    for (const c of children(id)) add(c, depth + 1, seen);
  };
  const seen = new Set<Id>();
  for (const id of children(undefined)) add(id, 0, seen);
  for (const id of ids) add(id, 0, seen); // a cycle (refused by the validator) still lists everything once
  m.append(list);
  // The focus trap of the pause menu needs something to hold: the list itself.
  list.tabIndex = 0;
  list.focus();
}
