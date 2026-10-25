// The Voices tab (3.4): the voice production table of `npm run voices`, per language: every line with a stable id,
// who says it, its text in that language, its clip, and where it stands (draft, record, recorded, approved), with the
// actor and a note. A change is saved at once (games/<id>/voices.json, undoable); "Export CSV" hands the table to the
// actors, `npm run voices -- import` brings theirs back. Dev server only. Its second view (4.4.0), "Heroes ×
// languages", is the hero matrix (hero-matrix.ts), on every backend.
import { api, type VoicesData } from './api';
import { HeroMatrixView } from './hero-matrix';
import { download, h, select, toast } from './ui';

type View = 'table' | 'matrix';

export class VoicesTab {
  readonly el = h('section', { class: 'tab voices' });
  private table = h('div');
  private matrix = new HeroMatrixView();
  /** The demo has no voice table: the matrix first. */
  private view: View = api.voices ? 'table' : 'matrix';
  private views = h('div', { class: 'bar' });
  private data: VoicesData | null = null;
  private filter = { status: '', text: '' };

  constructor() {
    this.el.append(this.views, this.table, this.matrix.el);
    this.show(this.view);
  }

  private show(v: View) {
    this.view = v;
    this.table.hidden = v !== 'table';
    this.matrix.el.hidden = v !== 'matrix';
    this.views.replaceChildren(
      ...(
        [
          ['table', 'Recording table'],
          ['matrix', 'Heroes × languages'],
        ] as [View, string][]
      ).map(([id, label]) =>
        h(
          'button',
          { class: `small${id === v ? ' on' : ''}`, 'aria-pressed': String(id === v), onclick: () => this.pick(id) },
          label,
        ),
      ),
    );
  }

  private pick(v: View) {
    this.show(v);
    void this.load();
  }

  /** A game file changed: the matrix reads the game, the table voices.json too (main.ts). */
  onFileChanged(file: string) {
    if (this.view === 'matrix' && !this.el.hidden && /\.(ts|json)$/.test(file) && file !== 'voices.json')
      void this.matrix.load();
  }

  async load(lang?: string) {
    if (this.view === 'matrix') return this.matrix.load();
    if (!api.voices) {
      this.table.replaceChildren(
        h('p', { class: 'muted pad' }, 'The voice table needs the dev server (npm run studio).'),
      );
      return;
    }
    try {
      this.data = await api.voices(lang ?? this.data?.lang);
    } catch (e) {
      this.table.replaceChildren(h('p', { class: 'error pad' }, (e as Error).message));
      return;
    }
    this.render();
  }

  private render() {
    const d = this.data!;
    const counts = d.statuses.map((s) => `${d.rows.filter((r) => r.status === s).length} ${s}`).join(' · ');
    const shown = d.rows.filter(
      (r) =>
        (!this.filter.status || r.status === this.filter.status) &&
        (!this.filter.text || `${r.id} ${r.who} ${r.text}`.toLowerCase().includes(this.filter.text.toLowerCase())),
    );
    const save = async (id: string, patch: { status?: string; note?: string; actor?: string }) => {
      try {
        await api.setVoice!(d.lang, id, patch);
        const r = d.rows.find((x) => x.id === id)!;
        Object.assign(r, patch);
        toast(`${id}: saved`);
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    };
    const search = h('input', { type: 'search', placeholder: 'Find a line…', value: this.filter.text });
    search.addEventListener('change', () => {
      this.filter.text = search.value;
      this.render();
    });
    this.table.replaceChildren(
      h(
        'div',
        { class: 'bar' },
        h(
          'label',
          null,
          'Language ',
          select(
            d.langs.map((l) => [l, l]),
            d.lang,
            (l) => void this.load(l),
          ),
        ),
        h(
          'label',
          null,
          'Status ',
          select([['', 'all'], ...d.statuses.map((s) => [s, s] as [string, string])], this.filter.status, (s) => {
            this.filter.status = s;
            this.render();
          }),
        ),
        search,
        h(
          'span',
          { class: 'muted small' },
          `${d.rows.length} lines · ${counts} · ${d.rows.filter((r) => r.file).length} with a clip`,
        ),
        h(
          'button',
          {
            class: 'small',
            onclick: async () => {
              const c = await api.voicesCsv!(d.lang);
              download(`voices-${d.lang}.csv`, c.csv, 'text/csv');
            },
          },
          'Export CSV',
        ),
      ),
      h(
        'table',
        { class: 'vtable' },
        h(
          'thead',
          null,
          h('tr', null, ...['line', 'who', 'text', 'status', 'clip', 'actor', 'note'].map((x) => h('th', null, x))),
        ),
        h(
          'tbody',
          null,
          ...shown.slice(0, 400).map((r) => {
            const actor = h('input', { type: 'text', value: r.actor ?? '', class: 'small' });
            actor.addEventListener('change', () => void save(r.id, { actor: actor.value }));
            const note = h('input', { type: 'text', value: r.note ?? '', class: 'small' });
            note.addEventListener('change', () => void save(r.id, { note: note.value }));
            return h(
              'tr',
              { class: `v-${r.status}` },
              h('td', null, h('code', { class: 'small' }, r.id)),
              h('td', null, r.who),
              h('td', null, r.text),
              h(
                'td',
                null,
                select(
                  d.statuses.map((s) => [s, s]),
                  r.status,
                  (s) => void save(r.id, { status: s }),
                ),
              ),
              h('td', { class: 'small' }, r.file ?? '—'),
              h('td', null, actor),
              h('td', null, note),
            );
          }),
        ),
      ),
      ...(shown.length > 400
        ? [h('p', { class: 'muted small' }, `${shown.length - 400} more: narrow the search.`)]
        : []),
    );
  }
}
