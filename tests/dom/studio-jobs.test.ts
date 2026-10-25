// @vitest-environment happy-dom
// A hosted Studio's long jobs in the page (4.2.3 PR 7, src/studio/jobs.ts, assets-io.ts): a 202 is followed to its
// end through the `studio-job` events the live stream passes on, its panel says each state and offers Cancel (POST
// jobs/<id>/cancel), and the answer is the job's result; a cancelled job throws, a failed one throws as its route.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetsApiError, post } from '../../src/studio/assets-io';
import { followJob, type JobInfo, jobText } from '../../src/studio/jobs';

const job = (o: Partial<JobInfo>): JobInfo => ({ id: 'j1', kind: 'cut', by: 'Léa', state: 'queued', ...o });
const tell = (j: JobInfo) => window.dispatchEvent(new CustomEvent('studio-job', { detail: j }));
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('a job followed in the page', () => {
  it('says each state, then resolves when it ends; a later state does not go back', async () => {
    const seen: string[] = [];
    const done = followJob(job({}), (j) => seen.push(jobText(j)));
    const panel = document.querySelector('[data-job="j1"]')!;
    expect(panel.textContent).toMatch(/Cutting the sheet: waiting/);
    tell(job({ state: 'running', step: 'on the worker' }));
    expect(panel.textContent).toMatch(/on the worker/);
    tell(job({ id: 'other', state: 'done' }));
    tell(job({ state: 'done', result: { ok: true } }));
    tell(job({ state: 'running' }));
    expect(await done).toMatchObject({ state: 'done', result: { ok: true } });
    expect(seen).toEqual([
      'Cutting the sheet: waiting for the job before it…',
      'Cutting the sheet: on the worker…',
      'Cutting the sheet: done',
    ]);
  });

  it('cancels from its panel', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      return json(200, job({ state: 'cancelled' }));
    });
    const done = followJob(job({ kind: 'prepare', state: 'running' }));
    document.querySelector<HTMLButtonElement>('[data-job="j1"] button')!.click();
    expect(calls).toEqual(['POST /__studio/api/jobs/j1/cancel']);
    tell(job({ kind: 'prepare', state: 'cancelled' }));
    expect((await done).state).toBe('cancelled');
    expect(document.querySelector('[data-job="j1"]')!.textContent).toMatch(/cancelled, nothing written/);
  });
});

describe('a job that ended', () => {
  it('is not told again by a poll still in flight when the stream said it ended', async () => {
    vi.useFakeTimers();
    try {
      let answer!: (r: Response) => void;
      vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>((ok) => (answer = ok)));
      const seen: string[] = [];
      const done = followJob(job({ kind: 'prepare', state: 'running' }), (j) => seen.push(jobText(j)));
      await vi.advanceTimersByTimeAsync(3_100); // the poll is sent, its answer not yet back
      tell(job({ kind: 'prepare', state: 'done', result: { rev: 3 } }));
      await done;
      answer(json(200, job({ kind: 'prepare', state: 'done', result: { rev: 3 } })));
      await vi.advanceTimersByTimeAsync(10);
      expect(seen).toEqual(['Preparing the assets: starting…', 'Preparing the assets: done']);
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps its last word when a Cancel sent before the end is refused after it (4.3.0)', async () => {
    let refuse!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>((ok) => (refuse = ok)));
    const done = followJob(job({ kind: 'prepare', state: 'running' }));
    document.querySelector<HTMLButtonElement>('[data-job="j1"] button')!.click(); // the cancel is sent
    tell(job({ kind: 'prepare', state: 'done' }));
    await done;
    refuse(json(409, { error: 'the job has ended' }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('[data-job="j1"]')!.textContent).toBe('Preparing the assets: done ');
  });
});

describe('a job the server no longer knows', () => {
  it('ends as failed, saying the server restarted', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(404, { error: 'no job j9' }));
      const done = followJob(job({ id: 'j9', state: 'running' }));
      await vi.advanceTimersByTimeAsync(3_100);
      expect(await done).toMatchObject({
        state: 'failed',
        status: 404,
        error: 'the job is no longer known (the server restarted); see the journal',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('an upload answered with a job', () => {
  it("gives the job's result, or throws as the route would have", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(202, job({ id: 'j2' })));
    const ok = post<{ written: string[] }>('sheet', { sheetId: 'hero' });
    await vi.waitFor(() => expect(document.querySelector('[data-job="j2"]')).not.toBeNull());
    tell(job({ id: 'j2', state: 'done', result: { written: ['r1c1'] } }));
    expect(await ok).toEqual({ written: ['r1c1'] });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(202, job({ id: 'j3' })));
    const failed = post('sheet', {});
    await vi.waitFor(() => expect(document.querySelector('[data-job="j3"]')).not.toBeNull());
    tell(
      job({
        id: 'j3',
        state: 'failed',
        error: 'hero is being edited by Tom',
        status: 423,
        body: { holderName: 'Tom' },
      }),
    );
    await expect(failed).rejects.toMatchObject({ status: 423, body: { holderName: 'Tom' } });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(202, job({ id: 'j4' })));
    const cancelled = post('sheet', {});
    await vi.waitFor(() => expect(document.querySelector('[data-job="j4"]')).not.toBeNull());
    tell(job({ id: 'j4', state: 'cancelled' }));
    await expect(cancelled).rejects.toBeInstanceOf(AssetsApiError);
  });
});
