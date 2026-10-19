#!/usr/bin/env node
// node scripts/sbom.mjs --pack=<dir> --out=<dir> (4.1.19, plan §6.3): the CycloneDX SBOM of each of the four archives
// the candidate packed, made in the candidate from what the archives hold, never in the release after an install:
//   - web-scumm-bridge, web-scumm-connectors and web-scumm-studio-server (4.2.1): their own lock (npm-shrinkwrap.json,
//     inside the archive; the Studio Server's engine, an optional peer, is the engine's own SBOM), read by
//     `npm sbom --package-lock-only`: nothing resolved;
//   - web-scumm (the engine): its archive carries no lock (a game resolves its own); its dependencies as the root lock
//     resolves them, the way scripts/locks.mjs makes a lock (the root lock copied beside its manifest, `npm install
//     --package-lock-only`, which keeps every version the root lock has), then read the same way;
//   - create-web-scumm: one dependency, the engine of the same version, named by its archive's SHA-256 (the engine's
//     own SBOM lists the rest).
// The image's SBOM is scripts/bridge-image.mjs'. Each file names its archive's SHA-256 in its metadata.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const flag = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const pack = resolve(flag('pack') ?? '');
const out = resolve(flag('out') ?? '');
mkdirSync(out, { recursive: true });
const WIN = process.platform === 'win32';
const npm = (args, cwd) =>
  execFileSync(WIN ? 'npm.cmd' : 'npm', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26, shell: WIN });
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** An archive unpacked into a scratch folder. */
function unpacked(tgz) {
  const dir = mkdtempSync(join(tmpdir(), 'sbom-'));
  execFileSync('tar', ['-xzf', tgz, '-C', dir, '--strip-components=1']);
  return dir;
}

/** The SBOM's own component: the archive, by name, version and SHA-256. */
function named(sbom, name, tgz) {
  sbom.metadata = {
    ...sbom.metadata,
    component: {
      ...(sbom.metadata?.component ?? {}),
      type: 'library',
      name,
      version: root.version,
      purl: `pkg:npm/${name}@${root.version}`,
      hashes: [{ alg: 'SHA-256', content: sha256(tgz) }],
    },
  };
  return sbom;
}

const done = [];
for (const name of [
  'web-scumm-bridge',
  'web-scumm-connectors',
  'web-scumm-studio-server',
  'web-scumm',
  'create-web-scumm',
]) {
  const tgz = join(pack, `${name}-${root.version}.tgz`);
  if (!existsSync(tgz)) throw new Error(`${tgz}: missing`);
  const dir = unpacked(tgz);
  try {
    let sbom;
    if (name === 'create-web-scumm') {
      const engine = join(pack, `web-scumm-${root.version}.tgz`);
      sbom = {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        serialNumber: `urn:uuid:${randomUUID()}`,
        version: 1,
        metadata: { timestamp: new Date().toISOString() },
        components: [
          {
            type: 'library',
            name: 'web-scumm',
            version: root.version,
            purl: `pkg:npm/web-scumm@${root.version}`,
            hashes: [{ alg: 'SHA-256', content: sha256(engine) }],
            description: 'The engine of the same version; its own SBOM lists its dependencies',
          },
        ],
      };
    } else {
      if (!existsSync(join(dir, 'npm-shrinkwrap.json'))) {
        // The engine: its dependencies as the root lock resolves them.
        copyFileSync(join(ROOT, 'package-lock.json'), join(dir, 'package-lock.json'));
        npm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], dir);
        // What an install of this manifest takes only: the root's own folders and what nothing here needs left out.
        const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
        for (const [k, v] of Object.entries(lock.packages))
          if (k && (!k.startsWith('node_modules/') || v.extraneous)) delete lock.packages[k];
        writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock));
      }
      sbom = JSON.parse(npm(['sbom', '--package-lock-only', '--sbom-format', 'cyclonedx', '--omit', 'dev'], dir));
    }
    const file = join(out, `${name}.cdx.json`);
    writeFileSync(file, `${JSON.stringify(named(sbom, name, tgz), null, 2)}\n`);
    done.push(`${name} (${sbom.components?.length ?? 0} components)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`✔  SBOMs in ${out}: ${done.join(', ')}`);
