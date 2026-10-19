// The Map tab (4.2.3 PR 2, plan H1): the team's groupings (characters, puzzles, chapters), each a list of what the game
// already names, with the `file:line` that writes each one, or "not declared" when the IR does not know it; then what
// no grouping names yet. A grouping is written in `groupings.json` only (its own span): editing it never touches the
// content it references. The map itself is derived by the server at each read, never stored.
import type { Grouping, GroupingKind, MapRef, ScenarioMap } from '../../tools/studio/scenario-map';
import { api } from './api';
import { h, modal, toast } from './ui';

const KINDS: GroupingKind[] = ['chapter', 'puzzle', 'character'];

const where = (r: MapRef) =>
  r.at ? h('code', null, `${r.at.file}:${r.at.line}`) : h('span', { class: 'warn' }, 'not declared');

export class MapTab {
  readonly el = h('section', { class: 'tab map' });
  private map: ScenarioMap | undefined;
  private groupings: Grouping[] = [];
  private skipped: string[] = [];

  /** `readOnly`: a reviewer's Studio, which reads the map and edits nothing. */
  constructor(private readonly readOnly = false) {}

  /** Read again when the groupings or the content changed, if the tab was opened. */
  onFileChanged(file: string) {
    if (this.map && (file === 'groupings.json' || /\.ts$/.test(file))) void this.load();
  }

  async load(): Promise<void> {
    if (!api.map || !api.groupings) {
      this.el.replaceChildren(h('p', { class: 'muted' }, 'The scenario map needs the dev server or a hosted Studio.'));
      return;
    }
    try {
      const [map, file] = await Promise.all([api.map(), api.groupings()]);
      this.map = map;
      this.groupings = file.groupings;
      this.skipped = file.skipped ?? [];
    } catch (e) {
      this.el.replaceChildren(h('p', { class: 'error' }, (e as Error).message));
      return;
    }
    this.render();
  }

  private async save(next: Grouping[]): Promise<boolean> {
    try {
      await api.setGroupings!({ groupings: next });
      await this.load();
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    }
  }

  private edit(g: Grouping | undefined) {
    const id = h('input', { value: g?.id ?? '', disabled: !!g, 'aria-label': 'id', placeholder: 'the-key' });
    const title = h('input', { value: g?.title ?? '', 'aria-label': 'title' });
    const kind = h(
      'select',
      { 'aria-label': 'kind' },
      KINDS.map((k) => h('option', { value: k, selected: g?.kind === k }, k)),
    );
    const refs = h('textarea', { rows: 8, 'aria-label': 'references' }, (g?.refs ?? []).join('\n'));
    const close = modal(
      g ? `Grouping ${g.id}` : 'New grouping',
      h(
        'div',
        { class: 'grouping-form' },
        h('label', null, 'Id ', id),
        h('label', null, 'Title ', title),
        h('label', null, 'Kind ', kind),
        h(
          'label',
          null,
          'What it names, one per line (a room, a rule or topic id, item:<id>, char:<id>, objective:<id>, checkpoint:<id>)',
          refs,
        ),
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'primary',
              onclick: async () => {
                const next: Grouping = {
                  id: id.value.trim(),
                  kind: kind.value as GroupingKind,
                  title: title.value.trim(),
                  refs: refs.value
                    .split('\n')
                    .map((r) => r.trim())
                    .filter(Boolean),
                };
                // An edit keeps its place in the file; a new one goes last, and an id already used is the server's to refuse.
                const all = g ? this.groupings.map((x) => (x.id === g.id ? next : x)) : [...this.groupings, next];
                if (await this.save(all)) close();
              },
            },
            'Save',
          ),
          g
            ? h(
                'button',
                {
                  type: 'button',
                  onclick: async () => {
                    if (await this.save(this.groupings.filter((x) => x.id !== g.id))) close();
                  },
                },
                'Delete the grouping',
              )
            : null,
        ),
      ),
    );
  }

  private render() {
    const m = this.map!;
    const byId = new Map(this.groupings.map((g) => [g.id, g]));
    const parts: (HTMLElement | null)[] = [
      h(
        'p',
        { class: 'muted' },
        'Characters, puzzles and chapters, each a list of what the game names. A grouping only refers: editing it never changes the game.',
      ),
      this.skipped.length
        ? h(
            'div',
            { class: 'warn' },
            h('p', null, 'groupings.json holds entries the Studio cannot read; saving keeps only the readable ones:'),
            h(
              'ul',
              null,
              this.skipped.map((p) => h('li', null, p)),
            ),
          )
        : null,
      this.readOnly ? null : h('button', { type: 'button', onclick: () => this.edit(undefined) }, 'New grouping'),
      ...KINDS.map((k) => {
        const gs = m.groupings.filter((g) => g.kind === k);
        return h(
          'div',
          { class: 'map-kind' },
          h('h3', null, `${k[0]!.toUpperCase()}${k.slice(1)}s`),
          gs.length
            ? gs.map((g) =>
                h(
                  'details',
                  { class: 'grouping', open: true },
                  h(
                    'summary',
                    null,
                    h('strong', null, g.title),
                    ` ${g.id} · ${g.refs.length} `,
                    this.readOnly
                      ? null
                      : h(
                          'button',
                          {
                            type: 'button',
                            // Inside the summary: edits, never folds the grouping as well.
                            onclick: (e: Event) => {
                              e.preventDefault();
                              this.edit(byId.get(g.id));
                            },
                          },
                          'Edit',
                        ),
                  ),
                  h(
                    'table',
                    { class: 'grid' },
                    g.refs.map((r) =>
                      h(
                        'tr',
                        null,
                        h('td', null, h('code', null, r.ref)),
                        h('td', null, r.kind),
                        h('td', null, where(r)),
                      ),
                    ),
                  ),
                ),
              )
            : h('p', { class: 'muted' }, 'None yet.'),
        );
      }),
      h('h3', null, 'Not in any grouping'),
      h('p', { class: 'muted' }, 'Rooms, characters, items, objectives and checkpoints no grouping names yet.'),
      Object.keys(m.ungrouped).length
        ? h(
            'dl',
            { class: 'ungrouped' },
            Object.entries(m.ungrouped).flatMap(([kind, refs]) => [
              h('dt', null, kind),
              h(
                'dd',
                null,
                refs.map((r) => h('code', null, r)).flatMap((c, n) => (n ? [', ', c] : [c])),
              ),
            ]),
          )
        : h('p', { class: 'muted' }, 'Everything is in a grouping.'),
    ];
    this.el.replaceChildren(...parts.filter((x): x is HTMLElement => x !== null));
  }
}
