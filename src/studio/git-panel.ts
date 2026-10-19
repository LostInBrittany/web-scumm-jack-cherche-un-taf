// The game's Git repository, in a hosted Studio's Play tab (4.2.3 PR 6, H5): where it goes (the remote, the branch, the
// folder) and how far it went (the last revision pushed, its commit); an owner pushes the revisions since, or imports
// the branch as one revision. A branch that moved since the last push is refused by the server, never forced: the
// owner imports it first.
import { studioFetch } from './api-base';
import { h, toast } from './ui';

interface GitState {
  remote: string;
  branch: string;
  path: string;
  pushed: number | null;
  commit: string | null;
}

/** A mutation is JSON on a hosted Studio (policy A), even without anything to say. */
const POST: RequestInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await studioFetch(path, init);
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw Object.assign(new Error(d.error ?? `${r.status} ${r.statusText}`), { status: r.status });
  return d;
}

export function gitPanel(o: { owner: boolean }): HTMLElement {
  const state = h('p', { class: 'muted small' }, 'Reading…');
  const push = h('button', { type: 'button', class: 'primary' }, 'Push to Git');
  const pull = h('button', { type: 'button' }, 'Import from Git');
  const el = h(
    'section',
    { class: 'git-panel' },
    h('h3', null, 'Git'),
    state,
    o.owner ? h('p', null, push, ' ', pull) : null,
  );
  const draw = async () => {
    try {
      const g = await json<GitState>('git');
      state.textContent =
        `${g.remote} · ${g.branch}${g.path ? ` · ${g.path}/` : ''} · ` +
        (g.pushed
          ? `revision ${g.pushed} pushed${g.commit ? ` (${g.commit.slice(0, 12)})` : ''}`
          : 'nothing pushed yet');
    } catch (e) {
      if ((e as { status?: number }).status === 404) el.hidden = true;
      else state.textContent = `Git unavailable: ${(e as Error).message}`;
    }
  };
  const act = (b: HTMLButtonElement, path: string, done: (r: Record<string, unknown>) => string, ask?: string) => {
    const label = b.textContent;
    b.onclick = async () => {
      // A second click confirms what the first said (no browser dialog).
      if (ask && b.textContent !== ask) {
        b.textContent = ask;
        setTimeout(() => {
          b.textContent = label;
        }, 6000);
        return;
      }
      b.textContent = label;
      b.disabled = true;
      try {
        toast(done(await json<Record<string, unknown>>(path, POST)), 'ok');
      } catch (e) {
        toast((e as Error).message, 'error');
      } finally {
        b.disabled = false;
        void draw();
      }
    };
  };
  act(push, 'git/push', (r) =>
    r.pushed
      ? `Pushed revisions ${(r.revisions as number[]).join('–')} (${String(r.commit).slice(0, 12)})`
      : 'Nothing new to push',
  );
  act(
    pull,
    'git/import',
    (r) =>
      r.changed ? `Imported ${String(r.commit).slice(0, 12)}: ${r.changed} files` : 'The game is already as in Git',
    'Replace the game with Git’s? Click again',
  );
  void draw();
  return el;
}
