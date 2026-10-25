// `ship tag` tags the organisation's repository whatever its remote is called here, and refuses a tag whose commit has
// no CHANGELOG section of its version (4.5.3: v4.5.3-rc.1 went to the wrong remote first, then was spent on a commit
// without `## 4.5.3`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs tool without declarations
import { remoteFor } from '../tools/release/lib.mjs';
import { releaseNotes } from '../scripts/release-notes.mjs';

const REPO = 'Quest-n-Click/quest-n-click';
const lines = (...r: [string, string][]) =>
  r.flatMap(([n, u]) => [`${n}\t${u} (fetch)`, `${n}\t${u} (push)`]).join('\n');

describe('the remote ship tag pushes to', () => {
  it("is the organisation's repository: upstream when origin is a fork, origin when it is the repository", () => {
    const fork = lines(
      ['origin', 'git@github.com:LostInBrittany/quest-n-click.git'],
      ['upstream', 'git@github.com:Quest-n-Click/quest-n-click.git'],
    );
    expect(remoteFor(REPO, fork)).toBe('upstream');
    expect(remoteFor(REPO, lines(['origin', 'https://github.com/Quest-n-Click/quest-n-click.git']))).toBe('origin');
    expect(remoteFor(REPO, lines(['origin', 'https://github.com/quest-n-click/Quest-N-Click']))).toBe('origin');
    expect(
      remoteFor(
        REPO,
        lines(
          ['org', 'git@github.com:Quest-n-Click/quest-n-click.git'],
          ['origin', 'git@github.com:Quest-n-Click/quest-n-click'],
        ),
      ),
    ).toBe('origin');
  });

  it('is none for a fork alone or a repository whose name merely starts the same', () => {
    expect(remoteFor(REPO, lines(['origin', 'git@github.com:LostInBrittany/quest-n-click.git']))).toBeNull();
    expect(remoteFor(REPO, lines(['x', 'git@github.com:Quest-n-Click/quest-n-click-other.git']))).toBeNull();
    expect(remoteFor(REPO, '')).toBeNull();
  });

  it('is used for every fetch, look-up and push of ship tag, never a remote named in the code', () => {
    const ship = readFileSync('tools/release/ship.mjs', 'utf8');
    const tag = ship.slice(
      ship.indexOf('async function tag('),
      ship.indexOf('\n}\n', ship.indexOf('async function tag(')),
    );
    expect(tag).toContain('const remote = releaseRemote();');
    expect(tag).not.toMatch(/'origin'/);
    expect(tag).toContain("git(['push', remote, `refs/tags/${name}`]);");
  });
});

describe('ship tag and the CHANGELOG', () => {
  it('reads the section on the tagged commit before tagging, with the notes release.yml publishes', () => {
    const ship = readFileSync('tools/release/ship.mjs', 'utf8');
    const check = ship.indexOf("git(['show', `${full}:CHANGELOG.md`]");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(ship.indexOf('git(tagArgs('));
    expect(ship).toContain('if (!releaseNotes(changelog, name))');
    // An rc reads its version's section: no `## 4.5.3`, no v4.5.3-rc.2 either.
    expect(releaseNotes('## 4.5.2 Org\n\nx\n', 'v4.5.3-rc.2')).toBeNull();
    expect(releaseNotes('## 4.5.3 One pass\n\nx\n', 'v4.5.3-rc.2')).toContain('Release candidate rc.2 of 4.5.3');
  });
});
