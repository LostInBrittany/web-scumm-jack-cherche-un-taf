// Assets tab, IO (4.1.8, programme §4.7: the Studio's biggest owners split into model / IO / view): what leaves the
// page. The uploads' POSTs to the API's assets/* (the dev server's tools/studio/assets.ts; a hosted Studio's
// hosted-assets.ts since 4.2.3, where a cut is a job followed to its end; the listing itself goes through
// `api.assets()`), a picked file read as a data URL, the system file picker, the clipboard.
import { h, toast } from './ui';
import { studioFetch } from './api-base';
import { followJob, type JobInfo } from './jobs';

export class AssetsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

/**
 * POST assets/<path>. A hosted Studio answers a cut or Prepare with a job (202): it is followed to its end (its panel
 * has a Cancel button), and its result is the answer; a job that failed throws as the route would have, a job
 * cancelled throws `cancelled` (status 0).
 */
export async function post<T>(path: string, body: unknown, onJob?: (j: JobInfo) => void): Promise<T> {
  const r = await studioFetch(`assets/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({ error: `${r.status} ${r.statusText}` }));
  if (!r.ok) throw new AssetsApiError(data.error ?? `${r.status}`, r.status, data);
  if (r.status !== 202) return data as T;
  const j = await followJob(data as JobInfo, onJob);
  if (j.state === 'done') return j.result as T;
  if (j.state === 'cancelled') throw new AssetsApiError('cancelled: nothing was written', 0, {});
  throw new AssetsApiError(j.error ?? 'the job failed', j.status ?? 500, { ...(j.body ?? {}), error: j.error });
}

/** A picked file as base64 (a data URL). */
export function readFile(f: File): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(r.error ?? new Error('cannot read the file'));
    r.readAsDataURL(f);
  });
}

/** Opens the system file picker; resolves with the chosen file (never resolves if cancelled). */
export function pickFile(accept: string): Promise<File> {
  return new Promise((ok) => {
    const input = h('input', { type: 'file', accept, hidden: true });
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.remove();
      if (f) ok(f);
    });
    document.body.append(input);
    input.click();
  });
}

/** Copies `text` to the clipboard (the textarea fallback when the API refuses), then says so in a toast. */
export async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  toast(`${what} copied`, 'ok', 1600);
}
