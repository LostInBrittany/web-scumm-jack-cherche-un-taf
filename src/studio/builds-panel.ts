// The published builds, in a hosted Studio's Play tab (4.2.2 PR 5, G6): publish the head, see each build with its
// revision and its revision's health (green when judged valid), open one on the game's origin, and (an owner) rebuild
// one fresh to check it is reproducible. `/play/` on the game's origin is always the last green build.
import { studioFetch } from './api-base';
import { gameLink } from './game-origin';
import { h, toast } from './ui';
import { post } from './assets-io';
import { jobText } from './jobs';

interface BuildInfo {
  n: number;
  rev: number;
  by: string;
  at: number;
  health: 'ok' | 'failed' | 'unknown';
  rebuilt: { at: number; same: boolean; differ: string[] } | null;
}

const MARK = { ok: '✔ green', failed: '✖ failing', unknown: '… not judged yet' } as const;

/** A mutation is JSON on a hosted Studio (policy A), even without anything to say. */
const POST: RequestInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await studioFetch(path, init);
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(d.error ?? `${r.status} ${r.statusText}`);
  return d;
}

export function buildsPanel(o: { owner: boolean; dev: boolean }): HTMLElement {
  const list = h('ul', { class: 'builds' });
  const publish = h('button', { type: 'button', class: 'primary' }, 'Publish this revision');
  const draw = async () => {
    try {
      const { builds } = await json<{ builds: BuildInfo[] }>('builds');
      list.replaceChildren(
        ...(builds.length
          ? builds.map((b) =>
              h(
                'li',
                { 'data-build': String(b.n) },
                gameLink(`play/${b.n}/`, `#${b.n}`),
                ` · revision ${b.rev} · `,
                h('span', { class: `health ${b.health}` }, MARK[b.health]),
                h('span', { class: 'muted small' }, ` · ${b.by}, ${new Date(b.at).toLocaleString()}`),
                b.rebuilt
                  ? h(
                      'span',
                      { class: 'muted small', title: b.rebuilt.differ.join('\n') },
                      b.rebuilt.same ? ' · rebuilt the same' : ` · rebuilt different (${b.rebuilt.differ.length})`,
                    )
                  : null,
                o.owner
                  ? h(
                      'button',
                      {
                        type: 'button',
                        class: 'small',
                        onclick: async () => {
                          try {
                            const r = await json<{ same: boolean }>(`builds/${b.n}/rebuild`, POST);
                            toast(
                              r.same ? `#${b.n} rebuilt the same` : `#${b.n} rebuilt different`,
                              r.same ? 'ok' : 'error',
                            );
                          } catch (e) {
                            toast((e as Error).message, 'error');
                          }
                          void draw();
                        },
                      },
                      'Rebuild fresh',
                    )
                  : null,
              ),
            )
          : [h('li', { class: 'muted' }, 'No build yet.')]),
      );
    } catch (e) {
      list.replaceChildren(h('li', { class: 'muted' }, `Builds unavailable: ${(e as Error).message}`));
    }
  };
  publish.onclick = async () => {
    publish.disabled = true;
    try {
      const b = await json<BuildInfo>('builds', POST);
      toast(`Published #${b.n} (revision ${b.rev})`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      publish.disabled = false;
      void draw();
    }
  };
  void draw();
  return h(
    'div',
    { class: 'panel builds-panel' },
    h('h3', null, 'Published builds'),
    h(
      'p',
      { class: 'muted small' },
      'A build is the game at one revision, fixed for good. ',
      gameLink('play/', 'The last green build ↗'),
      ' is the latest whose revision was judged valid.',
    ),
    // A reviewer reads and opens the builds: publishing is a dev's.
    o.dev ? publish : null,
    list,
  );
}

/**
 * Preparing the game's images and sounds on the processing worker (4.2.2, D43): a dev's, under the project's
 * exclusive lease (no one else writes meanwhile). Since 4.2.3 it is a job (its states live, a Cancel button), and the
 * Assets tab uploads and cuts on a hosted Studio too.
 */
export function assetsPanel(): HTMLElement {
  const status = h('span', { class: 'muted small' });
  const go = h('button', { type: 'button' }, 'Prepare assets');
  go.onclick = async () => {
    go.disabled = true;
    status.textContent = 'preparing…';
    try {
      const r = await post<{ id: number; rev: number; files: number }>('prepare', {}, (j) => {
        status.textContent = jobText(j);
      });
      status.textContent = `prepared from revision ${r.rev}: ${r.files} files`;
      toast(`Assets prepared (${r.files} files)`, 'ok');
    } catch (e) {
      status.textContent = '';
      toast((e as Error).message, 'error');
    } finally {
      go.disabled = false;
    }
  };
  return h(
    'div',
    { class: 'panel assets-panel' },
    h('h3', null, 'Assets'),
    h(
      'p',
      { class: 'muted small' },
      "Prepares the game's images and sounds on the server (seconds for a small game, 2 minutes at most; nobody else writes meanwhile; Cancel stops it with nothing written). ",
      'The Assets tab uploads images and sounds and cuts sprite sheets on the server too.',
    ),
    go,
    ' ',
    status,
  );
}
