// Assets tab: every image and sound of the game (games/<id>/art, audio), where each one is used, its art prompt, and
// the uploads: a generated sheet (cut by tools/cut-sheet.py), one cell, a decor, a sound. Nothing is ever deleted: a
// replaced file is kept as `<name>_v<N>` next to it. Listing through `api.assets()` (the demo reads its snapshot);
// uploads and "Prepare assets" talk to the API's assets/* (the dev server's tools/studio/assets.ts; on a hosted Studio
// since 4.2.3, studio-server's hosted-assets.ts, where Prepare and the cutting are jobs of the processing worker).
// 4.1.8, programme §4.7 (the Studio's biggest owners split into model / IO / view): this file keeps the state, the
// listing and Prepare (the IO against `api`), and the tree / centre / side orchestration; the pure functions are in
// assets-model.ts, the uploads' plumbing in assets-io.ts, the views in assets-view.ts (shared), assets-sheets.ts,
// assets-decors.ts and assets-sounds.ts, each given a host (the state and IO it needs) rather than this class.
import './assets.css';
import { api, BASE, type AssetsListing, type GameInfo } from './api';
import { DecorsView } from './assets-decors';
import { assetUrl, type Filter, sameSel, type Sel, sheetOf, summaryText, treeGroups } from './assets-model';
import { cellPanel, renderSheet, type SheetsHost, uploadDialog } from './assets-sheets';
import { renderSounds } from './assets-sounds';
import { h, toast } from './ui';
import { must } from '../engine/core/must';
import { hosting, studioFetch } from './api-base';
import { post } from './assets-io';
import { jobText } from './jobs';

export interface AssetsCtx {
  info: GameInfo;
  /** Marks a write as ours (the file watcher's echo is not announced as an outside change). */
  ownWrite(): void;
  /** After "Prepare assets": the engine view reloads with the new images. */
  prepared?(): void;
  /** Opens a room in the Rooms tab. */
  openRoom?(id: string): void;
}

export class AssetsTab {
  readonly el = h('section', { class: 'tab assets' });
  private data: AssetsListing | null = null;
  private loading: Promise<void> | null = null;
  private sel: Sel | null = null;
  private cell: string | null = null;
  private filter: Filter = 'all';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private tree = h('nav', { class: 'as-tree', 'aria-label': 'Assets' });
  private center = h('div', { class: 'as-center' });
  private side = h('aside', { class: 'as-side' });
  private prepBtn = h(
    'button',
    { class: 'primary', onclick: () => void this.prepare() },
    hosting.hosted ? 'Prepare assets (on the server)' : 'Prepare assets (npm run assets)',
  );
  private prepState = h('span', { class: 'as-chip' });
  private summary = h('span', { class: 'muted small' });
  private drawer = h('details', { class: 'as-drawer', hidden: true });
  private drawerOut = h('pre', { class: 'as-out' });
  private readonly demo = api.mode === 'demo';
  /** What the domain views get of this tab: its state and IO, behind a small interface (assets-view.ts). */
  private readonly host: SheetsHost;
  private readonly decors: DecorsView;

