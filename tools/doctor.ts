// npm run doctor [-- --release] — actionable prerequisites report. It never installs anything. The checks live in
// doctor-checks.ts; `--release` requires what `release-check` runs (Python and its modules, ffmpeg; no browser).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { collectChecks, doctorReport, playwrightBrowsers, type Check } from './doctor-checks';

const release = process.argv.includes('--release');
const checks = collectChecks(
  {
    command: (cmd, args) => {
      const r = spawnSync(cmd, args, { encoding: 'utf8' });
      return { ok: r.status === 0, stdout: r.stdout ?? '' };
    },
    exists: existsSync,
    nodeVersion: process.versions.node,
    // Imported only here: a created project runs the doctor without the playwright package (4.5.0).
    browsers: await playwrightBrowsers(() => import('playwright')),
  },
  { release },
);
// Reality Bridge (4.1.1): Ed25519 in this Node's WebCrypto (the signed signals) and Biscuit's WebAssembly (the Bridge).
async function realityCheck(): Promise<Check> {
  try {
    await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  } catch {
    return {
      name: 'Reality Bridge',
      ok: false,
      detail: 'no Ed25519 in WebCrypto',
      fix: 'Install Node.js 22 or newer.',
    };
  }
  try {
    const { biscuitLib } = await import('../bridge/src/biscuit');
    const b = await biscuitLib();
    new b.KeyPair(b.SignatureAlgorithm.Ed25519);
    return { name: 'Reality Bridge', ok: true, detail: 'Ed25519 in WebCrypto, Biscuit (WebAssembly) loads' };
  } catch {
    // The Bridge is optional: a game that does not run one never needs Biscuit.
    return {
      name: 'Reality Bridge',
      ok: true,
      detail: 'Ed25519 in WebCrypto; Biscuit not installed (only a Bridge needs it)',
    };
  }
}
checks.push(await realityCheck());
const { text, failed } = doctorReport(checks);
(failed ? console.error : console.log)(
  release ? `${text}\n(release mode: every prerequisite of npm run release-check is required)` : text,
);
process.exit(failed ? 1 : 0);
