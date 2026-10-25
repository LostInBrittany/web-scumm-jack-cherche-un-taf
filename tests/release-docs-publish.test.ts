// The documentation's publication chain, read statically (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.5.2 to §4.5.5,
// phase A5b; the workflows are not run here, the sandbox replay is A7's): the candidate builds the archive twice and
// keeps it; the release publishes it with its sums and attestation and hands its sha256 on only after `ship verify`;
// `docs-publish` is a job that `needs` the release job and calls the reusable workflow (no `release:` trigger
// anywhere); that workflow checks out the whole history and every tag, checks the archive against the release and
// the candidate, runs `check --publish` with the candidate's own test report, never touches the wiki for an rc,
// publishes a doc revision as an immutable pre-release, shares one concurrency group without cancelling; Pages'
// `/docs/` is assembled from the releases, never built from the branch.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(`.github/workflows/${name}.yml`, 'utf8').replace(/\r\n/g, '\n');
/** A top-level key's block (`on:`, `jobs:`…), up to the next top-level key. */
const top = (yml: string, key: string) => {
  const m = new RegExp(`^${key}:.*\\n((?:[ #].*\\n|\\n)*)`, 'm').exec(yml);
  return m ? m[1]! : '';
};
/** A job's block, up to the next job. */
const job = (yml: string, name: string) => {
  const jobs = top(yml, 'jobs');
  const m = new RegExp(`^  ${name}:\\n((?:(?:    |  #).*\\n|\\n)*)`, 'm').exec(jobs);
  return m ? m[1]! : '';
};
/** The keys directly under a block, at the given indent. */
const keys = (block: string, indent: number) =>
  [...block.matchAll(new RegExp(`^ {${indent}}([a-z][a-z0-9_-]*):`, 'gm'))].map((m) => m[1]!);
/** The steps of a job, each its text, in order. */
const steps = (block: string) => block.split(/\n {6}- /).slice(1);

describe('the YAML itself', () => {
  for (const name of ['docs-publish', 'release', 'candidate', 'ci'])
    it(`${name}.yml: spaces only, two by two, every job under jobs:`, () => {
      const yml = read(name);
      expect(yml).not.toMatch(/\t/);
      for (const [i, line] of yml.split('\n').entries())
        if (line.trim() && !line.trimStart().startsWith('#') && !/^\s*(run|[a-z-]+): [|>]/.test(line)) {
          const indent = line.length - line.trimStart().length;
          // Block scalars (a `run: |` body) are free; elsewhere an odd indent is a mistake.
          if (indent % 2 && !/^ {10,}/.test(line)) throw new Error(`${name}.yml:${i + 1}: odd indent`);
        }
      expect(keys(top(yml, 'jobs'), 2).length).toBeGreaterThan(0);
    });
});

describe('no workflow starts on a release event', () => {
  it('neither docs-publish nor any other: a release published with GITHUB_TOKEN starts nothing (§4.5.2)', () => {
    for (const name of ['docs-publish', 'release', 'candidate', 'ci', 'nightly', 'prove', 'qualify', 'mutation'])
      expect(keys(top(read(name), 'on'), 2), name).not.toContain('release');
  });
});