  constructor(private ctx: AssetsCtx) {
    const tab = this;
    this.host = {
      demo: this.demo,
      info: ctx.info,
      data: () => must(tab.data ?? undefined, 'the assets listing'),
      listing: () => tab.data,
      sel: () => tab.sel,
      select: (sel, cell) => {
        tab.sel = sel;
        if (cell !== undefined) tab.cell = cell;
      },
      url: (x) => assetUrl(x, tab.demo, BASE),
      ownWrite: () => ctx.ownWrite(),
      reload: () => tab.load(true),
      renderCenter: () => tab.renderCenter(),
      openRoom: ctx.openRoom ? (id) => ctx.openRoom?.(id) : undefined,
      get filter() {
        return tab.filter;
      },
      get cell() {
        return tab.cell;
      },
      setFilter: (f) => {
        tab.filter = f;
        tab.renderCenter();
      },
      setCell: (id) => {
        tab.cell = id;
        tab.renderCenter();
        tab.renderSide();
      },
    };
    this.decors = new DecorsView(this.host);
    this.drawer.append(h('summary', null, 'npm run assets: output'), this.drawerOut);
    this.el.append(
      h(
        'div',
        { class: 'bar as-bar' },
        this.demo
          ? h('span', { class: 'as-hint' }, 'Read-only demo: uploads and Prepare need the dev server (npm run studio).')
          : this.prepBtn,
        this.prepState,
        this.demo
          ? null
          : h('button', { onclick: () => uploadDialog(this.host, '', '6x4') }, 'Upload sheet into a new sheet id…'),
        h('button', { onclick: () => void this.load(true) }, 'Refresh'),
        this.summary,
      ),
      this.drawer,
      h('div', { class: 'as-grid' }, this.tree, this.center, this.side),
    );
    this.center.append(h('p', { class: 'muted pad' }, 'Loading…'));
  }

