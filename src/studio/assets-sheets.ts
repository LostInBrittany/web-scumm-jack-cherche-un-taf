// Assets tab, the sheets (4.1.8, programme §4.7: the Studio's biggest owners split into model / IO / view): a sprite
// sheet in the centre (its prompt, the filter, one card per cell), the selected cell in the side panel (large, where it
// is used, Replace), and the uploads: one cell (POST assets/cell), a generated sheet cut by tools/cut-sheet.py (POST
// assets/sheet; a 409 asks which existing cells to recut), the cut result. The tab (assets.ts) owns the state and hands
// a `SheetsHost`.
import type { AssetCell, AssetPrompt, AssetSheet, CellReplaceResult, SheetUploadResult } from './api';
import { AssetsApiError, copy, pickFile, post, readFile } from './assets-io';
import { cellState, FILTERS, type Filter, fenced, keep, plural, promptOf, sheetOf, shortUse } from './assets-model';
import { type AssetsHost, backupsList, nodes, styleDetails, usedList } from './assets-view';
import { h, modal, toast } from './ui';
import { must } from '../engine/core/must';

export interface SheetsHost extends AssetsHost {
  readonly filter: Filter;
  /** The selected cell's id (the side panel shows it). */
  readonly cell: string | null;
  /** The filter changes: the sheet renders again. */
  setFilter(f: Filter): void;
  /** A cell is picked (or its panel closed): the sheet and the side panel render again. */
  setCell(id: string | null): void;
}

/** The centre for a sheet; a missing sheet drops the selection. */
export function renderSheet(host: SheetsHost, id: string): (Node | string)[] {
  const s = sheetOf(host.data(), id);
  if (!s) {
    host.select(null);
    return [h('p', { class: 'muted pad' }, `No sheet "${id}".`)];
  }
  const count = (f: Filter) => s.cells.filter((c) => keep(c, f)).length;
  const who = s.character ? (host.info.characters[s.character]?.name ?? s.character) : '';
  const grid = h(
    'div',
    { class: 'as-cells' },
    s.cells.filter((c) => keep(c, host.filter)).map((c) => cellCard(host, s, c)),
  );
  return nodes(
    h(
      'header',
      { class: 'as-head' },
      h('h2', null, s.id),
      h(
        'span',
        { class: 'muted' },
        [who, s.kind === 'talk' ? 'talk kit' : s.kind, `grid ${s.grid}`].filter(Boolean).join(' · '),
      ),
      h(
        'span',
        { class: 'muted small' },
        `${plural(s.cells.filter((c) => !c.missing).length, 'cell')}, ${count('used')} used`,
      ),
    ),
    promptPanel(host, s),
    h(
      'div',
      { class: 'bar' },
      h(
        'div',
        { class: 'seg', role: 'group', 'aria-label': 'Filter cells' },
        FILTERS.map((f) =>
          h(
            'button',
            {
              class: host.filter === f ? 'on' : undefined,
              'aria-pressed': String(host.filter === f),
              onclick: () => host.setFilter(f),
            },
            `${f.charAt(0).toUpperCase()}${f.slice(1)} (${count(f)})`,
          ),
        ),
      ),
    ),
    grid.childElementCount
      ? grid
      : h(
          'p',
          { class: 'muted' },
          host.filter === 'all'
            ? 'Nothing cut yet: copy the prompt, generate the sheet, then upload it.'
            : `No ${host.filter} cell.`,
        ),
  );
}

/** One cell of the grid: its thumbnail, its id, its first use. */
export function cellCard(host: SheetsHost, s: AssetSheet, c: AssetCell) {
  const src = host.url(c);
  const uses = c.used.map((u) => shortUse(u, s));
  const state = cellState(c);
  return h(
    'button',
    {
      class: `as-cell ${state}${host.cell === c.id ? ' on' : ''}`,
      title: c.used.join('\n') || 'not used by the game',
      onclick: () => host.setCell(c.id),
    },
    h(
      'span',
      { class: 'as-pic' },
      src
        ? h('img', { src, alt: `${s.id}/${c.id}`, loading: 'lazy' })
        : h('span', { class: 'muted small' }, c.missing ? 'missing' : 'no preview'),
    ),
    h(
      'span',
      { class: 'as-meta' },
      h('code', null, c.id),
      state === 'unprep' ? h('span', { class: 'as-b unprep', title: 'not prepared' }, '!') : null,
    ),
    h(
      'span',
      { class: 'as-use' },
      uses.length
        ? `${uses[0]}${uses.length > 1 ? ` +${uses.length - 1}` : ''}`
        : c.missing
          ? 'referenced, no file'
          : 'unused',
    ),
  );
}

