// A hosted Studio's long jobs, in the page (4.2.3 PR 7, H8): Prepare assets, a sheet's cutting, a cell's keying. The
// server answers 202 with the job; its states come on the live stream (`job` events, which hosted.ts passes on as
// `studio-job` window events) and, should the stream be down, from `GET jobs/<id>` every few seconds. While it runs a
// small panel says where it is, with a Cancel button: a job cancelled before its write leaves nothing.
import { studioFetch } from './api-base';
import { h, toastStack } from './ui';

export interface JobInfo {
  id: string;
  kind: 'prepare' | 'cut' | 'cell';
  by: string;
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  step?: string;
  result?: unknown;
  error?: string;
  status?: number;
  body?: Record<string, unknown>;
}

const GONE = 'the job is no longer known (the server restarted); see the journal';
const ENDED = new Set(['done', 'failed', 'cancelled']);
const LABEL: Record<JobInfo['kind'], string> = {
  prepare: 'Preparing the assets',
  cut: 'Cutting the sheet',
  cell: 'Keying the cell',
};

/** What the panel says of a job's state. */
export function jobText(j: JobInfo): string {
  const what = LABEL[j.kind] ?? 'A job';
  if (j.state === 'queued') return `${what}: waiting for the job before it…`;
  if (j.state === 'running') return `${what}: ${j.step ?? 'starting'}…`;
  if (j.state === 'done') return `${what}: done`;
  if (j.state === 'cancelled') return `${what}: cancelled, nothing written`;
  return `${what}: failed`;
}

/** Asks the server to cancel a job (its author's, or an owner's). */
async function cancelJob(id: string): Promise<void> {
  const r = await studioFetch(`jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) {
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(d.error ?? `${r.status} ${r.statusText}`);
  }
}

/**
 * Follows a job to its end, with its panel (its state and a Cancel button) at the bottom right; `onChange` hears each
 * state. Resolves with the job as it ended.
 */
export function followJob(first: JobInfo, onChange?: (j: JobInfo) => void): Promise<JobInfo> {
  const text = h('span', null, jobText(first));
  const cancel = h('button', { type: 'button', class: 'small' }, 'Cancel');
  const panel = h('div', { class: 'toast info job', 'data-job': first.id }, text, ' ', cancel);
  toastStack().append(panel);
  return new Promise((ok) => {
    let last = first;
    const seen = (j: JobInfo) => {
      if (j.id !== first.id || (ENDED.has(last.state) && !ENDED.has(j.state))) return;
      last = j;
      text.textContent = jobText(j);
      onChange?.(j);
      if (!ENDED.has(j.state)) return;
      cancel.remove();
      window.removeEventListener('studio-job', onEvent);
      clearInterval(poll);
      setTimeout(() => panel.remove(), 1500);
      ok(j);
    };
    const onEvent = (e: Event) => seen((e as CustomEvent<JobInfo>).detail);
    window.addEventListener('studio-job', onEvent);
    // The stream may be down (a reconnection): the job is read again now and then.
    const poll = setInterval(() => {
      void studioFetch(`jobs/${encodeURIComponent(first.id)}`)
        .then((r): Promise<JobInfo> | JobInfo | null =>
          r.ok
            ? (r.json() as Promise<JobInfo>)
            : // The server no longer knows it (jobs live in its memory): it restarted. What it wrote, if anything, is
              // in the journal.
              r.status === 404
              ? { ...last, state: 'failed', status: 404, error: GONE }
              : null,
        )
        .then((j) => j && seen(j))
        .catch(() => undefined);
    }, 3000);
    cancel.onclick = () => {
      cancel.disabled = true;
      cancelJob(first.id).catch((e) => {
        cancel.disabled = false;
        text.textContent = `${jobText(last)} (${(e as Error).message})`;
      });
    };
    seen(first);
  });
}
