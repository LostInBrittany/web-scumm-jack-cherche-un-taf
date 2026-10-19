// The one manifest of a release's files (4.1.20 PR 3, plan §8.4, tools/release/artifacts.mjs): it gives back the
// 4.1.19 release file for file, each candidate artifact is uploaded by the one job it names and by no other, and
// release.yml makes nothing the candidate made (no pack, no image, no SBOM) and checks its folder against it before
// it uploads. A file forgotten or made twice fails here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import { ARTIFACTS, candidateFiles, checkRelease, releaseFiles } from '../tools/release/artifacts.mjs';

interface Artifact {
  id: string;
  candidate: string | null;
  artifact?: string;
  job: string;
  published: string;
  sbom?: string;
}
const ALL = ARTIFACTS as Artifact[];

/** What the v4.1.19 release published (`gh release view v4.1.19`), and what its candidate's manifest listed. */
const PUBLISHED_4119 = [
  'create-web-scumm-4.1.19.tgz',
  'create-web-scumm-v4.1.19-sbom.cdx.json',
  'web-scumm-4.1.19.tgz',
  'web-scumm-bridge-4.1.19.tgz',
  'web-scumm-bridge-image-v4.1.19-sbom.cdx.json',
  'web-scumm-bridge-image-v4.1.19.json',
  'web-scumm-bridge-image-v4.1.19.tar',
  'web-scumm-bridge-v4.1.19-sbom.cdx.json',
  'web-scumm-connectors-4.1.19.tgz',
  'web-scumm-connectors-v4.1.19-sbom.cdx.json',
  'web-scumm-v4.1.19-assets-manifest.json',
  'web-scumm-v4.1.19-baseline.json',
  'web-scumm-v4.1.19-baseline.md',
  'web-scumm-v4.1.19-candidate.json',
  'web-scumm-v4.1.19-dist.tar.gz',
  'web-scumm-v4.1.19-e2e-remix-speedrun.txt',
  'web-scumm-v4.1.19-reference-any.wsrun',
  'web-scumm-v4.1.19-remix-demo.json',
  'web-scumm-v4.1.19-remix-reference.json',
  'web-scumm-v4.1.19-run-daily.wsrun',
  'web-scumm-v4.1.19-run-mystery.wsrun',
  'web-scumm-v4.1.19-run-remix-fixed.wsrun',
  'web-scumm-v4.1.19-run-remix-random.wsrun',
  'web-scumm-v4.1.19-run-story-v1.wsrun',
  'web-scumm-v4.1.19-run-story.wsrun',
  'web-scumm-v4.1.19-sbom.cdx.json',
  'web-scumm-v4.1.19-SHA256SUMS',
  'web-scumm-v4.1.19-wsrun-manifest.json',
];
const RUNS = ['run-daily', 'run-mystery', 'run-remix-fixed', 'run-remix-random', 'run-story-v1', 'run-story'];
const CANDIDATE_4119 = [
  'baseline/baseline-4.1.19.json',
  'baseline/baseline-4.1.19.md',
  'e2e-remix-speedrun.txt',
  'image/web-scumm-bridge-image.cdx.json',
  'image/web-scumm-bridge-image.json',
  'image/web-scumm-bridge-image.tar',
  'pack/create-web-scumm-4.1.19.tgz',
  'pack/web-scumm-4.1.19.tgz',
  'pack/web-scumm-bridge-4.1.19.tgz',
  'pack/web-scumm-connectors-4.1.19.tgz',
  'sbom/create-web-scumm.cdx.json',
  'sbom/web-scumm-bridge.cdx.json',
  'sbom/web-scumm-connectors.cdx.json',
  'sbom/web-scumm.cdx.json',
  ...RUNS.map((r) => `wsrun/${r}.wsrun`),
  'wsrun/wsrun-manifest.json',
];
const sorted = (a: string[]) => [...a].sort();

