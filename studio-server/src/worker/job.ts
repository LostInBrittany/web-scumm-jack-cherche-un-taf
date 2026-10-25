// A job for the processing worker (4.2.1, plan §3.8, ADR 0028), signed by the Studio with Ed25519. The worker holds
// the public key only: it can check a job, never make one. The signature binds, together, the job's id (single
// use), the instance, the epoch and revision, the snapshot's sha256, the kind and its parameters, the destination
// (a staging prefix of its own) and the expiry (5 min at most).
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';

export interface Job {
  id: string;
  instance: string;
  epoch: string;
  rev: number;
  /**
   * `validate`: the validator's verdict; `load`: the game module as data (functions dropped), for the Studio's reads;
   * `preview` (4.2.2): the revision's built preview, its files by path; `lint`, `solve`, `playtests` (4.2.2): those
   * diagnostics, as the Studio's routes answer them; `prepare` (4.2.2): the game's prepared assets and manifest;
   * `cut` (4.2.3): a sheet cut, or a cell keyed, from an uploaded image (no game code runs).
   * `migrate` (4.2.3): the files the engine's upgrade of the game would change, written nowhere.
   */
  kind: JobKind;
  params: Record<string, unknown>;
  /** sha256 of the snapshot the worker must find at the URL it is given. */
  snapshot: string;
  /** The only prefix the job's result may be written under: `staging/<id>/`. */
  dest: string;
  /** ms since the epoch. */
  exp: number;
  /** Presigned URLs: read the snapshot, write the result. Signed with the rest, so a job cannot be pointed elsewhere. */
  urls: { snapshot: string; result: string };
}

export type JobKind = 'validate' | 'load' | 'preview' | 'lint' | 'solve' | 'playtests' | 'prepare' | 'cut' | 'migrate';
const KINDS: readonly string[] = [
  'validate',
  'load',
  'preview',
  'lint',
  'solve',
  'playtests',
  'prepare',
  'cut',
  'migrate',
];

export const MAX_JOB_MS = 5 * 60_000;
/**
 * How far the Studio's clock may run ahead of the worker's (4.2.3, the reference deployment: a few milliseconds of
 * skew between two machines refused half the jobs, signed at exactly `now + MAX_JOB_MS`). A job still lives
 * `MAX_JOB_MS + CLOCK_SKEW_MS` at most by the worker's clock.
 */
export const CLOCK_SKEW_MS = 30_000;

export function signJob(job: Job, privateKey: KeyObject): string {
  const body = Buffer.from(JSON.stringify(job)).toString('base64url');
  return `${body}.${sign(null, Buffer.from(body), privateKey).toString('base64url')}`;
}

/** The job a token carries, checked: signature, expiry, a destination that is its own. Throws otherwise. */
export function verifyJob(token: string, publicKey: KeyObject, now = Date.now()): Job {
  const [body, sig] = token.split('.');
  if (!body || !sig || !verify(null, Buffer.from(body), publicKey, Buffer.from(sig, 'base64url')))
    throw new Error('the job is not signed by the Studio');
  const job = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Job;
  if (!(job.exp > now)) throw new Error('the job has expired');
  if (job.exp - now > MAX_JOB_MS + CLOCK_SKEW_MS) throw new Error('the job lives longer than a job may');
  if (job.dest !== `staging/${job.id}/`) throw new Error('the job writes outside its own staging prefix');
  if (!KINDS.includes(job.kind)) throw new Error(`unknown job kind: ${String(job.kind)}`);
  return job;
}

/** A key pair for tests and for `studio-server worker-keys` (PEM, PKCS#8 / SPKI). */
export function newJobKeys(): { privatePem: string; publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
export const privateKeyOf = (pem: string) => createPrivateKey(pem);
export const publicKeyOf = (pem: string) => createPublicKey(pem);
