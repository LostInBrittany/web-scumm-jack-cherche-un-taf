// A job's lifetime as the worker reads it (4.2.3, found by the reference deployment: the Studio signs `exp` at exactly
// `now + MAX_JOB_MS`, and a Studio whose clock ran a few milliseconds ahead of the worker's had half its jobs refused).
// The worker tolerates CLOCK_SKEW_MS of skew, never more; an expired job is refused as before.
import { describe, expect, it } from 'vitest';
import {
  CLOCK_SKEW_MS,
  type Job,
  MAX_JOB_MS,
  newJobKeys,
  privateKeyOf,
  publicKeyOf,
  signJob,
  verifyJob,
} from '../studio-server/src/worker/job';

const keys = newJobKeys();
const job = (exp: number): Job => ({
  id: 'j1',
  instance: 'demo',
  epoch: 'e1',
  rev: 1,
  kind: 'validate',
  params: {},
  snapshot: 'x'.repeat(64),
  dest: 'staging/j1/',
  exp,
  urls: { snapshot: 'https://s3/snap', result: 'https://s3/result' },
});
const check = (exp: number, now: number) =>
  verifyJob(signJob(job(exp), privateKeyOf(keys.privatePem)), publicKeyOf(keys.publicPem), now);

describe("a job's lifetime on the worker's clock", () => {
  const now = 1_800_000_000_000;

  it('accepts a job signed by a Studio whose clock runs ahead, within the skew', () => {
    expect(check(now + MAX_JOB_MS, now).id).toBe('j1');
    expect(check(now + MAX_JOB_MS + 5, now).id).toBe('j1');
    expect(check(now + MAX_JOB_MS + CLOCK_SKEW_MS, now).id).toBe('j1');
  });

  it('refuses one that would live longer than a job plus the skew', () => {
    expect(() => check(now + MAX_JOB_MS + CLOCK_SKEW_MS + 1, now)).toThrow(/lives longer than a job may/);
  });

  it('refuses an expired job, to the millisecond', () => {
    expect(() => check(now, now)).toThrow(/has expired/);
    expect(() => check(now - 1, now)).toThrow(/has expired/);
    expect(check(now + 1, now).id).toBe('j1');
  });

  it('is a small skew beside the job: 10% of its lifetime at most', () => {
    expect(CLOCK_SKEW_MS).toBeLessThanOrEqual(MAX_JOB_MS / 10);
  });
});