  /** Loads the listing (once, or again with `force`). */
  load(force = false): Promise<void> {
    if (this.data && !force) return Promise.resolve();
    this.loading ??= (async () => {
      try {
        this.data = await api.assets();
        if (!this.sel) {
          const first = this.data.sheets.find((s) => s.character === this.ctx.info.hero) ?? this.data.sheets[0];
          this.sel = first ? { type: 'sheet', id: first.id } : null;
        }
        this.render();
      } catch (e) {
        this.center.replaceChildren(h('p', { class: 'error pad' }, `The assets do not load: ${(e as Error).message}`));
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /** A file of the game changed on disk (SSE): art, audio or the manifest → list again (debounced). */
  onFileChanged(file: string) {
    if (!this.data || !/^(art|audio)\/|^assets\.gen\.json$/.test(file)) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(true), 500);
  }

  // -------------------------------------------------------------- render

  private render() {
    const d = this.data;
    if (!d) return;
    this.summary.textContent = summaryText(d);
    this.prepState.textContent = d.unprepared ? `${d.unprepared} not prepared` : 'all prepared';
    this.prepState.className = `achip ${d.unprepared ? 'unprep' : 'ok'}`;
    this.renderTree();
    this.renderCenter();
    this.renderSide();
  }

  private renderTree() {
    const groups = treeGroups(this.host.data(), this.ctx.info.characters, {
      decor: this.demo
        ? undefined
        : h('button', { class: 'add small', onclick: () => void this.decors.add() }, '+ background'),
    });
    this.tree.replaceChildren(
      ...groups.map((g) =>
        h(
          'section',
          null,
          h('h3', null, g.title, h('span', { class: 'muted' }, ` ${g.items.length}`), g.add),
          g.items.length
            ? h(
                'ul',
                null,
                g.items.map((it) =>
                  h(
                    'li',
                    null,
                    h(
                      'button',
                      {
                        class: `as-ent${sameSel(this.sel, it.sel) ? ' on' : ''}`,
                        'aria-current': sameSel(this.sel, it.sel) ? 'true' : undefined,
                        onclick: () => {
                          this.sel = it.sel;
                          this.cell = null;
                          this.filter = 'all';
                          this.render();
                        },
                      },
                      h(
                        'span',
                        { class: 'as-label' },
                        h('b', null, it.label),
                        it.sub ? h('small', null, it.sub) : null,
                      ),
                      h(
                        'span',
                        { class: 'as-badges' },
                        it.badges
                          .filter(([, n]) => n > 0)
                          .map(([k, n, t]) => h('span', { class: `as-b ${k}`, title: t }, String(n))),
                      ),
                    ),
                  ),
                ),
              )
            : h('p', { class: 'muted small' }, 'none'),
        ),
      ),
    );
  }

  private renderCenter() {
    const s = this.sel;
    if (!s) {
      this.center.replaceChildren(h('p', { class: 'muted pad' }, 'No asset yet.'));
      return;
    }
    if (s.type === 'sheet') this.center.replaceChildren(...renderSheet(this.host, s.id));
    else if (s.type === 'decor') void this.decors.render(s.id, (kids) => this.center.replaceChildren(...kids));
    else this.center.replaceChildren(...renderSounds(this.host, s.kind));
  }

  private renderSide() {
    const s = this.sel;
    if (s?.type === 'sheet' && this.cell) {
      const sh = this.data ? sheetOf(this.data, s.id) : undefined;
      const c = sh?.cells.find((x) => x.id === this.cell);
      if (sh && c) {
        this.side.replaceChildren(cellPanel(this.host, sh, c));
        return;
      }
    }
    if (s?.type === 'decor') {
      const d = this.data?.decors.find((x) => x.name === s.id);
      if (d) {
        this.side.replaceChildren(this.decors.panel(d));
        return;
      }
    }
    this.side.replaceChildren(
      h(
        'div',
        { class: 'as-empty' },
        h(
          'p',
          { class: 'muted' },
          s?.type === 'sounds'
            ? 'Play a sound with its player; Replace keeps the old file as a backup.'
            : 'Click a cell to see it large, where it is used, and to replace it.',
        ),
        h(
          'ul',
          { class: 'as-legend' },
          h('li', null, h('span', { class: 'as-b miss' }, 'n'), ' referenced by the game, no file'),
          h('li', null, h('span', { class: 'as-b unprep' }, 'n'), ' used, not prepared yet (Prepare assets)'),
          h('li', null, h('span', { class: 'as-b unused' }, 'n'), ' cut but not used by the game'),
        ),
      ),
    );
  }

  // -------------------------------------------------------------- prepare

  /** A hosted Studio's Prepare (4.2.3): a job of the processing worker, its states in the drawer, cancellable. */
  private async prepareHosted() {
    this.prepBtn.disabled = true;
    this.drawer.hidden = false;
    this.drawer.open = true;
    this.drawerOut.textContent = 'Prepare assets, on the server\n';
    let ok = false;
    try {
      const r = await post<{ rev: number; files: number; log: string }>('prepare', {}, (j) => {
        this.drawerOut.textContent += `${jobText(j)}\n`;
      });
      this.drawerOut.textContent += `${r.log}\nprepared from revision ${r.rev}: ${r.files} files\n`;
      ok = true;
      toast(`Assets prepared (${r.files} files)`, 'ok');
    } catch (e) {
      this.drawerOut.textContent += `${(e as Error).message}\n`;
      toast((e as Error).message, 'error');
    } finally {
      this.prepBtn.disabled = false;
    }
    this.ctx.ownWrite();
    await this.load(true);
    if (ok) this.ctx.prepared?.();
  }

  /** POST assets/prepare?stream=1: `npm run assets` with its output live in the drawer. */
  private async prepare() {
    if (hosting.hosted) return this.prepareHosted();
    this.prepBtn.disabled = true;
    this.drawer.hidden = false;
    this.drawer.open = true;
    this.drawerOut.textContent = '$ npm run assets\n';
    let code = 1;
    try {
      const r = await studioFetch('assets/prepare?stream=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!r.ok || !r.body) throw new Error(`${r.status} ${r.statusText}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.ctx.ownWrite(); // the manifest it rewrites is not an outside change
        this.drawerOut.textContent += dec.decode(value, { stream: true });
        this.drawerOut.scrollTop = this.drawerOut.scrollHeight;
      }
      code = Number(/\[exit (\d+)\]\s*$/.exec(this.drawerOut.textContent ?? '')?.[1] ?? 1);
      toast(code === 0 ? 'Assets prepared' : `npm run assets failed (exit ${code})`, code === 0 ? 'ok' : 'error');
    } catch (e) {
      this.drawerOut.textContent += `\n${(e as Error).message}\n`;
      toast((e as Error).message, 'error');
    } finally {
      this.prepBtn.disabled = false;
    }
    this.ctx.ownWrite();
    await this.load(true);
    if (code === 0) this.ctx.prepared?.();
  }
}
