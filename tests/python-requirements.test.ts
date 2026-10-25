// The image tools' Python requirements (D54, #285): one hashed requirements.txt, which CI, the docs and the Studio
// worker's build hook install with --require-hashes, and which Dependabot bumps with its hashes. Each requirement pins
// one version and carries sha256 hashes. Offline, the test cannot tell whether the wheel of Clever Cloud's runtime
// (CPython 3.13, manylinux x86_64) is among them: the candidate's studio-install-smoke installs it as the hook does.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
/** The requirements, each one logical line (pip's `\` continuations joined), comments and blank lines dropped. */
const requirements = () =>
  readFileSync(join(ROOT, 'requirements.txt'), 'utf8')
    .replace(/\\\r?\n/g, ' ')
    .split('\n')
    .map((l) => l.replace(/(^|\s)#.*$/, '').trim())
    .filter(Boolean);

describe("the image tools' Python requirements", () => {
  it('pins each package to one version, with sha256 hashes and nothing else', () => {
    const reqs = requirements();
    const names = reqs.map((r) => r.split(/\s+/)[0].split('==')[0].toLowerCase());
    expect(names).toEqual(expect.arrayContaining(['pillow', 'numpy', 'scipy']));
    expect(new Set(names).size, 'a package twice').toBe(names.length);
    for (const r of reqs) {
      const [pin, ...opts] = r.split(/\s+/);
      expect(pin, r).toMatch(/^[A-Za-z0-9][\w.-]*==[\w.]+$/);
      expect(opts.length, pin).toBeGreaterThan(0);
      for (const o of opts) expect(o, pin).toMatch(/^--hash=sha256:[0-9a-f]{64}$/);
      expect(new Set(opts).size, `${pin}: a hash twice`).toBe(opts.length);
    }
  });

  it('is the only Python lock: the worker has none of its own', () => {
    expect(existsSync(join(ROOT, 'ops', 'studio', 'worker-requirements.lock'))).toBe(false);
  });
});