describe('docs-publish.yml', () => {
  const yml = read('docs-publish');
  const publish = job(yml, 'publish');
  const all = steps(publish);
  const step = (re: RegExp) => {
    const s = all.find((x) => re.test(x));
    if (!s) throw new Error(`no step matching ${re}`);
    return s;
  };
  /** Each `run:` body, its lines only. */
  const runs = all.map((x) => x.slice(x.indexOf('run:'))).filter((x) => x.startsWith('run:'));

  it('is called by release.yml or started by hand, with the inputs the release hands it', () => {
    expect(keys(top(yml, 'on'), 2)).toEqual(['workflow_call', 'workflow_dispatch']);
    const on = top(yml, 'on');
    const call = on.slice(on.indexOf('workflow_call:'), on.indexOf('workflow_dispatch:'));
    expect(keys(call.slice(0, call.indexOf('    secrets:')), 6)).toEqual([
      'version',
      'tag',
      'sha',
      'candidate',
      'archive-sha256',
      'revision',
    ]);
    // Only the wiki's deploy key is a secret it takes.
    expect([...call.slice(call.indexOf('    secrets:')).matchAll(/^ {6}([A-Z_]+):/gm)].map((m) => m[1])).toEqual([
      'WIKI_DEPLOY_KEY',
    ]);
    const dispatch = on.slice(on.indexOf('workflow_dispatch:'));
    expect(keys(dispatch, 6)).toEqual(['version', 'mode', 'target']);
    expect(dispatch).toMatch(/options: \[revision, rollback, promote, preview\]/);
  });

  it('shares one concurrency group with every publication, never cancelled, on its job, and says the pending limit', () => {
    expect(top(yml, 'concurrency')).toBe('');
    expect(publish).toMatch(/^ {4}concurrency:\n {6}group: docs-publish\n {6}cancel-in-progress: false\n/m);
    expect(publish).toMatch(/GitHub keeps ONE pending run per group, whatever\n\s+# `cancel-in-progress` says/);
    expect(publish).toMatch(/re-run the cancelled job, or dispatch `mode=promote`/);
  });

  it('runs in the docs-publish environment, the one place holding the deploy key and writing', () => {
    expect(publish).toMatch(/^ {4}environment: docs-publish$/m);
  });

  it("knows a call by its inputs: in a called workflow the github context is the caller's", () => {
    expect(publish).not.toMatch(/github\.event_name/);
    expect(publish).toMatch(/CALLED: \$\{\{ inputs\.archive-sha256 != '' && inputs\.sha != '' \}\}/);
    expect(publish).toMatch(/ref: \$\{\{ inputs\.sha \|\| github\.sha \}\}/);
  });

  it('passes the inputs to the shell through env only, never into a run: line', () => {
    expect(runs.length).toBeGreaterThan(8);
    for (const r of runs) expect(r, r.slice(0, 80)).not.toMatch(/\$\{\{\s*(inputs|github\.event)\./);
  });

  it('writes from one ref per mode: a rollback or a promotion off main, a revision off docs/<v>, are refused', () => {
    const s = step(/The inputs, and the ref each mode may write from/);
    expect(s).toMatch(/revision\) want="refs\/heads\/docs\/\$VERSION" ;;/);
    // A release from its tag's push (4.5.3, #291), the tag the version names; the others from main.
    expect(s).toMatch(
      /release\)\n\s+\[ "\$IN_TAG" = "v\$VERSION" \] \|\| \{[^}]+\}\n\s+want="refs\/tags\/\$IN_TAG" ;;/,
    );
    expect(s).toMatch(/rollback\|promote\|preview\) want=refs\/heads\/main ;;/);
    expect(s).toMatch(/\[ "\$RUN_REF" = "\$want" \] \|\| \{ echo "::error::a \$mode publishes from \$want/);
    // And the tool checks it again.
    expect(step(/The wiki and publication\.json/)).toMatch(/--mode "\$MODE" --ref "\$RUN_REF"/);
  });

  it('checks out the whole history and fetches every tag (the preview rule and the source set read them)', () => {
    expect(publish).toMatch(/fetch-depth: 0/);
    expect(publish).toMatch(/git fetch --force --tags origin/);
  });

  it("checks the release's archive against the verified sha256, the release's sums, the candidate's manifest, its signer", () => {
    const s = step(/The release's archive/);
    expect(s).toMatch(/if: env\.MODE == 'release'/);
    expect(s).toMatch(/test "\$got" = "\$IN_SHA256"/);
    expect(s).toMatch(/-SHA256SUMS/);
    expect(s).toMatch(/-candidate\.json/);
    expect(s).toMatch(/npm run -s wiki -- attest --repo "\$REPO" --tag "\$TAG"/);
    expect(s).toMatch(/does not point to \$IN_SHA/);
    // Every verification goes through the one rule Pages uses (tools/wiki/pages.ts attestationArgs).
    expect(yml).not.toMatch(/gh attestation verify/);
    expect(step(/The published archive to promote/)).toMatch(/wiki -- attest --repo "\$REPO" --tag "\$tag"/);
    expect(step(/An existing release of this revision/)).toMatch(
      /wiki -- attest --repo "\$REPO" --tag "\$RELEASE_TAG"/,
    );
  });

  it("runs check --publish on the product with the candidate's own test report, downloaded from its run", () => {
    expect(step(/The candidate's test report/)).toMatch(/gh run download "\$CANDIDATE" .*-n candidate-test-report/);
    const check = step(/name: check --publish/);
    expect(check).toMatch(
      /--product-ref "\$PRODUCT_TAG" --doc-ref HEAD --state "\$state" --candidate "\$CANDIDATE" --test-report/,
    );
    expect(check).toMatch(/state=candidate/);
    expect(check).toMatch(/--state preview/);
  });

  it('publishes a doc revision as an immutable pre-release, never latest, built twice, attested, reused on a rerun', () => {
    expect(step(/The doc revision to publish/)).toMatch(/wiki -- next-revision --version "\$VERSION" --repo "\$REPO"/);
    expect(step(/The archive of this revision/)).toMatch(/cmp /);
    const existing = step(/An existing release of this revision/);
    expect(existing).toMatch(/exists with another archive/);
    expect(existing).toMatch(/REUSED=true/);
    expect(step(/attest-build-provenance/)).toMatch(/env\.REUSED != 'true'/);
    const rel = step(/The release of this revision/);
    expect(rel).toMatch(/env\.REUSED != 'true'/);
    expect(rel).toMatch(/--draft --prerelease --latest=false/);
    expect(rel.indexOf('gh release upload')).toBeLessThan(rel.indexOf('--draft=false'));
  });

  it('never touches the wiki for a pre-release; pushes it with the WIKI_DEPLOY_KEY secret or GITHUB_TOKEN', () => {
    const wiki = step(/The wiki and publication\.json/);
    expect(wiki).toMatch(/if: "!contains\(inputs\.version, '-'\)"/);
    expect(wiki).toMatch(/GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
    expect(wiki).toMatch(/WIKI_DEPLOY_KEY: \$\{\{ secrets\.WIKI_DEPLOY_KEY \}\}/);
    expect(wiki).toMatch(/--version "\$VERSION" --revision "\$REVISION"/);
    expect(wiki).toMatch(/--tag "\$RELEASE_TAG" --repo "\$REPO" --archive "\$ARCHIVE" --sha256 "\$ARCHIVE_SHA"/);
    expect(wiki).toMatch(/\[ "\$MODE" = rollback \] && flags\+=\(--rollback-to "\$TARGET"\)/);
    expect(step(/A pre-release leaves the wiki alone/)).toMatch(/if: contains\(inputs\.version, '-'\)/);
  });

  it('ends by saying the website takes the publication by itself: the engine starts no Pages run (4.5.2, D52)', () => {
    expect(all.at(-1)).toMatch(/::notice::https:\/\/quest-n-click\.cleverapps\.io takes this publication/);
    expect(read('docs-publish')).not.toMatch(/gh workflow run|pages-only/);
    expect(read('docs-publish')).toMatch(/^ {2}actions: read$/m);
  });
});

describe('release.yml', () => {
  const yml = read('release');
  const release = job(yml, 'release');
  const docs = job(yml, 'docs-publish');

  it('starts docs-publish from a job that needs the release job, through the reusable workflow', () => {
    expect(docs).toMatch(/^ {4}needs: \[release\]$/m);
    expect(docs).toMatch(/^ {4}uses: \.\/\.github\/workflows\/docs-publish\.yml$/m);
    expect(docs).toMatch(/if: needs\.release\.outputs\.docs-sha256 != ''/);
    expect(docs).toMatch(/archive-sha256: \$\{\{ needs\.release\.outputs\.docs-sha256 \}\}/);
    expect(docs).toMatch(/candidate: \$\{\{ needs\.release\.outputs\.candidate \}\}/);
    // The deploy key only, never every secret.
    expect(docs).not.toMatch(/secrets: inherit/);
    expect(docs).toMatch(/secrets:\n {6}WIKI_DEPLOY_KEY: \$\{\{ secrets\.WIKI_DEPLOY_KEY \}\}/);
  });

  it('ends by asking the website to revalidate, after the release and docs-publish, never failing the release (D52)', () => {
    const site = job(yml, 'site-revalidate');
    expect(site).toMatch(/^ {4}needs: \[release, docs-publish\]$/m);
    // After docs-publish whatever it did (a release without an archive skips it), only once the release (ship verify
    // its last check) succeeded.
    expect(site).toMatch(/^ {4}if: always\(\) && needs\.release\.result == 'success'$/m);
    expect(site).toMatch(/^ {4}continue-on-error: true$/m);
    expect(site).toMatch(/^ {4}timeout-minutes: \d+$/m);
    expect(site).toMatch(/^ {4}permissions: \{\}$/m);
    expect(site).toMatch(/SITE_URL: \$\{\{ vars\.SITE_URL \|\| 'https:\/\/quest-n-click\.cleverapps\.io' \}\}/);
    expect(site).toMatch(/SITE_REVALIDATE_SECRET: \$\{\{ secrets\.SITE_REVALIDATE_SECRET \}\}/);
    const [run] = steps(site);
    // No secret: a notice, nothing called. An address that is not https://: a warning, the token not sent.
    expect(run).toMatch(/if \[ -z "\$SITE_REVALIDATE_SECRET" \]; then\n\s+echo "::notice::[^"$]*"\n\s+exit 0/);
    expect(run).toMatch(/case "\$SITE_URL" in\n\s+https:\/\/\*\) ;;\n\s+\*\) echo "::warning::[^"$]*"; exit 0 ;;/);
    expect(run.indexOf('case "$SITE_URL" in')).toBeLessThan(run.indexOf('curl '));
    // The call: POST, the Bearer secret, a timeout; tried again on a network failure or a 5xx only, three times.
    expect(run).toMatch(/for i in 1 2 3; do/);
    expect(run).toMatch(
      /code=\$\(curl -sS -o "\$out" -w '%\{http_code\}' --max-time \d+ -X POST -H "Authorization: Bearer \$SITE_REVALIDATE_SECRET" "\$url"\) \|\| code=000/,
    );
    expect(run).toMatch(/if \[ "\$code" = 000 \] \|\| \[ "\$code" -ge 500 \]; then/);
    expect(run).toMatch(/url="\$\{SITE_URL%\/\}\/api\/revalidate"/);
    // The answer is shown between a fresh stop-commands token and its end, compacted by jq when it is JSON.
    expect(run).toMatch(
      /token=\$\(openssl rand -hex \d+\)\n\s+echo "::stop-commands::\$token"\n\s+jq -c \. "\$out" 2>\/dev\/null \|\| cat "\$out"\n\s+echo\n\s+echo "::\$token::"/,
    );
    // Nothing of the body in a workflow command: the warnings name the HTTP code and `.ok` / `.changed` only, read by
    // jq and stripped of newlines and `::`; no other line prints the answer.
    expect(run).toMatch(
      /field\(\) \{ \{ jq -r "\.\$1" "\$out" 2>\/dev\/null \|\| true; \} \| tr -d '\\r\\n:' \| head -c \d+ \|\| true; \}/,
    );
    const commands = run.split('\n').filter((l) => /echo "::(warning|error|notice)/.test(l));
    expect(commands.length).toBe(4);
    for (const l of commands) expect(l, l).not.toMatch(/\$out|\$body|cat |jq /);
    expect(run).toMatch(/ok=\$\(field ok\)/);
    expect(run).toMatch(/changed=\$\(field changed\)/);
    expect(run.match(/cat "\$out"/g)?.length).toBe(1);
    // The secret is named once in the workflow: this job's environment.
    expect(yml.match(/secrets\.SITE_REVALIDATE_SECRET/g)?.length).toBe(1);
  });

  it('hands the archive on from its last step, after ship verify: an output is read only from a job that succeeded', () => {
    const s = steps(release);
    const verify = s.findIndex((x) => /tools\/release\/ship\.mjs verify/.test(x));
    const out = s.findIndex((x) => /^id: docs\n/.test(x));
    expect(verify).toBeGreaterThan(0);
    expect(out).toBe(s.length - 1);
    expect(out).toBeGreaterThan(verify);
    expect(release).toMatch(/docs-sha256: \$\{\{ steps\.docs\.outputs\.sha256 \}\}/);
  });

  it("publishes the candidate's archive with the release's sums and attestations", () => {
    expect(release).toMatch(/gh run download "\$run" -n candidate-docs -D \.candidate\/docs/);
    const build = steps(release).find((x) => x.startsWith('name: Build archive, checksum and SBOM'))!;
    expect(build).toMatch(/n="\$P-docs-\$\{TAG#v\}\.tar\.gz"/);
    // In $extra before the sums and the manifest check, so both cover it.
    expect(build.indexOf('quest-n-click-docs-')).toBeLessThan(build.indexOf('sha256sum '));
    expect(release).toMatch(/\$\{\{ env\.P \}\}-docs-\*\.tar\.gz/);
  });
});

describe('candidate.yml and ci.yml', () => {
  it('the candidate builds the archive twice from its own test report, compares the bytes, uploads it, and the gate puts it in the manifest', () => {
    const yml = read('candidate');
    const docs = job(yml, 'docs-archive');
    // After release-core, whose candidate-test-report it downloads before archiving (§4.4.3: "executed on <sha>").
    expect(docs).toMatch(/needs: \[target, release-core\]/);
    const download = docs.indexOf('name: candidate-test-report');
    expect(download).toBeGreaterThan(-1);
    expect(download).toBeLessThan(docs.indexOf('npm run -s wiki -- archive --out'));
    expect(docs.match(/npm run -s wiki -- archive --out/g)?.length).toBe(2);
    expect(
      docs.match(
        /--build-id \$\{\{ github\.run_id \}\} --revision r1 --candidate \$\{\{ github\.run_id \}\} --test-report \.cache\/candidate-test-report\/vitest\.json/g,
      )?.length,
    ).toBe(2);
    expect(docs).toMatch(/cmp "candidate-docs\/quest-n-click-docs-\$v\.tar\.gz"/);
    expect(job(yml, 'pack')).not.toMatch(/wiki -- archive/);
    expect(job(yml, 'candidate-gate')).toMatch(/needs: \[[^\]]*\bdocs-archive\b/);
    expect(job(yml, 'candidate-gate')).toMatch(/cp artifacts\/candidate-docs\/\* artifacts\/candidate-release\/docs\//);
  });

  it("a doc revision's archive reads the product's candidate report too, so its guarantees render as the release's", () => {
    const yml = read('docs-publish');
    expect(yml).toMatch(
      /flags=\(--revision "\$REVISION" .*--candidate "\$CANDIDATE" --test-report \.test-report\/vitest\.json\)/,
    );
    // The report is downloaded for a revision before the archive is built.
    expect(yml.indexOf('-n candidate-test-report')).toBeLessThan(
      yml.indexOf('The archive of this revision, built twice'),
    );
  });

  it("ci builds no /docs/ and deploys no Pages: the organization's site assembles it from the releases (4.5.2, D51)", () => {
    const yml = read('ci');
    expect(yml).not.toMatch(/wiki -- (build|archive|bundle|pages)/);
    expect(yml).not.toMatch(/upload-pages-artifact|deploy-pages/);
    // A run started by hand still runs everything, and cancels no push's run.
    expect(keys(top(yml, 'on'), 2)).toContain('workflow_dispatch');
    expect(top(yml, 'concurrency')).toMatch(
      /cancel-in-progress: \$\{\{ github\.event_name != 'workflow_dispatch' \}\}/,
    );
  });
});
