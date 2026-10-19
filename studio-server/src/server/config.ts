// The Studio Server's configuration (4.2.1, plan §4 and ADR 0027): a JSON file for what is not secret, and the
// secrets each from a file (`<NAME>_FILE`, mode 0600, preferred) or from the environment (Clever Cloud injects add-on
// credentials as variables). A secret read from the environment is then removed from `process.env`, so no child
// process ever inherits it; no secret is ever logged; a value that is not text, or too short, is refused at start.
import { BRANCH, type GitConfig } from './git';
import { readFileSync, statSync } from 'node:fs';

interface StoreConfig {
  kind: 'sqlite' | 'postgres';
  /** sqlite: the database file. */
  file?: string;
}

interface BlobsConfig {
  kind: 'fs' | 's3';
  /** fs: the folder. */
  dir?: string;
  /** s3 (Cellar): the endpoint host and the bucket; the keys are secrets. */
  host?: string;
  bucket?: string;
}

export interface StudioServerConfig {
  /** The Studio's public origin (`https://studio.example.fr`): the only `Origin` a cookie mutation may carry. */
  publicUrl: string;
  /** The game's origin (plan §6.1): previews and builds are served there, never on `publicUrl`. */
  playUrl: string;
  /** The game this instance serves (one game per instance, D41-3). */
  game: string;
  /** Where the instance keeps its working files (the materialised game, scratch): ephemeral on Clever Cloud. */
  workDir: string;
  port: number;
  host: string;
  /** Proxies whose `X-Forwarded-For` / `X-Forwarded-Proto` are believed: addresses or IPv4 networks. */
  trustProxy: string[];
  store: StoreConfig;
  blobs: BlobsConfig;
  /** OpenID Connect (plan §3.1): without it the server is the local one, on the loopback only. */
  oidc?: {
    issuer: string;
    clientId: string;
    audience: string;
    cliClientId?: string;
    scopes?: string;
    maxTokenSeconds?: number;
    /** A local provider over http (tests); never in production. */
    allowInsecure?: boolean;
  };
  sessions?: { idleHours?: number; absoluteHours?: number };
  /**
   * The processing worker (ADR 0028), required with OIDC: the game's code then never runs in this process. `instance`
   * names this Studio to the worker, which runs no other's jobs. The signing key is the secret STUDIO_WORKER_KEY.
   */
  worker?: { url: string; instance: string };
  /** The built Studio (`npm run studio-client`); default `.cache/studio-client` beside the engine. */
  clientDir?: string;
  /** The game's prepared assets (`public/`, with `assets/img`…), read only in 4.2.1; default the engine's `public/`. */
  publicDir?: string;
  /**
   * The published builds (`/play/`) served without a game session (4.2.2, D42: the owner's choice per instance, off by
   * default). Everything else of the game's origin stays behind the session.
   */
  publicBuilds?: boolean;
  /**
   * The game's Git repository (4.2.3, H5, D44: one per instance): owners push the revisions there and import from it.
   * Its deploy key is the secret STUDIO_GIT_KEY (none for a public https or a local remote).
   */
  git?: GitConfig;
}

