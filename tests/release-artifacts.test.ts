// The one manifest of a release's files (4.1.20 PR 3, plan §8.4, tools/release/artifacts.mjs): it gives back the
// 4.1.19 release file for file, each candidate artifact is uploaded by the one job it names and by no other, and
// release.yml makes nothing the candidate made (no pack, no image, no SBOM) and checks its folder against it before
// it uploads. A file forgotten or made twice fails here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without declarations
import { ARTIFACTS, PACKAGES, candidateFiles, checkRelease, releaseFiles } from '../tools/release/artifacts.mjs';
// @ts-expect-error: a plain .mjs module without declarations
import { atLeast } from '../tools/release/candidate.mjs';

interface Artifact {
  id: string;
  candidate: string | null;
  artifact?: string;
  job: string;
  published: string;
  sbom?: string;
  since?: string;
  until?: string;
}
const ALL = ARTIFACTS as Artifact[];
/** A manifest name for a tag (`{proj}` the name the release's files start with, D47). */
const fill = (name: string, tag: string, version: string) =>
  name
    .replaceAll('{proj}', version >= '4.2.5' ? 'quest-n-click' : 'web-scumm')
    .replaceAll('{tag}', tag)
    .replaceAll('{pkg}', version);

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

  it('lists the documentation archive from 4.5.0 on (§4.5.4): the candidate under package.json, the release under the tag', () => {
    expect(candidateFiles('4.5.0', [])).toContain('docs/quest-n-click-docs-4.5.0.tar.gz');
    expect(candidateFiles('4.5.0-rc.1', [])).toContain('docs/quest-n-click-docs-4.5.0.tar.gz');
    expect(candidateFiles('4.4.0', []).filter((f: string) => f.startsWith('docs/'))).toEqual([]);
    expect(releaseFiles('v4.5.0', candidateFiles('4.5.0', []))).toContain('quest-n-click-docs-4.5.0.tar.gz');
    expect(releaseFiles('v4.5.0-rc.1', candidateFiles('4.5.0-rc.1', []))).toContain(
      'quest-n-click-docs-4.5.0-rc.1.tar.gz',
    );
    expect(releaseFiles('v4.4.0', candidateFiles('4.4.0', [])).filter((f: string) => f.includes('-docs-'))).toEqual([]);
    const entry = ALL.find((a) => a.id === 'docs:archive')!;
    expect(entry).toMatchObject({ artifact: 'candidate-docs', job: 'docs-archive', since: '4.5.0' });
    // The candidate's surfaces classify it (tools/field/surfaces.mjs fails on a file in no surface and no status).
    const surfaces = JSON.parse(readFileSync('docs/dev/surfaces.json', 'utf8')) as { status: { path: string }[] };
    expect(surfaces.status.map((x) => x.path)).toContain('docs/*');
    // ship verify names it, once the sums and attestations have covered it.
    expect(readFileSync('tools/release/ship.mjs', 'utf8')).toMatch(/quest-n-click-docs-\$\{version\}\.tar\.gz/);
  });

  it("lists the website's demo from 4.5.2 on (D52): built under /demo/ by release-core, never expected of 4.5.1", () => {
    expect(candidateFiles('4.5.2', [])).toContain('site/web.tar.gz');
    expect(candidateFiles('4.5.2-rc.1', [])).toContain('site/web.tar.gz');
    expect(candidateFiles('4.5.1', [])).not.toContain('site/web.tar.gz');
    expect(releaseFiles('v4.5.2', candidateFiles('4.5.2', []))).toContain('quest-n-click-v4.5.2-web.tar.gz');
    expect(releaseFiles('v4.5.2-rc.1', candidateFiles('4.5.2-rc.1', []))).toContain(
      'quest-n-click-v4.5.2-rc.1-web.tar.gz',
    );
    // 4.5.1 and every release before keep verifying: their published files never had it.
    const v451 = releaseFiles('v4.5.1', candidateFiles('4.5.1', []));
    expect(v451.filter((f: string) => f.endsWith('-web.tar.gz'))).toEqual([]);
    expect(checkRelease('v4.5.1', candidateFiles('4.5.1', []), v451)).toEqual([]);
    const v452 = releaseFiles('v4.5.2', candidateFiles('4.5.2', []));
    expect(
      checkRelease(
        'v4.5.2',
        candidateFiles('4.5.2', []),
        v452.filter((f: string) => !f.endsWith('-web.tar.gz')),
      ),
    ).toEqual(['quest-n-click-v4.5.2-web.tar.gz: missing']);
    expect(ALL.find((a) => a.id === 'game:web')).toMatchObject({
      artifact: 'candidate-site',
      job: 'release-core',
      since: '4.5.2',
    });
    // The candidate builds it under /demo/ with the Studio demo, after the site it publishes as dist.tar.gz.
    const candidate = readFileSync('.github/workflows/candidate.yml', 'utf8');
    expect(candidate).toMatch(
      /BASE_PATH=\/demo\/ STUDIO=1 VITE_STUDIO_DEMO=1 npm run build:web\n\s+tar -czf candidate-site\/web\.tar\.gz -C dist \./,
    );
    // The version probe: 0 builds, 10 skips (before 4.5.2), anything else fails the step (never a silent skip).
    expect(candidate).toMatch(
      /process\.exit\(m\.atLeast\(require\("\.\/package\.json"\)\.version, "4\.5\.2"\) \? 0 : 10\)\)' \|\| probe=\$\?/,
    );
    expect(candidate).toMatch(/case "\$probe" in\n\s+0\)\n/);
    expect(candidate).toMatch(/\n\s+10\) echo "::notice::no web\.tar\.gz before 4\.5\.2" ;;\n/);
    expect(candidate).toMatch(/\n\s+\*\) echo "::error::[^"]*"; exit 1 ;;\n/);
    expect(candidate.indexOf('candidate-site/web.tar.gz')).toBeGreaterThan(
      candidate.indexOf('candidate-site/dist.tar.gz'),
    );
    // release.yml copies it into the release, its sums and its attestation (the `${P}-${TAG}-*` subject).
    const release = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(release).toMatch(/cp \.candidate\/site\/web\.tar\.gz "\$P-\$TAG-web\.tar\.gz"/);
    expect(release).toMatch(/extra="[^"\n]*\$\{WEB:\+ \$WEB\}"/);
    const surfaces = JSON.parse(readFileSync('docs/dev/surfaces.json', 'utf8')) as { status: { path: string }[] };
    expect(surfaces.status.map((x) => x.path)).toContain('site/web.tar.gz');
    // ship verify names it from 4.5.2 only.
    const ship = readFileSync('tools/release/ship.mjs', 'utf8');
    expect(ship).toContain("const WEB_SINCE = '4.5.2';");
    expect(ship).toMatch(/if \(atLeast\(version, WEB_SINCE\) && !existsSync\(join\(dir, web\)\)\)/);
  });

  it('takes the Remix reports from the candidate from 4.5.3 (#291), under the names the releases before had', () => {
    // Before 4.5.3 the release job proved them: no candidate file, the same two published names.
    expect(candidateFiles('4.5.2', []).filter((f: string) => f.startsWith('remix/'))).toEqual([]);
    for (const v of ['4.5.3', '4.5.3-rc.1', '4.6.0'])
      expect(
        candidateFiles(v, []).filter((f: string) => f.startsWith('remix/')),
        v,
      ).toEqual(['remix/remix-demo.json', 'remix/remix-reference.json']);
    for (const [tag, v] of [
      ['v4.5.2', '4.5.2'],
      ['v4.5.3-rc.1', '4.5.3-rc.1'],
      ['v4.5.3', '4.5.3'],
    ])
      expect(
        releaseFiles(tag, candidateFiles(v, [])).filter((f: string) => f.includes('-remix-') && f.endsWith('.json')),
        tag,
      ).toEqual([`quest-n-click-${tag}-remix-demo.json`, `quest-n-click-${tag}-remix-reference.json`]);
    for (const g of ['demo', 'reference']) {
      expect(ALL.find((a) => a.id === `remix:${g}`)).toMatchObject({
        candidate: `remix/remix-${g}.json`,
        artifact: 'candidate-remix',
        job: 'remix-proof',
        since: '4.5.3',
      });
      expect(ALL.find((a) => a.id === `remix:${g}:release`)).toMatchObject({ candidate: null, until: '4.5.3' });
    }
    // The candidate proves them in a job of its own, which the gate needs, and puts them in the manifest's folder.
    const candidate = readFileSync('.github/workflows/candidate.yml', 'utf8');
    const job = candidate.slice(candidate.indexOf('\n  remix-proof:'), candidate.indexOf('\n  worker-container:'));
    for (const g of ['demo', 'reference'])
      expect(job).toContain(
        `GAME=${g} npx tsx tools/verify-variants.ts --prove --max=200000 --out=candidate-remix/remix-${g}.json`,
      );
    expect(candidate).toMatch(/\n {2}candidate-gate:\n {4}needs: \[[^\]]*\bremix-proof\b/);
    expect(candidate).toContain('cp artifacts/candidate-remix/* artifacts/candidate-release/remix/');
    expect(candidate.indexOf('candidate-release/remix/')).toBeLessThan(
      candidate.indexOf('node tools/release/candidate.mjs manifest'),
    );
    // release.yml proves nothing: it downloads them, refuses a candidate without them, copies them under the tag.
    const release = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(release).not.toMatch(/verify-variants/);
    expect(release).toContain('gh run download "$run" -n candidate-remix -D .candidate/remix');
    expect(release).toMatch(
      /for d in site surfaces signing remix; do test -d "\.candidate\/\$d" \|\| \{ echo "::error::[^"]*start a new candidate\)"; exit 1; \}; done/,
    );
    expect(release).toContain('cp ".candidate/remix/remix-$g.json" "$P-$TAG-remix-$g.json"');
    const surfaces = JSON.parse(readFileSync('docs/dev/surfaces.json', 'utf8')) as { status: { path: string }[] };
    expect(surfaces.status.map((x) => x.path)).toContain('remix/*');
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
    // One entry per published name in any one release (the Remix reports changed maker in 4.5.3, not name).
    const live = (a: (typeof ALL)[number], v: string) =>
      (!a.since || atLeast(v, a.since)) && (!a.until || !atLeast(v, a.until));
    for (const v of ['4.1.19', '4.2.4', '4.2.5', '4.5.2', '4.5.3-rc.1', '4.5.3', '4.6.0']) {
      const names = ALL.filter((a) => live(a, v)).map((a) => a.published);
      expect(new Set(names).size, v).toBe(names.length);
    }
    // Each release's SBOMs are among its own files, before the rename and after it (D47).
    for (const [tag, version] of [
      ['v4.2.4', '4.2.4'],
      ['v4.2.5', '4.2.5'],
    ]) {
      const files = releaseFiles(tag, candidateFiles(version, []));
      for (const a of ALL.filter((x) => (!x.since || version >= x.since) && (!x.until || version < x.until)))
        if (a.sbom) expect(files, a.id).toContain(fill(a.sbom, tag, version));
    }
    for (const a of ALL) if (a.candidate !== null || a.artifact) expect(a.job).not.toBe('release');
  });

  it("names a release's files quest-n-click from 4.2.5, and ships the former names' aliases through 4.2.x (D47)", () => {
    const v425 = releaseFiles('v4.2.5', candidateFiles('4.2.5', ['run-daily']));
    for (const f of [
      'quest-n-click-4.2.5.tgz',
      'create-quest-n-click-4.2.5.tgz',
      'quest-n-click-bridge-4.2.5.tgz',
      'quest-n-click-connectors-4.2.5.tgz',
      'quest-n-click-studio-server-4.2.5.tgz',
      'quest-n-click-v4.2.5-sbom.cdx.json',
      'quest-n-click-v4.2.5-dist.tar.gz',
      'quest-n-click-v4.2.5-SHA256SUMS',
      'quest-n-click-v4.2.5-run-daily.wsrun',
      'quest-n-click-bridge-image-v4.2.5.tar',
      // The aliases, the same files under the former names.
      'web-scumm-4.2.5.tgz',
      'create-web-scumm-4.2.5.tgz',
      'web-scumm-bridge-4.2.5.tgz',
      'web-scumm-connectors-4.2.5.tgz',
      'web-scumm-studio-server-4.2.5.tgz',
      'web-scumm-v4.2.5-sbom.cdx.json',
    ])
      expect(v425).toContain(f);
    // Nothing else of 4.2.5 keeps the former name: only the aliases and their SBOMs.
    expect(
      v425.filter(
        (f: string) =>
          /web-scumm/.test(f) && !/^(create-)?web-scumm(-[a-z-]+)?-(4\.2\.5\.tgz|v4\.2\.5-sbom\.cdx\.json)$/.test(f),
      ),
    ).toEqual([]);
    expect(candidateFiles('4.2.5', [])).toContain('image/quest-n-click-bridge-image.tar');
    expect(candidateFiles('4.2.5', [])).toContain('pack/web-scumm-4.2.5.tgz');
    // 4.2.4 is as it was published; 4.3 has no alias left.
    expect(releaseFiles('v4.2.4', candidateFiles('4.2.4', [])).filter((f: string) => /quest-n-click/.test(f))).toEqual(
      [],
    );
    expect(releaseFiles('v4.3.0', candidateFiles('4.3.0', [])).filter((f: string) => /web-scumm/.test(f))).toEqual([]);
    // 4.3.0 (D47, D48): the candidate's archives and SBOMs are the five packages under their own names, exactly what
    // scripts/pack.mjs and scripts/sbom.mjs now make (no alias), from the first release candidate on.
    for (const v of ['4.3.0-rc.1', '4.3.0', '4.3.1']) {
      const pkg = v.replace(/-.*$/, '');
      const files = candidateFiles(v, []);
      expect(
        files.filter((f: string) => f.startsWith('pack/')),
        v,
      ).toEqual(PACKAGES.map((p: { name: string }) => `pack/${p.name}-${pkg}.tgz`).sort());
      expect(
        files.filter((f: string) => f.startsWith('sbom/')),
        v,
      ).toEqual(PACKAGES.map((p: { name: string }) => `sbom/${p.name}.cdx.json`).sort());
    }
    for (const f of ['scripts/pack.mjs', 'scripts/sbom.mjs'])
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/aliasManifest|ALIASES_UNTIL|p\.old/);
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