function promptPanel(host: SheetsHost, s: AssetSheet): HTMLElement {
  const p: AssetPrompt | undefined = promptOf(host.data(), s.id);
  const missing = s.cells.filter((c) => c.missing).length;
  const upload = host.demo
    ? null
    : h('button', { class: 'primary', onclick: () => uploadDialog(host, s.id, s.grid) }, 'Upload generated sheet…');
  if (!p) {
    return h(
      'div',
      { class: 'as-prompt panel' },
      h(
        'div',
        { class: 'as-phead flat' },
        h('h3', null, 'Prompt'),
        h(
          'span',
          { class: 'muted small' },
          'No generated prompt for this sheet (the game does not reference it, or its cells are named by hand).',
        ),
        upload,
      ),
    );
  }
  const pre = h('pre', { class: 'as-md' }, p.markdown);
  const show = (e: Event, md: string) => {
    pre.textContent = md;
    const b = e.currentTarget as HTMLElement;
    b.parentElement?.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  };
  const missingMd = p.missingMarkdown;
  return h(
    'details',
    { class: 'as-prompt panel' },
    h(
      'summary',
      null,
      h(
        'div',
        { class: 'as-phead' },
        h(
          'h3',
          null,
          'Prompt ',
          h('span', { class: 'muted small' }, `(${p.kind}${missing ? `, ${missing} missing` : ''}: click to show)`),
        ),
        h(
          'button',
          {
            onclick: (e: Event) => {
              e.preventDefault();
              void copy(fenced(p.markdown), 'Prompt');
            },
          },
          'Copy prompt',
        ),
        missingMd
          ? h(
              'button',
              {
                onclick: (e: Event) => {
                  e.preventDefault();
                  void copy(fenced(missingMd), 'Prompt for the missing cells');
                },
              },
              'Copy prompt for missing cells only',
            )
          : null,
        upload,
      ),
    ),
    missingMd
      ? h(
          'div',
          { class: 'seg' },
          h('button', { class: 'on', onclick: (e: Event) => show(e, p.markdown) }, 'Whole sheet'),
          h('button', { onclick: (e: Event) => show(e, missingMd) }, 'Missing cells only'),
        )
      : null,
    pre,
    styleDetails(host),
    h(
      'p',
      { class: 'muted small' },
      'Copy takes the fenced text block (what goes to the image model); attach the files the section names.',
    ),
  );
}

// -------------------------------------------------------------- side panel

/** The side panel of the selected cell: large, its facts, where it is used, Replace, its backups. */
export function cellPanel(host: SheetsHost, s: AssetSheet, c: AssetCell) {
  const src = host.url(c);
  const key = h(
    'select',
    { 'aria-label': 'Background keying', class: 'small' },
    h('option', { value: 'auto' }, 'key a flat background'),
    h('option', { value: 'always' }, 'always key'),
    h('option', { value: 'never' }, 'keep as is'),
  );
  return h(
    'div',
    { class: 'as-panel' },
    h(
      'div',
      { class: 'sheethead' },
      h('h2', null, `${s.id}/${c.id}`),
      h('button', { class: 'icon', title: 'Close', onclick: () => host.setCell(null) }, '✕'),
    ),
    h(
      'div',
      { class: 'as-big' },
      src
        ? h('img', { src, alt: `${s.id}/${c.id}` })
        : h(
            'span',
            { class: 'muted' },
            c.missing ? 'Missing: the game references it, no file yet.' : 'No preview in the demo (not prepared).',
          ),
    ),
    h(
      'dl',
      { class: 'facts' },
      h('dt', null, 'File'),
      h('dd', null, c.file ? h('code', null, c.file) : '—'),
      c.w ? [h('dt', null, 'Size'), h('dd', null, `${c.w} × ${c.h} px`)] : null,
      h('dt', null, 'Image id'),
      h(
        'dd',
        null,
        c.ids.length
          ? c.ids.map((x) => h('code', null, `${x} `))
          : h('span', { class: 'muted' }, `${s.id}/${c.id} (not referenced)`),
      ),
      h('dt', null, 'Prepared'),
      h(
        'dd',
        null,
        c.missing
          ? '—'
          : !c.used.length
            ? h('span', { class: 'muted' }, 'not needed (unused)')
            : c.prepared
              ? h('span', { class: 'ok' }, '✔ in public/assets')
              : h('span', { class: 'warn' }, 'no: run Prepare assets'),
      ),
    ),
    h('section', null, h('h3', null, 'Used by'), usedList(host, c.used)),
    host.demo
      ? h('p', { class: 'muted small' }, 'Replacing a cell needs the dev server.')
      : h(
          'section',
          null,
          h('h3', null, c.missing ? 'Add the file' : 'Replace'),
          h(
            'div',
            { class: 'bar' },
            h(
              'button',
              {
                class: 'primary',
                onclick: () => void replaceCell(host, s, c, key.value as 'auto' | 'always' | 'never'),
              },
              c.missing ? 'Add file…' : 'Replace…',
            ),
            key,
          ),
          h('p', { class: 'muted small' }, c.missing ? '' : 'The current file is kept as a backup first.'),
        ),
    backupsList(host, c.backups, c.mtime),
  );
}