/** The secrets, by name; each from `<NAME>_FILE` or `<NAME>` in the environment. */
const SECRET_NAMES = [
  'STUDIO_DATABASE_URL',
  'STUDIO_S3_KEY_ID',
  'STUDIO_S3_KEY_SECRET',
  'STUDIO_OIDC_CLIENT_SECRET',
  'STUDIO_SESSION_KEY',
  'STUDIO_WORKER_KEY',
  // The metrics' token (4.2.3, H9): `GET /metrics` is served only with it.
  'STUDIO_METRICS_TOKEN',
  'STUDIO_GIT_KEY',
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

/** Where a secret may also be read from on Clever Cloud: the add-on's own variable names. */
const ALIASES: Partial<Record<SecretName, string[]>> = {
  STUDIO_DATABASE_URL: ['POSTGRESQL_ADDON_URI'],
  STUDIO_S3_KEY_ID: ['CELLAR_ADDON_KEY_ID'],
  STUDIO_S3_KEY_SECRET: ['CELLAR_ADDON_KEY_SECRET'],
};

export class ConfigError extends Error {}

/**
 * A command's arguments without `--config <file>` (4.2.3: without the flag, the first argument was dropped, so `import
 * <dir>`, `invite` and the daily `backup --to-bucket` failed when the configuration came from STUDIO_CONFIG_JSON).
 */
export function withoutConfig(rest: string[]): string[] {
  const at = rest.indexOf('--config');
  return at < 0 ? rest : rest.filter((_, i) => i !== at && i !== at + 1);
}

/**
 * Reads the secrets once, then removes every variable that held one from `env` (by default `process.env`). Returns
 * the values found; a missing one is absent (the server says which it needs when it needs it).
 */
export function takeSecrets(env: NodeJS.ProcessEnv = process.env): Partial<Record<SecretName, string>> {
  const out: Partial<Record<SecretName, string>> = {};
  for (const name of SECRET_NAMES) {
    const fileVar = env[`${name}_FILE`];
    let value: string | undefined;
    let from = '';
    if (fileVar) {
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(fileVar);
      } catch {
        throw new ConfigError(`${name}_FILE (${fileVar}) does not exist`);
      }
      // Windows has no such mode bits (every file reads 0o666): the check is POSIX only.
      if (process.platform !== 'win32' && (st.mode & 0o077) !== 0)
        throw new ConfigError(`${name}_FILE (${fileVar}) is readable by others: chmod 600`);
      value = readFileSync(fileVar, 'utf8').trim();
      from = `${name}_FILE`;
    } else {
      for (const v of [name, ...(ALIASES[name] ?? [])])
        if (env[v] !== undefined) {
          value = env[v]?.trim();
          from = v;
          break;
        }
    }
    for (const v of [name, `${name}_FILE`, ...(ALIASES[name] ?? [])]) delete env[v];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length < 8)
      throw new ConfigError(`${from}: the secret is empty or too short (8 characters at least)`);
    out[name] = value;
  }
  return out;
}

const isUrl = (u: unknown) => {
  try {
    return typeof u === 'string' && ['https:', 'http:'].includes(new URL(u).protocol);
  } catch {
    return false;
  }
};

/**
 * The configuration, checked: anything unknown or missing is refused with its name. From a file, or (`text`) from the
 * variable `STUDIO_CONFIG_JSON`, where a platform such as Clever Cloud gives no file; it holds no secret.
 */
