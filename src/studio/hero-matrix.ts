// The Voices tab's "Heroes × languages" view (4.4.0): the matrix of src/engine/tools/hero-matrix.ts, read-only. A row
// per line with a stable id that depends on the hero (a text switch, `{hero}`, in any language); a column per hero (the
// values the switched flags take, headed by the hero's variant: portrait, name) and per language; each cell the text
// as the player reads it and the clip that plays, or what is missing. Filters: the rows with a problem, a language, a
// search. The dev server, a hosted Studio and the in-browser demo alike (`api.heroMatrix`).
import { api, type HeroMatrix, imgUrl } from './api';
import { h, select } from './ui';

type Row = HeroMatrix['rows'][number];
type Cell = Row['cells'][number][number];

/** The clip line of a cell: what plays, what is missing, what is borrowed. */
function clipOf(c: Cell): HTMLElement {
  const bits: (string | HTMLElement)[] = [];
  if (c.missing) bits.push(h('span', { class: 'bad' }, `missing ${c.want}`));
  if (c.clip)
    bits.push(
      h(
        'span',
        { class: c.fallback ? 'hm-fallback' : '', title: c.file ?? '' },
        `${c.missing ? ' · fallback ' : '▶ '}${c.clip}`,
        c.borrowed ? ' (game’s language)' : '',
      ),
    );
  if (!bits.length) bits.push(h('span', { class: 'muted' }, 'no clip'));
  return h('div', { class: 'small hm-clip' }, ...bits);
}

export class HeroMatrixView {
  readonly el = h('div', { class: 'hero-matrix' });
  private data: HeroMatrix | null = null;
  private filter = { problems: false, lang: '', text: '' };

  async load() {
    if (!api.heroMatrix) {
      this.el.replaceChildren(h('p', { class: 'muted pad' }, 'The hero matrix is not available on this backend.'));
      return;
    }
    try {
      this.data = await api.heroMatrix();
    } catch (e) {
      this.el.replaceChildren(h('p', { class: 'error pad' }, (e as Error).message));
      return;
    }
    this.render();
  }

  private render() {
    const d = this.data!;
    if (!d.columns.length) {
      this.el.replaceChildren(
        h('p', { class: 'muted pad' }, 'No text switches on a flag: every hero reads the same lines (CONTENT_GUIDE).'),
      );
      return;
    }
    const langs = this.filter.lang ? [this.filter.lang] : d.langs;
    const li = langs.map((l) => d.langs.indexOf(l));
    const q = this.filter.text.toLowerCase();
    const shown = d.rows.filter(
      (r) =>
        (!this.filter.problems || r.problem) &&
        (!q || `${r.id} ${r.who} ${Object.values(r.texts).join(' ')}`.toLowerCase().includes(q)),
    );
    const search = h('input', { type: 'search', placeholder: 'Find a line…', value: this.filter.text });
    search.addEventListener('change', () => {
      this.filter.text = search.value;
      this.render();
    });
    const problems = d.rows.filter((r) => r.problem).length;
    const head1 = h(
      'tr',
      null,
      h('th', { rowspan: 2 }, 'line'),
      ...d.columns.map((c) =>
        h(
          'th',
          { colspan: langs.length, class: 'hm-hero', title: c.key },
          c.hero.portrait ? h('img', { src: imgUrl(c.hero.portrait), alt: '', class: 'hm-portrait' }) : null,
          h('div', null, c.hero.names[d.langs[0]!] ?? c.hero.id),
          h('code', { class: 'small muted' }, c.key),
        ),
      ),
    );
    const head2 = h(
      'tr',
      null,
      ...d.columns.flatMap((c) =>
        langs.map((l) => h('th', { class: 'small', title: c.hero.names[l] ?? '' }, `${l} · ${c.hero.names[l] ?? ''}`)),
      ),
    );
    const flagsOf = (r: Row) => [
      ...r.untranslated.map((l) => h('span', { class: 'tag hm-warn' }, `untranslated ${l}`)),
      ...r.agreement.map((l) =>
        h('span', { class: 'tag hm-warn', title: 'the translation drops a choice the source makes' }, `agreement ${l}`),
      ),
    ];
    const body = shown.slice(0, 200).map((r) =>
      h(
        'tr',
        { class: r.problem ? 'hm-problem' : '' },
        h('td', null, h('code', { class: 'small' }, r.id), h('div', { class: 'small muted' }, r.who), ...flagsOf(r)),
        ...r.cells.flatMap((col) =>
          li.map((i) => {
            const c = col[i]!;
            return h(
              'td',
              { class: c.missing || c.unlisted ? 'hm-cell hm-bad' : 'hm-cell' },
              h('div', null, c.text),
              clipOf(c),
              c.unlisted
                ? h(
                    'div',
                    { class: 'small bad', title: 'no switch lists this value and none has *=: the first text shows' },
                    `unlisted ${c.unlisted.join(', ')}`,
                  )
                : null,
            );
          }),
        ),
      ),
    );
    this.el.replaceChildren(
      h(
        'div',
        { class: 'bar' },
        h(
          'label',
          null,
          'Show ',
          select(
            [
              ['all', 'all lines'],
              ['problems', 'lines with a problem'],
            ],
            this.filter.problems ? 'problems' : 'all',
            (v) => {
              this.filter.problems = v === 'problems';
              this.render();
            },
          ),
        ),
        h(
          'label',
          null,
          'Language ',
          select([['', 'all'], ...d.langs.map((l): [string, string] => [l, l])], this.filter.lang, (l) => {
            this.filter.lang = l;
            this.render();
          }),
        ),
        search,
        h(
          'span',
          { class: 'muted small' },
          `${d.rows.length} lines · ${problems} with a problem · ${d.columns.length} heroes × ${d.langs.length} languages`,
          d.truncated ? ` (${d.truncated} more combinations left out)` : '',
        ),
      ),
      h(
        'div',
        { class: 'hm-scroll' },
        h('table', { class: 'vtable hm' }, h('thead', null, head1, head2), h('tbody', null, ...body)),
      ),
      ...(shown.length > 200
        ? [h('p', { class: 'muted small' }, `${shown.length - 200} more: narrow the search.`)]
        : []),
    );
  }
}