async function replaceCell(host: SheetsHost, s: AssetSheet, c: AssetCell, key: 'auto' | 'always' | 'never') {
  const f = await pickFile('image/png,image/jpeg,image/webp');
  try {
    host.ownWrite();
    const r = await post<CellReplaceResult>('cell', { sheetId: s.id, cell: c.id, data: await readFile(f), key });
    toast(
      `${r.file} ${c.missing ? 'added' : 'replaced'} (${r.keyed})${r.backup ? `, old one kept as ${r.backup.split('/').pop()}` : ''}`,
    );
    await host.reload();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

// -------------------------------------------------------------- sheet uploads

/** Upload a generated sheet: sheet id, grid, file → POST assets/sheet; a 409 lists the cells that exist. */
export function uploadDialog(host: SheetsHost, sheetId: string, grid: string) {
  const idIn = h('input', {
    type: 'text',
    value: sheetId,
    placeholder: 'e.g. hero_poses',
    'aria-label': 'Sheet id',
    spellcheck: 'false',
  });
  const gridIn = h('input', { type: 'text', value: grid, 'aria-label': 'Grid (columns x rows)', size: 6 });
  const fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Sheet image' });
  const status = h(
    'p',
    { class: 'muted small' },
    sheetId
      ? 'Cells that already exist are never recut without asking.'
      : 'A new sheet id creates games/<id>/art/<sheet>/.',
  );
  const go = h('button', { class: 'primary' }, 'Upload and cut');
  const body = h(
    'div',
    { class: 'addform' },
    h(
      'div',
      { class: 'row2' },
      h('label', { class: 'field' }, h('span', null, 'Sheet id'), idIn),
      h('label', { class: 'field' }, h('span', null, 'Grid (cols x rows)'), gridIn),
    ),
    h('label', { class: 'field' }, h('span', null, 'Generated image (the flat background is keyed out)'), fileIn),
    status,
    h('div', { class: 'actions' }, go),
  );
  const close = modal(sheetId ? `Upload a generated ${sheetId} sheet` : 'Upload a sheet into a new sheet id', body);
  go.addEventListener('click', async () => {
    const id = idIn.value.trim();
    const f = fileIn.files?.[0];
    if (!/^[A-Za-z0-9][\w-]*$/.test(id) || id === 'decor') {
      status.className = 'error small';
      status.textContent = 'Sheet id: letters, digits, _ and - (not "decor").';
      return;
    }
    if (!/^\d{1,2}x\d{1,2}$/i.test(gridIn.value.trim())) {
      status.className = 'error small';
      status.textContent = 'Grid: COLSxROWS, e.g. 6x4.';
      return;
    }
    if (!f) {
      status.className = 'error small';
      status.textContent = 'Choose the image first.';
      return;
    }
    go.disabled = true;
    status.className = 'muted small';
    status.textContent = 'Cutting…';
    const data = await readFile(f);
    const r = await sendSheet(host, { sheetId: id, grid: gridIn.value.trim().toLowerCase(), data }, body, status);
    go.disabled = false;
    if (r) {
      close();
      showCut(host, id, r);
    }
  });
}

/** POST assets/sheet; on 409, asks which existing cells to recut (none checked: only the new cells are cut). */
async function sendSheet(
  host: SheetsHost,
  b: { sheetId: string; grid: string; data: string; cells?: string },
  body: HTMLElement,
  status: HTMLElement,
): Promise<SheetUploadResult | null> {
  try {
    host.ownWrite();
    return await post<SheetUploadResult>('sheet', b);
  } catch (e) {
    if (!(e instanceof AssetsApiError) || e.status !== 409) {
      status.className = 'error small';
      status.textContent = (e as Error).message;
      return null;
    }
    const conflicts = (e.body.conflicts as string[]) ?? [];
    // the dialog only sends a grid matching NxM
    const dims = b.grid.split('x').map(Number);
    const cols = must(dims[0], 'grid columns'),
      rows = must(dims[1], 'grid rows');

    const all = Array.from({ length: cols * rows }, (_, i) => `r${Math.floor(i / cols) + 1}c${(i % cols) + 1}`);
    const fresh = all.filter((c) => !conflicts.includes(c));
    const boxes = conflicts.map((c) => h('input', { type: 'checkbox', value: c, 'aria-label': `Recut ${c}` }));
    const d = host.listing(); // the upload bar is live before the listing loaded, or after its load failed
    const sh = d ? sheetOf(d, b.sheetId) : undefined;
    status.className = 'warn';
    status.textContent = `${plural(conflicts.length, 'cell')} of ${b.sheetId} already exist. They are kept unless you tick them (a recut keeps the old file as a backup).`;
    return new Promise((ok) => {
      const pick = h(
        'div',
        { class: 'as-conflicts' },
        conflicts.map((c, i) => {
          const cell = sh?.cells.find((x) => x.id === c);
          const src = cell ? host.url(cell) : null;
          return h(
            'label',
            { class: 'as-conf' },
            boxes[i],
            src ? h('img', { src, alt: c }) : null,
            h('code', null, c),
            cell?.used.length ? h('small', null, 'used') : null,
          );
        }),
      );
      const all2 = h(
        'label',
        { class: 'small' },
        h('input', {
          type: 'checkbox',
          onchange: (ev: Event) =>
            boxes.forEach((x) => {
              x.checked = (ev.target as HTMLInputElement).checked;
            }),
        }),
        ' recut all of these cells',
      );
      const cut = h('button', { class: 'primary' }, 'Cut');
      const box = h(
        'div',
        { class: 'addform' },
        pick,
        all2,
        h('p', { class: 'muted small' }, `New cells cut anyway: ${fresh.length ? fresh.join(', ') : 'none'}.`),
        h('div', { class: 'actions' }, cut),
      );
      body.replaceChildren(status, box);
      cut.addEventListener('click', async () => {
        const cells = [...fresh, ...boxes.filter((x) => x.checked).map((x) => x.value)];
        if (!cells.length) {
          status.textContent = 'Nothing to cut: tick a cell to recut, or close.';
          return;
        }
        cut.disabled = true;
        status.className = 'muted small';
        status.textContent = 'Cutting…';
        ok(await sendSheet(host, { ...b, cells: cells.join(',') }, body, status));
      });
    });
  }
}

/** The cut result in a modal (the cutter's output, the backups, the cells written), then the new sheet is selected. */
function showCut(host: SheetsHost, sheetId: string, r: SheetUploadResult) {
  toast(`${sheetId}: ${plural(r.written.length, 'cell')} cut`);
  const written = new Set(r.written);
  const body = h(
    'div',
    { class: 'addform' },
    h('pre', { class: 'as-out' }, r.output || 'ok'),
    r.backups.length ? h('p', { class: 'muted small' }, `Backups: ${r.backups.join(', ')}`) : null,
    h(
      'div',
      { class: 'as-cells small' },
      r.cells
        .filter((c) => written.has(c.id))
        .map((c) => {
          const src = host.url(c);
          return h(
            'figure',
            { class: 'as-cut' },
            src ? h('img', { src, alt: c.id }) : null,
            h('figcaption', null, c.id),
          );
        }),
    ),
    h(
      'p',
      { class: 'muted small' },
      // A hosted Studio does not keep the sheet itself (4.2.3): only its cells, and the backups of those recut.
      `${r.file ? `Sheet kept as ${r.file}. ` : ''}Run Prepare assets to see the used cells in the game.`,
    ),
  );
  modal(`Cut result: ${sheetId}`, body);
  host.select({ type: 'sheet', id: sheetId }, null);
  void host.reload();
}
