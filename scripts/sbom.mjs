#!/usr/bin/env node
// node scripts/sbom.mjs --pack=<dir> --out=<dir> (4.1.19, plan §6.3): the CycloneDX SBOM of each of the archives the
// candidate packed, made in the candidate from what the archives hold, never in the release after an install:
//   - quest-n-click-bridge, quest-n-click-connectors and quest-n-click-studio-server (4.2.1): their own lock
//     (npm-shrinkwrap.json, inside the archive; the Studio Server's engine, an optional peer, is the engine's own SBOM),
//     read by `npm sbom --package-lock-only`: nothing resolved;
//   - quest-n-click (the engine): its archive carries no lock (a game resolves its own); its dependencies as the root
//     lock resolves them, the way scripts/locks.mjs makes a lock (the root lock copied beside its manifest, `npm install
//     --package-lock-only`, which keeps every version the root lock has), then read the same way;
//   - create-quest-n-click: one dependency, the engine of the same version, named by its archive's SHA-256 (the
//     engine's own SBOM lists the rest).
// Through 4.2.x (D47) each package's alias under its former name (web-scumm, create-web-scumm, …) had its own SBOM
// too; 4.3.0 packs no alias (tools/release/artifacts.mjs keeps them for the releases that had them). The image's SBOM
// is scripts/bridge-image.mjs'. Each file names its archive's SHA-256 in its metadata.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PACKAGES } from '../tools/release/artifacts.mjs';

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
// The locked packages first, the engines, then their creators (each names its engine's archive).
const order = (n) => (n.startsWith('create-') ? 2 : /-(bridge|connectors|studio-server)$/.test(n) ? 0 : 1);
const names = PACKAGES.map((p) => p.name).sort((a, b) => order(a) - order(b));
for (const name of names) {
  const tgz = join(pack, `${name}-${root.version}.tgz`);
  if (!existsSync(tgz)) throw new Error(`${tgz}: missing`);
  const dir = unpacked(tgz);
  try {
    let sbom;
    if (name.startsWith('create-')) {
      const engineName = name.slice('create-'.length);
      const engine = join(pack, `${engineName}-${root.version}.tgz`);
      sbom = {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        serialNumber: `urn:uuid:${randomUUID()}`,
        version: 1,
        metadata: { timestamp: new Date().toISOString() },
        components: [
          {
            type: 'library',
            name: engineName,
            version: root.version,
            purl: `pkg:npm/${engineName}@${root.version}`,
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
