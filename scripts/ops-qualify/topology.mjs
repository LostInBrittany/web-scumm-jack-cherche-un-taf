// The topology (4.1.20 PR 3, plan §8.0, split from scripts/ops-qualify.mjs): the worker's tree, the Compose
// environment, the images pulled, the three Bridges and Postgres brought up behind the proxy, and how a step speaks to
// them (HTTPS through the proxy's own CA, a connector's retries, SQL in the store).
import { request } from 'node:https';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sleep } from './steps.mjs';

export function topology(c) {
  const { ROOT, PROFILE, base, PORT, sh, build, data, secrets, imageFrom } = c;
  /** The worker's tree: `git archive` of the paths it reads, unpacked beside this run. */
  function appTree() {
    const dir = join(base, 'app');
    mkdirSync(dir);
    const tar = join(base, 'app.tar');
    sh(
      'git',
      [
        'archive',
        '--format=tar',
        `--output=${tar}`,
        'HEAD',
        'src',
        'tools',
        // The games the reference imports from (its art and audio come from the sample game's).
        'games',
        'package.json',
        'tsconfig.json',
      ],
      { cwd: ROOT },
    );
    sh('tar', ['-xf', tar, '-C', dir]);
    // The mount point of the modules: the tree is mounted read-only, so the folder must exist in it already.
    mkdirSync(join(dir, 'node_modules'));
    return dir;
  }
  const env = {
    ...process.env,
    // The project's name is compose.yml's (`quest-n-click-qualify`): the network the one-off containers join is named by it.
    COMPOSE_PROJECT_NAME: 'quest-n-click-qualify',
    QUALIFY_BUILD: build,
    QUALIFY_DATA: data,
    // The worker's code and the game it verifies (second reading of 4.1.19 PR 5): the committed tree of what it needs,
    // never the checkout itself (no .git, no private/ folder, no .env), and the installed modules beside it.
    QUALIFY_APP: appTree(),
    QUALIFY_MODULES: join(ROOT, 'node_modules'),
    QUALIFY_SECRETS: secrets,
    QUALIFY_UID: String(process.getuid?.() ?? 1000),
    QUALIFY_GID: String(process.getgid?.() ?? 1000),
    QUALIFY_PORT: String(PORT),
    QUALIFY_PORT_1: String(PORT + 1),
    QUALIFY_PORT_2: String(PORT + 2),
    QUALIFY_PORT_3: String(PORT + 3),
  };
  const dc = (a, o = {}) => sh('docker', ['compose', '-f', join(PROFILE, 'compose.yml'), ...a], { env, ...o });
  /** The images pulled first, again on a registry's rate limit (a shared runner's address meets it): five tries. */
  function pull() {
    for (let i = 1; ; i++) {
      const r = dc(['pull', '--ignore-buildable', '--quiet'], { allowFail: true });
      if (r.status === 0) return;
      if (i >= 5) throw new Error(`the images could not be pulled: ${r.stderr.slice(0, 300)}`);
      sh('sleep', [String(15 * i)]);
    }
  }
  const up = () => (
    pull(),
    dc(['up', '-d', imageFrom ? '--no-build' : '--build', '--wait', '--wait-timeout', '180'], { stdio: 'inherit' })
  );

  let ca = '';
  const https = (port, method, path, { tenant, bearer, body, deleteToken } = {}) =>
    new Promise((ok, ko) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const req = request(
        {
          host: '127.0.0.1',
          servername: 'localhost',
          port,
          method,
          path,
          ca,
          headers: {
            ...(tenant ? { 'x-web-scumm-tenant': tenant } : {}),
            ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
            ...(deleteToken ? { 'x-delete-token': deleteToken } : {}),
            ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
            host: `localhost:${port}`,
          },
          timeout: 10_000,
        },
        (res) => {
          let s = '';
          res.on('data', (c) => (s += c));
          res.on('end', () => {
            let json = null;
            try {
              json = JSON.parse(s);
            } catch {
              /* not JSON */
            }
            ok({ status: res.statusCode, json });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', ko);
      if (data) req.write(data);
      req.end();
    });
  /** What a connector does: the same proposal again until the Bridge answers it (502/503/network), at most 30 times. */
  async function insist(port, method, path, o) {
    for (let i = 0; ; i++) {
      try {
        const r = await https(port, method, path, o);
        if (r.status < 500 || i >= 30) return r;
      } catch (e) {
        if (i >= 30) throw e;
      }
      await sleep(300);
    }
  }
  async function readyCa() {
    for (let i = 0; i < 60; i++) {
      const r = dc(['exec', '-T', 'proxy', 'cat', '/data/caddy/pki/authorities/local/root.crt'], { allowFail: true });
      if (r.status === 0 && r.stdout.includes('BEGIN CERTIFICATE')) {
        ca = r.stdout;
        try {
          if ((await https(PORT, 'GET', '/readyz')).status === 200) return;
        } catch {
          /* the proxy's certificate not issued yet */
        }
      }
      await sleep(1000);
    }
    throw new Error('the proxy never answered /readyz over HTTPS');
  }
  /** Every signal of a player, by their capability: the signed signals and their sequences, in order. */
  const signalsOf = async (tenant, cap) =>
    (await insist(PORT, 'GET', '/v1/signals', { tenant, bearer: cap })).json ?? null;
  const sql = (q, db = 'bridge') =>
    dc(['exec', '-T', 'postgres', 'psql', '-U', 'bridge', '-d', db, '-tAc', q], { allowFail: true }).stdout.trim();
  return {
    env,
    dc,
    up,
    https,
    insist,
    readyCa,
    signalsOf,
    sql,
    /** The proxy's CA, as `readyCa` read it last. */
    get ca() {
      return ca;
    },
  };
}
