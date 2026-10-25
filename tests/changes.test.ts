// The CHANGELOG and LOG fragments (4.1.9, lot 0, tools/changes.ts): a branch writes changes/<slug>.md and the
// assembly on main folds them in order, under the right section, numbering the LOG entries after the last one. Only
// the Unreleased block is rebuilt: the rest of the page is byte for byte the same.
import { describe, expect, it } from 'vitest';
import { appendLog, lastLogNumber, logEntryOf, mergeChangelog, needsFragment, sectionsOf } from '../tools/changes';

const tail = '## 4.1.8 — 2026-10-07\n\n- older\n\n\n- a double blank line an old release keeps\n\n```\ncode\n```\n';
const changelog = `# Changelog

## Unreleased

An intro paragraph the release keeps.

### Fixed

- **An old fix** (4.1.9).

### Changes

- **An old change** (4.1.9).

${tail}`;

describe('fragments of the CHANGELOG', () => {
  it('reads the sections of a fragment, in any order, blank lines inside kept, the ends trimmed', () => {
    expect(sectionsOf('### Changes\n\n- a\n  continued\n\n  a second paragraph\n- b\n\n### Fixed\n- c\n')).toEqual({
      Changes: '- a\n  continued\n\n  a second paragraph\n- b',
      Fixed: '- c',
    });
  });
  it('refuses a heading the CHANGELOG does not use, and text before the first heading', () => {
    expect(() => sectionsOf('### Added\n- x\n')).toThrow(/### Breaking \| ### Fixed \| ### Changes/);
    expect(() => sectionsOf('- no heading\n')).toThrow(/starts with its heading/);
    expect(() =>
      mergeChangelog('# C\n\n## Unreleased\n\n### Security\n\n- s\n', [{ changelog: '### Fixed\n- x\n' }]),
    ).toThrow(/### Security/);
  });
  it('adds the bullets under their section of Unreleased, in the order given, keeps the intro, and leaves the rest byte for byte', () => {
    const out = mergeChangelog(changelog, [
      { changelog: '### Changes\n- **first** (4.1.9).\n  continued\n' },
      { changelog: '### Fixed\n- **second fix** (4.1.9).\n### Changes\n- **second** (4.1.9).\n' },
    ]);
    expect(out).toBe(`# Changelog

## Unreleased

An intro paragraph the release keeps.

### Fixed

- **An old fix** (4.1.9).

- **second fix** (4.1.9).

### Changes

- **An old change** (4.1.9).

- **first** (4.1.9).
  continued

- **second** (4.1.9).

${tail}`);
    expect(out.slice(out.indexOf('## 4.1.8'))).toBe(tail);
  });
  it('creates a missing section where it belongs: Breaking before Fixed before Changes', () => {
    const out = mergeChangelog('# C\n\n## Unreleased\n\n## 4.1.8 — d\n', [
      { changelog: '### Changes\n- c\n' },
      { changelog: '### Breaking\n- b\n' },
    ]);
    expect(out).toBe('# C\n\n## Unreleased\n\n### Breaking\n\n- b\n\n### Changes\n\n- c\n\n## 4.1.8 — d\n');
  });
  it('applied twice, adds the bullets twice: the assembly deletes the fragments it folded', () => {
    const once = mergeChangelog('# C\n\n## Unreleased\n', [{ changelog: '### Fixed\n- x\n' }]);
    expect(mergeChangelog(once, [{ changelog: '### Fixed\n- x\n' }])).toBe(
      '# C\n\n## Unreleased\n\n### Fixed\n\n- x\n\n- x\n',
    );
  });
  it('refuses a CHANGELOG without an Unreleased section', () => {
    expect(() => mergeChangelog('# C\n\n## 4.1.8\n', [{ changelog: '### Fixed\n- x\n' }])).toThrow(/Unreleased/);
  });
});

describe('fragments of the LOG', () => {
  const log =
    '# Exchange log (v3)\n\n## #116 · 2026-10-07 · Claude · proposal · a title\n\n- body\n\n→ next: Claude · x\n';
  it('numbers after the last entry, dates each with its fragment, keeps the → next line last', () => {
    expect(lastLogNumber(log)).toBe(116);
    const out = appendLog(log, [
      {
        title: '`feature/419-cadence`: fragments',
        body: '- one\n\n→ next: Claude · `feature/419-connector-sdk`',
        date: '2026-10-08T10:00:00+02:00',
      },
      { title: 'second', body: '- two', date: '2026-10-09' },
    ]);
    expect(out).toContain(
      '\n## #117 · 2026-10-08 · Claude · proposal · `feature/419-cadence`: fragments\n\n- one\n\n→ next: Claude · `feature/419-connector-sdk`\n',
    );
    expect(out).toContain('\n## #118 · 2026-10-09 · Claude · proposal · second\n\n- two\n');
    expect(lastLogNumber(out)).toBe(118);
    expect(out.endsWith('- two\n')).toBe(true);
  });
  it('reads a .log.md fragment: the title on the first line, the body after', () => {
    expect(logEntryOf('## t\n\n- a\n- b\n')).toEqual({ title: 't', body: '- a\n- b' });
    expect(() => logEntryOf('- no title\n')).toThrow(/## <title>/);
  });
});

describe('the check of a pull request', () => {
  it('asks a fragment of a branch that changes the code without one; a .log.md alone, the README or a docs change are none', () => {
    expect(needsFragment(['src/engine/core/engine.ts', 'tests/x.test.ts'])).toBe(true);
    expect(needsFragment(['src/engine/core/engine.ts', 'changes/fix-x.md'])).toBe(false);
    expect(needsFragment(['src/engine/core/engine.ts', 'changes/fix-x.log.md'])).toBe(true);
    expect(needsFragment(['src/engine/core/engine.ts', 'CHANGELOG.md'])).toBe(false); // a release branch
    expect(needsFragment(['wiki/en/create.rooms.md', 'docs/en/README.md', 'docs/dev/LOG.md', 'tests/x.test.ts'])).toBe(
      false,
    );
    expect(needsFragment(['games/demo/game.ts'])).toBe(true); // the bundled games ship
    expect(needsFragment(['src/x.ts', 'changes/README.md'])).toBe(true);
  });
});
