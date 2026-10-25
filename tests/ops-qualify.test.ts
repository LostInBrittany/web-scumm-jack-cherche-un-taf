// The qualification profile's promises that a file can be checked for (4.1.18, ops/qualify/README.md), without Docker:
// every image pinned by digest, Postgres and the Bridges never published, the store and Bridge networks internal, the
// Bridges read-only, unprivileged, their tenants mounted read-only, the secrets as files. The `qualify` workflow
// brings it up and drives it (scripts/ops-qualify.mjs). And `BRIDGE_STORE_FILE`, the store URL read from a file.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { storeSpec } from '../bridge/src/cli-store';

const compose = readFileSync('ops/qualify/compose.yml', 'utf8');
const dockerfile = readFileSync('ops/qualify/Dockerfile.bridge', 'utf8');

describe('the qualification profile', () => {
  it('pins every image by digest, the Bridge built from the tarball', () => {
    const images = [...compose.matchAll(/^\s+image:\s*(\S+)/gm)]
      .map((m) => m[1]!)
      .filter((i) => !i.endsWith(':qualify'));
    expect(images).toHaveLength(2);
    for (const i of [...images, ...[...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1]!)])
      expect(i).toMatch(/@sha256:[0-9a-f]{64}$/);
    expect(dockerfile).toContain('COPY quest-n-click-bridge.tgz');
    expect(dockerfile).not.toMatch(/COPY \.\s|COPY bridge\//);
    // 4.1.19 (plan §6.1): `npm ci` from the image's versioned lock, never an install that resolves ranges.
    expect(dockerfile).toContain('npm ci --omit=dev');
    expect(dockerfile).not.toMatch(/npm install/);
  });

  it('publishes only the proxy, on 127.0.0.1, and keeps the store and the Bridges on internal networks', () => {
    const published = [...compose.matchAll(/^\s+- '([^']*:\d+)'$/gm)]
      .map((m) => m[1]!)
      .filter((p) => p.split(':').length > 2);
    expect(published.length).toBe(4);
    for (const p of published) expect(p.startsWith('127.0.0.1:')).toBe(true);
    expect(compose.slice(compose.indexOf('  postgres:'), compose.indexOf('  bridge-1:'))).not.toContain('ports:');
    expect(compose).toMatch(/edge:\n\s+internal: true/);
    expect(compose).toMatch(/store:\n\s+internal: true/);
  });

  it('trusts the proxy alone, by its fixed address, so the per-address limits see each client', () => {
    const bridge = compose.slice(compose.indexOf('x-bridge:'), compose.indexOf('services:'));
    expect(bridge).toContain("'--trust-proxy=172.30.18.2'");
    expect(compose).toMatch(/edge:\n\s+ipv4_address: 172\.30\.18\.2/);
    expect(compose).toMatch(/subnet: 172\.30\.18\.0\/24/);
  });

  it('runs the Bridges read-only, unprivileged, with their tenants read-only and their secrets as files', () => {
    const bridge = compose.slice(compose.indexOf('x-bridge:'), compose.indexOf('services:'));
    for (const want of [
      'read_only: true',
      'cap_drop: [ALL]',
      'no-new-privileges:true',
      'pids_limit:',
      'mem_limit:',
      '/srv/bridge/a:ro',
      '/srv/bridge/b:ro',
      'BRIDGE_STORE_FILE: /run/secrets/store_url',
    ])
      expect(bridge).toContain(want);
    expect(bridge).not.toMatch(/BRIDGE_STORE:|postgres:\/\//);
    expect(compose).toContain('POSTGRES_PASSWORD_FILE: /run/secrets/pg_password');
    expect(compose).not.toMatch(/POSTGRES_PASSWORD:/);
  });
});

describe('BRIDGE_STORE_FILE', () => {
  it('runs the proxy as the operator, read-only, its writable folders bounded tmpfs (4.1.19)', () => {
    const proxy = compose.slice(compose.indexOf('  proxy:'), compose.indexOf('\nnetworks:'));
    for (const want of [
      "user: '${QUALIFY_UID:-1000}:${QUALIFY_GID:-1000}'",
      'read_only: true',
      '/data:rw,size=16m',
      '/config:rw,size=4m',
      'cap_drop: [ALL]',
      'no-new-privileges:true',
    ])
      expect(proxy, want).toContain(want);
    // The one capability left is the one the binary carries; no volume the proxy writes.
    expect(proxy.match(/cap_add: \[([^\]]*)\]/)?.[1]).toBe('NET_BIND_SERVICE');
    expect(proxy).not.toMatch(/caddy:\/data/);
  });

  it('mounts the worker and its game read-only into the Bridges (4.1.19)', () => {
    const bridge = compose.slice(compose.indexOf('x-bridge:'), compose.indexOf('services:'));
    expect(bridge).toContain('${QUALIFY_APP:?ops:qualify sets QUALIFY_APP}:/srv/app:ro');
    expect(bridge).toContain('${QUALIFY_MODULES:?ops:qualify sets QUALIFY_MODULES}:/srv/app/node_modules:ro');
    // The steps live in scripts/ops-qualify/ since 4.1.20 (PR 3): the entry and its modules, read as one.
    const script = [
      'scripts/ops-qualify.mjs',
      ...readdirSync('scripts/ops-qualify').map((f) => `scripts/ops-qualify/${f}`),
    ]
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(script).toContain('cd /srv/app && exec node node_modules/tsx/dist/cli.mjs tools/speedrun/worker.ts');
    // The committed tree of what the worker reads, never the checkout (its .git, its private folders).
    expect(script).toMatch(/'archive',\s*'--format=tar'/);
    expect(script).not.toMatch(/QUALIFY_APP: ROOT/);
  });

  it('names the store from a file, after --store= and BRIDGE_STORE, before the configuration', () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-file-'));
    try {
      const f = join(dir, 'url');
      writeFileSync(f, 'postgres://bridge:secret@db:5432/bridge\n');
      const file = { journal: 'journal.jsonl', store: 'sqlite' };
      expect(storeSpec(file, [], { BRIDGE_STORE_FILE: f })).toBe('postgres://bridge:secret@db:5432/bridge');
      expect(storeSpec(file, [], { BRIDGE_STORE: 'sqlite:x.sqlite', BRIDGE_STORE_FILE: f })).toBe('sqlite:x.sqlite');
      expect(storeSpec(file, ['--store=jsonl'], { BRIDGE_STORE_FILE: f })).toBe('jsonl');
      // Named and empty, or named and missing: stopped with why, never another store in silence.
      writeFileSync(f, '  \n');
      expect(() => storeSpec(file, [], { BRIDGE_STORE_FILE: f })).toThrow(/BRIDGE_STORE_FILE: .* is empty/);
      expect(() => storeSpec(file, [], { BRIDGE_STORE_FILE: join(dir, 'none') })).toThrow(/does not exist/);
      expect(storeSpec(file, [], {})).toBe('sqlite');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