export function loadConfig(file: string, text?: string): StudioServerConfig {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text ?? readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch (e) {
    throw new ConfigError(`${file}: ${(e as Error).message}`);
  }
  const known = new Set([
    'publicUrl',
    'playUrl',
    'game',
    'workDir',
    'port',
    'host',
    'trustProxy',
    'store',
    'blobs',
    'oidc',
    'sessions',
    'worker',
    'clientDir',
    'publicDir',
    'publicBuilds',
    'git',
  ]);
  for (const k of Object.keys(raw)) if (!known.has(k)) throw new ConfigError(`${file}: unknown key "${k}"`);
  if (!isUrl(raw.publicUrl)) throw new ConfigError(`${file}: publicUrl must be an http(s) URL`);
  if (!isUrl(raw.playUrl)) throw new ConfigError(`${file}: playUrl must be an http(s) URL`);
  const origin = (u: unknown) => new URL(String(u)).origin;
  if (origin(raw.publicUrl) === origin(raw.playUrl))
    throw new ConfigError(`${file}: playUrl must be another origin than publicUrl (plan §6.1)`);
  if (typeof raw.game !== 'string' || !/^[a-z0-9][\w-]*$/i.test(raw.game))
    throw new ConfigError(`${file}: game must be a game id`);
  if (typeof raw.workDir !== 'string' || !raw.workDir) throw new ConfigError(`${file}: workDir is required`);
  const store = raw.store as StoreConfig | undefined;
  if (!store || !['sqlite', 'postgres'].includes(store.kind))
    throw new ConfigError(`${file}: store.kind is sqlite or postgres`);
  if (store.kind === 'sqlite' && typeof store.file !== 'string')
    throw new ConfigError(`${file}: store.file is required`);
  const blobs = raw.blobs as BlobsConfig | undefined;
  if (!blobs || !['fs', 's3'].includes(blobs.kind)) throw new ConfigError(`${file}: blobs.kind is fs or s3`);
  if (blobs.kind === 'fs' && typeof blobs.dir !== 'string') throw new ConfigError(`${file}: blobs.dir is required`);
  if (blobs.kind === 's3' && (typeof blobs.host !== 'string' || typeof blobs.bucket !== 'string'))
    throw new ConfigError(`${file}: blobs.host and blobs.bucket are required`);
  if (raw.publicBuilds !== undefined && typeof raw.publicBuilds !== 'boolean')
    throw new ConfigError(`${file}: publicBuilds is true or false`);
  const git = raw.git as GitConfig | undefined;
  if (git !== undefined) {
    if (!git || typeof git.remote !== 'string' || !git.remote || /\s/.test(git.remote))
      throw new ConfigError(`${file}: git.remote is the repository's URL`);
    if (/^https?:\/\/[^/]*@/.test(git.remote))
      throw new ConfigError(`${file}: git.remote carries no credentials (the deploy key is STUDIO_GIT_KEY)`);
    if (git.branch !== undefined && (typeof git.branch !== 'string' || !BRANCH.test(git.branch)))
      throw new ConfigError(`${file}: git.branch is a branch name`);
    if (
      git.path !== undefined &&
      (typeof git.path !== 'string' ||
        /[:*?[\]\\]/.test(git.path) ||
        git.path
          .replace(/^\/+|\/+$/g, '')
          .split('/')
          .some((s) => s === '..' || s === '.' || (s === '' && git.path !== '')))
    )
      throw new ConfigError(`${file}: git.path is a folder of the repository`);
    if (git.remote.startsWith('-')) throw new ConfigError(`${file}: git.remote is the repository's URL`);
    if (git.knownHosts !== undefined && (typeof git.knownHosts !== 'string' || !git.knownHosts.trim()))
      throw new ConfigError(`${file}: git.knownHosts is the remote host's known_hosts lines`);
    const by = git.committer;
    if (
      by !== undefined &&
      (!by || typeof by.name !== 'string' || typeof by.email !== 'string' || !by.email.includes('@'))
    )
      throw new ConfigError(`${file}: git.committer is { name, email }`);
  }
  const trust = raw.trustProxy ?? [];
  if (!Array.isArray(trust) || !trust.every((t) => typeof t === 'string'))
    throw new ConfigError(`${file}: trustProxy is a list of addresses or networks`);
  const worker = raw.worker as StudioServerConfig['worker'];
  if (worker !== undefined) {
    if (!worker || !isUrl(worker.url) || typeof worker.instance !== 'string' || !/^[\w-]{3,64}$/.test(worker.instance))
      throw new ConfigError(
        `${file}: worker.url and worker.instance are required with oidc (ADR 0028), and well formed`,
      );
    if (blobs.kind !== 's3')
      throw new ConfigError(`${file}: the worker reads its snapshots from S3: blobs.kind is s3 with a worker`);
  }
  for (const k of ['clientDir', 'publicDir'] as const)
    if (raw[k] !== undefined && (typeof raw[k] !== 'string' || !raw[k]))
      throw new ConfigError(`${file}: ${k} is a folder`);
  const oidc = raw.oidc as StudioServerConfig['oidc'];
  const host = String(raw.host ?? '0.0.0.0');
  if (oidc !== undefined) {
    // Behind a proxy every client shares its address: without trustProxy, the limits would treat a team as one.
    if (!/^(127\.|::1$|localhost$)/.test(host) && trust.length === 0)
      throw new ConfigError(`${file}: trustProxy is required when the server is reachable beyond the loopback`);
    if (!isUrl(oidc.issuer)) throw new ConfigError(`${file}: oidc.issuer must be an http(s) URL`);
    if (typeof oidc.clientId !== 'string' || !oidc.clientId)
      throw new ConfigError(`${file}: oidc.clientId is required`);
    if (typeof oidc.audience !== 'string' || !oidc.audience)
      throw new ConfigError(`${file}: oidc.audience is required`);
    if (!worker) throw new ConfigError(`${file}: worker.url and worker.instance are required with oidc (ADR 0028)`);
    if (oidc.audience === oidc.clientId)
      throw new ConfigError(`${file}: oidc.audience must differ from oidc.clientId (an id_token is no access token)`);
  }
  return {
    oidc,
    sessions: raw.sessions as StudioServerConfig['sessions'],
    worker,
    publicUrl: origin(raw.publicUrl),
    playUrl: origin(raw.playUrl),
    game: raw.game,
    workDir: raw.workDir,
    port: Number(raw.port ?? process.env.PORT ?? 8080),
    host,
    trustProxy: trust as string[],
    store,
    blobs,
    clientDir: raw.clientDir as string | undefined,
    publicDir: raw.publicDir as string | undefined,
    publicBuilds: raw.publicBuilds === true,
    ...(git ? { git } : {}),
  };
}
