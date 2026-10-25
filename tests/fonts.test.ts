// The interface fonts (4.3.0, #204): Galmuri11 by default, DotGothic16 behind every interface family (Japanese, the
// symbols a Latin pixel font lacks), the stylesheet's default the same stack as the one the App writes, and the subset's
// source checked against the pinned release before tools/subset-font.py cuts it.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_UI, fontStack } from '../src/engine/dom/fonts';

const ROOT = join(import.meta.dirname, '..');

describe('the interface font stack', () => {
  it('puts DotGothic16 behind Galmuri11 and behind a game’s own family, once', () => {
    expect(FONT_UI).toBe('Galmuri11');
    expect(fontStack(FONT_UI)).toBe("'Galmuri11', 'DotGothic16', 'Courier New', monospace");
    expect(fontStack('My Font')).toBe("'My Font', 'DotGothic16', 'Courier New', monospace");
    expect(fontStack('DotGothic16')).toBe("'DotGothic16', 'Courier New', monospace");
  });

  it('is the stylesheet’s default before the App writes it', () => {
    const css = readFileSync(join(ROOT, 'src/engine/dom/style.css'), 'utf8');
    expect(css).toContain(`--font-ui: ${fontStack(FONT_UI)};`);
  });
});

describe('tools/subset-font.py', () => {
  const python = (() => {
    try {
      execFileSync('python3', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  it.runIf(python)('refuses a Galmuri11.ttf that is not the pinned release’s, and writes nothing', () => {
    const shipped = readFileSync(join(ROOT, 'src/engine/dom/fonts/Galmuri11-latin.ttf'));
    const fake = join(mkdtempSync(join(tmpdir(), 'qnc-font-')), 'Galmuri11.ttf');
    writeFileSync(fake, 'not the font');
    const r = spawnSync('python3', ['tools/subset-font.py', 'galmuri', '--galmuri', fake], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/sha256 [0-9a-f]{64}, not the pinned release's/);
    expect(readFileSync(join(ROOT, 'src/engine/dom/fonts/Galmuri11-latin.ttf')).equals(shipped)).toBe(true);
  });
});
