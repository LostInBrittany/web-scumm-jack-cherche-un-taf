// The Bridge image's identity, schema 2 (4.1.20 PR 3, plan §8.2): beside its three digests, the OS and architecture it
// runs on, the Docker engine and the buildx that built it, the archive's compression and size. Built from what `docker`
// answers (a stand-in here, so no engine is needed) and the saved archive itself.
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import { ARCHIVE, identityFor, TAG } from '../scripts/bridge-image.mjs';

const ANSWERS: Record<string, string> = {
  '{{.Id}}': 'sha256:config\n',
  '{{.Os}}': 'linux\n',
  '{{.Architecture}}': 'amd64\n',
};

describe('the image identity', () => {
  it('names its digests, platform, builder, compression and size', () => {
    const dir = mkdtempSync(join(tmpdir(), 'image-id-'));
    const archive = join(dir, 'image.tar');
    const tgz = join(dir, 'bridge.tgz');
    writeFileSync(archive, 'an image archive');
    writeFileSync(tgz, 'a bridge archive');
    const asked: string[][] = [];
    const run = (args: string[]) => {
      asked.push(args);
      if (args[0] === 'image') return ANSWERS[args[3]!]!;
      if (args[0] === 'buildx') return 'github.com/docker/buildx v0.29.1 a1b2c3d\n';
      return '28.5.1\n';
    };
    const id = identityFor({ run, archive, tgz, version: '4.1.20', base: 'node@sha256:x', digest: () => 'sha256:oci' });
    const sum = (s: string) => createHash('sha256').update(s).digest('hex');
    expect(id).toEqual({
      format: 'web-scumm-bridge-image',
      schema: 2,
      version: '4.1.20',
      tag: TAG,
      base: 'node@sha256:x',
      configDigest: 'sha256:config',
      manifestDigest: 'sha256:oci',
      os: 'linux',
      architecture: 'amd64',
      archive: ARCHIVE,
      archiveSha256: sum('an image archive'),
      compression: 'none',
      archiveBytes: 16,
      bridgeSha256: sum('a bridge archive'),
      docker: '28.5.1',
      buildx: 'v0.29.1',
    });
    for (const a of asked.filter((x) => x[0] === 'image')) expect(a.at(-1)).toBe(TAG);
    // A host without buildx still builds: the field is null.
    const none = (args: string[]) => {
      if (args[0] === 'buildx') throw new Error('docker: unknown command buildx');
      return run(args);
    };
    expect(identityFor({ run: none, archive, tgz, version: '4.1.20', base: 'b', digest: () => 'd' }).buildx).toBeNull();
  });
});
