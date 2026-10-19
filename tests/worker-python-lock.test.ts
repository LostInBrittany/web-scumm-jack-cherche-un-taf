// The processing worker's Python lock (4.2.2 PR 6): the very versions of requirements.txt, each with one sha256, and
// nothing else: the worker's build hook installs it with every hash checked.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const lines = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

describe("the worker's Python lock", () => {
  it('pins the versions of requirements.txt, each with a sha256', () => {
    const wanted = lines('requirements.txt').sort();
    const lock = lines('ops/studio/worker-requirements.lock');
    expect(lock.map((l) => l.split(' ')[0]).sort()).toEqual(wanted);
    for (const l of lock) expect(l, l).toMatch(/^[\w.-]+==[\w.]+ --hash=sha256:[0-9a-f]{64}$/);
  });
});
