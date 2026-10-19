import { describe, expect, it } from 'vitest';
import { collectChecks, doctorReport } from '../tools/doctor-checks';
import { serveArgs } from '../tools/serve-args';
import { manualPasses, releaseNotes } from '../scripts/release-notes.mjs';
import { runTool } from './run-tool';

describe('doctor', () => {
  const probes = (ok: boolean) => ({
    command: (cmd: string) => ({ ok, stdout: cmd === 'ffmpeg' ? 'ffmpeg version 8.0\nbuilt' : '3.12.7\n' }),
    exists: () => ok,
    nodeVersion: ok ? '22.14.0' : '18.0.0',
    browsers: { Chromium: '/x/chromium', WebKit: '/x/webkit' },
  });
  it('reports every prerequisite with a fix when missing', () => {
    const bad = collectChecks(probes(false));
    expect(bad.map((c) => c.name)).toEqual([
      'Node.js',
      'Python',
      'Python image modules',
      'ffmpeg',
      'Playwright Chromium',
      'Playwright WebKit',
    ]);
    expect(bad.every((c) => !c.ok && c.fix)).toBe(true);
    // Node and Chromium are required; Python, its modules, ffmpeg and WebKit are optional (4.1.6): said, not fatal.
    expect(doctorReport(bad)).toMatchObject({ failed: 2, optional: 4 });
    expect(doctorReport(bad).text).toContain('npx playwright install webkit');
    expect(doctorReport(bad).text).toContain('○  Python: not found (optional)');
    const only = collectChecks({ ...probes(true), command: () => ({ ok: false, stdout: '' }) });
    expect(doctorReport(only)).toMatchObject({ failed: 0, optional: 3 });
    // --release (4.1.8): what release-check runs is required; Firefox and WebKit stay optional, it opens no browser.
    const rel = collectChecks(probes(false), { release: true });
    expect(doctorReport(rel)).toMatchObject({ failed: 5, optional: 1 }); // WebKit is the one optional browser probed
    expect(collectChecks(probes(true), { release: true }).every((c) => c.ok)).toBe(true);
    expect(doctorReport(only).text).toContain('3 optional ones missing');
  });
  it('is quiet when everything is there', () => {
    const good = collectChecks(probes(true));
    expect(good.every((c) => c.ok)).toBe(true);
    expect(doctorReport(good)).toMatchObject({ failed: 0, optional: 0 });
    expect(good.find((c) => c.name === 'ffmpeg')?.detail).toBe('ffmpeg version 8.0');
  });
});

describe('serve', () => {
  it('loopback by default, a token and a banner on the LAN, the Studio URL carries it', () => {
    expect(serveArgs([], {}, () => 'T')).toMatchObject({ args: ['vite'], env: {}, banner: [] });
    const lan = serveArgs(['--lan', '--studio'], {}, () => 'T');
    expect(lan.args).toEqual(['vite', '--host', '0.0.0.0', '--open', '/__studio/?token=T']);
    expect(lan.env).toEqual({
      WEB_SCUMM_LAN: '1',
      WEB_SCUMM_STUDIO_TOKEN: 'T',
      WEB_SCUMM_STUDIO_HOSTS: '',
      STUDIO: '1',
    });
    expect(lan.banner.join('\n')).toContain('token=T');
    expect(serveArgs(['--lan'], { WEB_SCUMM_STUDIO_TOKEN: 'given' }, () => 'T').token).toBe('given');
    // The machine's addresses reach the Studio's Host guard, and the banner names the first (4.1.2).
    const named = serveArgs(
      ['--lan', '--studio'],
      {},
      () => 'T',
      () => ['10.0.0.2', '10.0.0.3'],
    );
    expect(named.env.WEB_SCUMM_STUDIO_HOSTS).toBe('10.0.0.2,10.0.0.3');
    expect(named.banner.join('\n')).toContain('http://10.0.0.2:5173/__studio/?token=T');
    expect(
      serveArgs(
        [],
        {},
        () => 'T',
        () => ['10.0.0.2'],
      ).env,
    ).toEqual({});
  });
});