describe('the manifest of a release', () => {
  it('gives back the 4.1.19 release and its candidate, file for file, with what 4.1.20 adds', () => {
    // 4.1.20 PR 4: the site the candidate built (published, never built again), the surfaces of the passes; PR 3b: the
    // signing rehearsal's report.
    const candidateAdds = [
      'site/assets-manifest.json',
      'site/dist.tar.gz',
      'site/site-files.json',
      'signing/signing-rehearsal.json',
      'surfaces/qualification-surfaces.json',
    ];
    const releaseAdds = [
      'web-scumm-v4.1.19-site-files.json',
      'web-scumm-v4.1.19-surfaces.json',
      'web-scumm-v4.1.19-signing-rehearsal.json',
    ];
    expect(releaseFiles('v4.1.19', CANDIDATE_4119)).toEqual(sorted([...PUBLISHED_4119, ...releaseAdds]));
    expect(candidateFiles('4.1.19', RUNS)).toEqual(sorted([...CANDIDATE_4119, ...candidateAdds]));
  });

  it('lists the Studio Server and its SBOM from 4.2.1 on, never before', () => {
    expect(candidateFiles('4.2.1', [])).toContain('pack/web-scumm-studio-server-4.2.1.tgz');
    expect(candidateFiles('4.2.1-rc.1', [])).toContain('sbom/web-scumm-studio-server.cdx.json');
    expect(candidateFiles('4.2.0', []).filter((f: string) => f.includes('studio-server'))).toEqual([]);
    const v421 = releaseFiles('v4.2.1', candidateFiles('4.2.1', []));
    expect(v421).toContain('web-scumm-studio-server-4.2.1.tgz');
    expect(v421).toContain('web-scumm-studio-server-v4.2.1-sbom.cdx.json');
    expect(
      releaseFiles('v4.2.0', candidateFiles('4.2.0', [])).filter((f: string) => f.includes('studio-server')),
    ).toEqual([]);
  });

  it('names packages without the pre-release suffix, every other file with the tag', () => {
    const rc = releaseFiles('v4.1.20-rc.1', candidateFiles('4.1.20-rc.1', ['run-daily']));
    expect(rc).toContain('web-scumm-bridge-4.1.20.tgz');
    expect(rc).toContain('web-scumm-v4.1.20-rc.1-run-daily.wsrun');
    expect(candidateFiles('4.1.20-rc.1', [])).toContain('baseline/baseline-4.1.20-rc.1.json');
    expect(() => releaseFiles('4.1.20', [])).toThrow(/not a release tag/);
  });

  it('says each file missing and each one it does not list', () => {
    const want = releaseFiles('v4.1.19', CANDIDATE_4119);
    expect(checkRelease('v4.1.19', CANDIDATE_4119, want)).toEqual([]);
    expect(checkRelease('v4.1.19', CANDIDATE_4119, [...want.slice(1), 'web-scumm-v4.1.19-extra.json'])).toEqual([
      `${want[0]}: missing`,
      'web-scumm-v4.1.19-extra.json: not in tools/release/artifacts.mjs',
    ]);
  });

  it('gives every entry one id, one published name, and an SBOM that is itself published', () => {
    const ids = ALL.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = ALL.map((a) => a.published);
    expect(new Set(names).size).toBe(names.length);
    for (const a of ALL) if (a.sbom) expect(names).toContain(a.sbom);
    for (const a of ALL) if (a.candidate !== null || a.artifact) expect(a.job).not.toBe('release');
  });
});

/** Each job of a workflow and the Actions artifacts it uploads, by name. */
function uploads(file: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let job = '';
  let uploading = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const j = line.match(/^ {2}([a-z0-9-]+):\s*$/);
    if (j) job = j[1]!;
    if (/uses: actions\/upload-artifact@/.test(line)) uploading = true;
    const n = line.match(/^\s+name: (.+?)\s*$/);
    if (uploading && n) {
      out.set(n[1]!, [...(out.get(n[1]!) ?? []), job]);
      uploading = false;
    }
  }
  return out;
}

describe('the workflows, against the manifest', () => {
  it('candidate.yml uploads each artifact of the manifest from the one job it names, once', () => {
    const up = uploads('.github/workflows/candidate.yml');
    for (const a of ALL.filter((x) => x.artifact)) expect(up.get(a.artifact!), a.id).toEqual([a.job]);
  });

  it('release.yml makes nothing the candidate made, and checks its files against the manifest before uploading', () => {
    const wf = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(wf).not.toMatch(/scripts\/pack\.mjs/);
    expect(wf).not.toMatch(/bridge-image\.mjs build/);
    expect(wf).not.toMatch(/npm sbom/);
    const check = wf.indexOf('tools/release/artifacts.mjs check-release');
    expect(check).toBeGreaterThan(wf.indexOf('sha256sum '));
    expect(check).toBeLessThan(wf.indexOf('gh release upload'));
  });
});

describe('ship verify, against the manifest', () => {
  it('judges a release from 4.1.20 only, by the runs its own candidate manifest names', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    // @ts-expect-error: a plain .mjs module without declarations
    const { publishedProblems } = await import('../tools/release/artifacts.mjs');
    expect(publishedProblems('v4.1.19', ['anything'], '.')).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), 'artifacts-'));
    const tag = 'v4.1.20';
    const cand = candidateFiles('4.1.20', ['run-daily']);
    writeFileSync(
      join(dir, `web-scumm-${tag}-candidate.json`),
      JSON.stringify({ artifacts: cand.map((name: string) => ({ name })) }),
    );
    const files = releaseFiles(tag, cand);
    expect(publishedProblems(tag, files, dir)).toEqual([]);
    expect(
      publishedProblems(
        tag,
        files.filter((f: string) => !f.endsWith('-run-daily.wsrun')),
        dir,
      ),
    ).toEqual(['web-scumm-v4.1.20-run-daily.wsrun: missing']);
    expect(
      publishedProblems(
        tag,
        files.filter((f: string) => !f.endsWith('-candidate.json')),
        dir,
      )[0],
    ).toMatch(/candidate\.json: missing/);
  });
});