describe('release notes', () => {
  const log = '# Changelog\n\n## 3.1.0 — 2026-10-05\n\n### Added\n\n- a\n\n## 3.0.0 — 2026-10-04\n\n- b\n';
  it('prints the section of the tag, without its heading', () => {
    expect(releaseNotes(log, 'v3.1.0')).toBe('### Added\n\n- a\n');
    expect(releaseNotes(log, '3.0.0')).toBe('- b\n');
    expect(releaseNotes(log, 'v3.2.0')).toBeNull();
    // 4.1.8: a release candidate reads the section of the version it candidates for, and says it is one.
    expect(releaseNotes(log, 'v3.1.0-rc.1')).toBe(
      '**Release candidate rc.1 of 3.1.0**: a pre-release for a cycle of observation; the final tag may differ.\n\n### Added\n\n- a\n',
    );
    expect(releaseNotes(log, 'v3.2.0-rc.1')).toBeNull();
    // D12: the notes say which manual pass was done, or that none was.
    expect(manualPasses(null)).toContain('None recorded for this release');
    const sheet =
      '| Pass | Status | Who | Device | Failed |\n|---|---|---|---|---|\n| Screen reader | done | Ann | iPhone | — |\n| Safari offline | not done | | | |\n';
    expect(manualPasses(sheet)).toContain('1 of 2 done.');
    expect(manualPasses(sheet)).toContain('| Safari offline | not done |');
    // A sheet that opens with the release's own table (4.1.7+): only the rows after "## People's passes" count.
    const full = `| # | It may not ship while… | At the tag |\n|---|---|---|\n| 1 | x | y |\n\n## People's passes\n\n${sheet}`;
    expect(manualPasses(full)).toContain('1 of 2 done.');
  });
});

describe('e2e: the solver verdict', () => {
  it('accepts only an exit 0, solved, finished run with steps', async () => {
    const { solverResultOk } = await import('../scripts/e2e/util.mjs');
    const good = { status: 'solved', finished: true, steps: [{ start: 'new' }] };
    expect(solverResultOk(good, 0)).toEqual({ ok: true, reason: '' });
    expect(solverResultOk(good, 2).ok).toBe(false);
    expect(solverResultOk(good, null).reason).toContain('without a status');
    expect(solverResultOk({ ...good, status: 'truncated', truncated: true }, 0).reason).toContain('truncated');
    expect(solverResultOk({ ...good, finished: false, status: 'unsolved' }, 0).ok).toBe(false);
    expect(solverResultOk({ ...good, steps: [] }, 0).reason).toContain('no steps');
    expect(solverResultOk(undefined, 0).ok).toBe(false);
  });
});

describe('exit codes of the content tools', () => {
  const run = (args: string[], env: Record<string, string> = {}) =>
    runTool(args, { env: { ...process.env, GAME: 'demo', ...env } });

  it('a release of the sample game has no warning and no exception left, and it may be sold (3.7: its own theme)', () => {
    const rel = run(['tools/validate.ts', '--release']);
    expect(rel.status, rel.stdout + rel.stderr).toBe(0); // the CLI's own words when it refuses, not a bare 1
    expect(rel.stdout).not.toContain('warning(s)');
    expect(rel.stdout).not.toContain('release exception');
    const com = run(['tools/validate.ts', '--commercial', '--errors']);
    expect(com.status).toBe(0);
    expect(com.stdout).toContain('commercial release');
  }, 60000);

  it('lint exits 2 on a truncated proof and says so in its JSON', () => {
    const r = run(['tools/lint.ts', '--prove', '--max=1', '--json']);
    expect(r.status).toBe(2);
    const out = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(out).toMatchObject({ mode: 'prove', status: 'truncated', truncated: true });
    expect(out.findings.every((f: { severity: string }) => f.severity !== 'warning')).toBe(true);
  }, 60000);

  it('playtests --strict exits 1 on a session the content outgrew', async () => {
    const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'playtests-'));
    const file = JSON.parse(readFileSync('games/demo/playtests/walkthrough-hesitant.session.json', 'utf8'));
    file.session.log[5].act = { verb: 'use', a: 'key', b: 'pantry' }; // no key yet: not what was recorded, the replay diverges there
    writeFileSync(join(dir, 'diverged.session.json'), JSON.stringify(file));
    expect(run(['tools/playtests.ts', `--dir=${dir}`]).status).toBe(0);
    const strict = run(['tools/playtests.ts', `--dir=${dir}`, '--strict']);
    expect(strict.status).toBe(1);
    expect(strict.stderr).toContain('--strict');
  }, 90000);
});

describe('the proof by chapters has one verdict in every output', () => {
  const run = (args: string[]) =>
    runTool(['tools/solve.ts', ...args], {
      env: { ...process.env, GAME: '', GAME_DIR: 'tests/fixtures/mismatch-game' },
    });
  it('an unreachable checkpoint fails the text output and --json alike, status checkpoint_mismatch', () => {
    const json = run(['--prove', '--chapters', '--json']);
    expect(json.status).toBe(1);
    expect(JSON.parse(json.stdout.trim().split('\n').pop()!).status).toBe('checkpoint_mismatch');
    const text = run(['--prove', '--chapters']);
    expect(text.status).toBe(1);
    expect(text.stdout).toContain('checkpoint_mismatch');
  }, 60000);
});
