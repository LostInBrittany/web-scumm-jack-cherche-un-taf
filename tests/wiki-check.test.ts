// `wiki -- check` and `wiki -- build --target wiki` (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1 and §4.5.6, phase
// A2) on a small fixture wiki (tests/fixtures/wiki/base: two ready pages, a ready troubleshooting page, a draft, a
// planned page linked from a ready one, the four generated indexes, an image). Each case copies it and breaks one
// thing: a planned or generated page with a file, a ready page without its twin, a URL off the convention, a ready
// how-to without questions, a broken anchor, a bare repository path, twins whose sections, links or blocks differ, a
// template without its twin, a glossary term naming an unknown page are errors; a link to a planned page is listed,
// not an error. One scanner reads the links for both sides: titled links, images, a linked image's outer link, never
// inside fenced or inline code. The build publishes the ready pages only (the drafts too with --preview, under a
// banner), rewrites the links for the wiki, heads each page with its twin and its status, copies the wiki's images,
// and empties only a folder it built itself.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { globToRegExp } from '../tools/ci-plan';
import { main, outProblem } from '../tools/wiki';
import { buildWiki, pageReview } from '../tools/wiki/build';
import { checkWiki, trackedFiles } from '../tools/wiki/check';
import type { Identifier } from '../tools/wiki/identifiers';
import type { Manifest } from '../tools/wiki/manifest';
import { classifyTarget, mapPage, parsePage, renderLink } from '../tools/wiki/page';

const BASE = resolve('tests/fixtures/wiki/base');
const TRACKED = trackedFiles();
const IDENTIFIERS: Identifier[] = [
  { id: 'npm run validate', source: 'npm-script' },
  { id: 'read_doc', source: 'mcp-tool' },
];
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

/** A copy of the fixture wiki, changed by `edit`, and its check report. */
function wiki(edit?: (dir: string, manifest: Manifest) => void) {
  const dir = tmp('wiki-check-');
  cpSync(BASE, dir, { recursive: true });
  if (edit) {
    const file = join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
    edit(dir, manifest);
    writeFileSync(file, JSON.stringify(manifest, null, 2));
  }
  return { dir, report: checkWiki({ wikiDir: dir, tracked: TRACKED, identifiers: IDENTIFIERS }) };
}
const page = (m: Manifest, id: string) => m.pages.find((p) => p.id === id)!;
const errorsOf = (edit: (dir: string, manifest: Manifest) => void) => wiki(edit).report.errors;
const append = (dir: string, rel: string, text: string) =>
  writeFileSync(join(dir, rel), `${readFileSync(join(dir, rel), 'utf8')}${text}`);

describe('wiki -- check, the work level', () => {
  it('passes the fixture, listing its link to a planned page without failing on it', () => {
    const { report } = wiki();
    expect(report.errors).toEqual([]);
    expect(report.plannedLinks).toEqual([
      { from: 'create.rooms', lang: 'en', to: 'create.dsl', anchor: undefined, line: 7 },
      { from: 'create.rooms', lang: 'fr', to: 'create.dsl', anchor: undefined, line: 7 },
    ]);
    expect(report.gaps).toContain('en/create.rooms.md line 7 links to create.dsl, planned');
  });

  it('lists a link to a planned page with its anchor, without checking the anchor', () => {
    const { report } = wiki((dir) => {
      append(dir, 'en/create.exits.md', '\nSee [the walk command](create.dsl.md#walk).\n');
      append(dir, 'fr/create.exits.md', '\nVoir [la commande walk](create.dsl.md#walk).\n');
    });
    expect(report.errors).toEqual([]);
    expect(report.gaps).toContain('fr/create.exits.md line 9 links to create.dsl#walk, planned');
  });

  it('lists the generated identifiers no page claims as gaps, not errors', () => {
    const { report } = wiki((_, m) => {
      page(m, 'create.rooms').identifiers.push('npm run validate');
    });
    expect(report.errors).toEqual([]);
    expect(report.gaps).toContain('1 MCP tools no page claims in its identifiers yet: read_doc');
    expect(report.gaps.some((g) => g.includes('npm scripts'))).toBe(false);
  });

  it('refuses a planned page that has a file', () => {
    const errors = errorsOf((dir) => writeFileSync(join(dir, 'en', 'create.dsl.md'), '# DSL\n'));
    expect(errors).toContain('create.dsl (planned): planned, yet en/create.dsl.md exists');
  });

  it('refuses a source file for a generated page, and a generated page no generator builds', () => {
    const errors = errorsOf((dir, m) => {
      writeFileSync(join(dir, 'fr', 'index.by-task.md'), '# Index\n');
      page(m, 'create.dsl').generated = true;
    });
    expect(errors).toContain(
      'index.by-task (generated): generated, yet fr/index.by-task.md exists (its source is the data)',
    );
    expect(errors.some((e) => e.startsWith('create.dsl (generated): no generator builds it'))).toBe(true);
  });

  it('refuses a ready page whose twin is missing', () => {
    const errors = errorsOf((dir) => unlinkSync(join(dir, 'fr', 'create.exits.md')));
    expect(errors).toContain('create.exits (ready): fr/create.exits.md is missing (both languages)');
  });

  it('refuses a file the manifest does not hold', () => {
    const errors = errorsOf((dir) => writeFileSync(join(dir, 'fr', 'stray.md'), '# Égaré\n'));
    expect(errors.some((e) => e.startsWith('fr/stray.md: not a page of the manifest'))).toBe(true);
  });

  it('refuses a URL off the convention', () => {
    const errors = errorsOf((_, m) => {
      page(m, 'create.exits').url.fr = 'FR-Create-Sorties';
    });
    expect(errors.some((e) => e.includes('the fr URL "FR-Create-Sorties" starts with "FR-Creer-"'))).toBe(true);
  });

  it('refuses a ready how-to without a question in each language', () => {
    const errors = errorsOf((_, m) => {
      page(m, 'create.rooms').questions.fr = [];
    });
    expect(errors).toContain('create.rooms (ready): a howto page asks at least one question in fr');
  });

  it('refuses a written page without appliesFrom or sources, and a source glob that matches nothing', () => {
    const errors = errorsOf((_, m) => {
      delete page(m, 'create.exits').versions;
      page(m, 'studio.notes').sources = [];
      page(m, 'create.dsl').sources = ['src/no-such-folder/**'];
    });
    expect(errors).toContain('create.exits (ready): versions.appliesFrom is required once a file exists');
    expect(errors).toContain('studio.notes (draft): sources is required once a file exists');
    expect(errors).toContain('create.dsl: the source "src/no-such-folder/**" matches no tracked file');
  });

  it('warns on a source glob that covers too many files', () => {
    const { report } = wiki((_, m) => {
      page(m, 'create.exits').sources = ['src/**/*.ts'];
    });
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => /the source "src\/\*\*\/\*\.ts" covers \d+ files/.test(w))).toBe(true);
  });

  it('refuses a broken anchor, an unknown page and an anchor not before a heading', () => {
    const errors = errorsOf((dir) =>
      append(
        dir,
        'en/create.exits.md',
        '\nSee [nothing](create.rooms.md#no-such-section), [a ghost](create.ghost.md) and [here](#nowhere).\n\n<a name="loose"></a>\nNo heading.\n',
      ),
    );
    expect(errors).toContain(
      'en/create.exits.md line 9: create.rooms.md#no-such-section is not a section of en/create.rooms.md',
    );
    expect(errors).toContain('en/create.exits.md line 9: links to create.ghost, which the manifest does not hold');
    expect(errors).toContain('en/create.exits.md line 9: #nowhere is not a section of this page');
    expect(errors).toContain('en/create.exits.md line 11: the anchor "loose" is not followed by a heading');
  });

  it('checks the links of a French page against the French twin', () => {
    const errors = errorsOf((dir) => {
      const rooms = join(dir, 'fr', 'create.rooms.md');
      writeFileSync(rooms, readFileSync(rooms, 'utf8').replace('create.exits.md#doors', 'create.exits.md#portes'));
    });
    expect(errors).toContain(
      'fr/create.rooms.md line 7: create.exits.md#portes is not a section of fr/create.exits.md',
    );
  });

  it('refuses a bare repository path, naming the form that works, and a file git does not track', () => {
    const errors = errorsOf((dir) => {
      append(dir, 'fr/create.exits.md', '\nVoir [le code](src/engine/core/save.ts) et [rien](../../src/no-such.ts).\n');
      append(dir, 'en/create.exits.md', '\nSee [the code](./src/engine/core/save.ts) and [far](../../../up.md).\n');
    });
    expect(errors).toContain(
      'fr/create.exits.md line 9: the link "src/engine/core/save.ts" resolves to wiki/fr/src/engine/core/save.ts: a repository file is written from the page\'s folder, ../../src/engine/core/save.ts',
    );
    expect(errors).toContain('fr/create.exits.md line 9: links to src/no-such.ts, which git does not track');
    expect(errors.some((e) => e.includes('"./src/engine/core/save.ts" resolves to wiki/en/src/'))).toBe(true);
    expect(errors).toContain('en/create.exits.md line 9: the link "../../../up.md" leaves the repository');
  });

  it('refuses an image of the wiki that does not exist', () => {
    const errors = errorsOf((dir) => unlinkSync(join(dir, 'images', 'room.png')));
    expect(errors).toContain('en/create.rooms.md line 19: the image images/room.png does not exist');
  });

  it('refuses ready twins whose section ids or link destinations differ', () => {
    const errors = errorsOf((dir) => {
      const file = join(dir, 'fr', 'create.exits.md');
      writeFileSync(file, readFileSync(file, 'utf8').replace('name="doors"', 'name="portes"'));
      const rooms = join(dir, 'fr', 'create.rooms.md');
      writeFileSync(rooms, readFileSync(rooms, 'utf8').replaceAll('create.exits.md#doors', 'create.exits.md#portes'));
    });
    expect(errors).toContain(
      'create.exits: the section ids differ between en and fr (only in en: doors; only in fr: portes)',
    );
    expect(errors).toContain(
      'create.rooms: the link destinations differ between en and fr (only in en: create.exits#doors; only in fr: create.exits#portes)',
    );
  });

  it('refuses ready twins whose structured blocks differ', () => {
    const errors = errorsOf((dir) => {
      const rooms = join(dir, 'fr', 'create.rooms.md');
      writeFileSync(
        rooms,
        readFileSync(rooms, 'utf8').replace('[!LIMIT id=no-diagonal]', '[!LIMIT id=sans-diagonale]'),
      );
    });
    expect(errors).toContain(
      'create.rooms: the structured blocks differ between en and fr (only in en: LIMIT:no-diagonal; only in fr: LIMIT:sans-diagonale)',
    );
  });

  it('refuses a template without its twin, and twins whose sections differ', () => {
    const errors = errorsOf((dir) => {
      mkdirSync(join(dir, '_templates'));
      writeFileSync(join(dir, '_templates', 'howto.en.md'), '# T\n\n<a name="steps"></a>\n\n## Steps\n');
      writeFileSync(join(dir, '_templates', 'howto.fr.md'), '# T\n\n<a name="etapes"></a>\n\n## Étapes\n');
      writeFileSync(join(dir, '_templates', 'reference.en.md'), '# T\n');
    });
    expect(errors).toContain('_templates/howto.en.md and howto.fr.md: the section ids differ');
    expect(errors).toContain('_templates/reference.en.md: its French twin reference.fr.md is missing');
  });

  it('refuses a glossary term naming a page the manifest does not hold', () => {
    const errors = errorsOf((dir) => {
      const file = join(dir, 'data', 'glossary.json');
      writeFileSync(file, readFileSync(file, 'utf8').replace('"create.dsl"', '"create.ghost"'));
    });
    expect(errors).toContain('data/glossary.json: the term lease names create.ghost, not a manifest page');
  });
});

describe('reading a page: one scanner for check and build', () => {
  it('finds section ids, page links (titled, ./, inside a linked image), images and blocks, never inside code', () => {
    const p = parsePage(readFileSync(join(BASE, 'en', 'create.rooms.md'), 'utf8'), 'en');
    expect(p.problems).toEqual([]);
    expect(p.sections).toEqual(['walkable-zones', 'checking']);
    expect(p.links.map((l) => [l.id, l.anchor, l.line])).toEqual([
      ['create.exits', 'doors', 7],
      ['create.dsl', undefined, 7],
      ['studio.notes', undefined, 17],
      ['create.exits', 'doors', 19],
      ['create.exits', undefined, 20],
    ]);
    expect(p.repoLinks.map((l) => l.path)).toEqual(['src/engine/core/save.ts', 'src/engine/core/save.ts']);
    expect(p.images.map((i) => i.path)).toEqual(['room.png', 'room.png']);
    expect(p.blocks).toEqual([
      {
        kind: 'LIMIT',
        id: 'no-diagonal',
        line: 10,
        body: ['A zone is a polygon; a curve is drawn with several points.'],
        fields: {},
      },
    ]);
  });

  it('closes a fence only on the same character, at least as long; and skips inline code of any length', () => {
    const md = [
      '~~~',
      '```',
      '[a](x.y.md)',
      '~~~~',
      '`` [b](inline.code.md) `` and `[c](also.code.md)` but [d](real.link.md)',
      '````',
      '```',
      '[e](fenced.code.md)',
    ].join('\n');
    const p = parsePage(md, 'en');
    expect(p.links.map((l) => l.id)).toEqual(['real.link']);
    expect(p.problems).toEqual(['a code fence is never closed']);
  });

  it('reads a link whose label breaks across one line of its paragraph, never across a blank line', () => {
    const md = [
      'See [the',
      'rooms](create.rooms.md#zones) and [the',
      'exits](create.exits.md).',
      '',
      '> [!LIMIT id=wrapped]',
      '> A limit naming [a',
      '> door](create.doors.md) inside a quote.',
      '',
      'A label [left open',
      '',
      'here](not.a.link.md) is no link.',
      '## A heading [cut',
      'off](not.either.md)',
      '- an item [cut',
      '- off](nor.this.md)',
    ].join('\n');
    const p = parsePage(md, 'en');
    expect(p.links.map((l) => [l.id, l.line])).toEqual([
      ['create.rooms', 1],
      ['create.exits', 1],
      ['create.doors', 6],
    ]);
    expect(p.blocks[0]!.body).toEqual(['A limit naming [a', 'door](create.doors.md) inside a quote.']);
    expect(p.problems).toEqual([]);
    const rewritten = mapPage(
      md,
      (l) => renderLink({ ...l, target: l.target.toUpperCase() }),
      (kind, id) => `[!${kind} id=${id}]`,
    );
    expect(rewritten.split('\n')).toHaveLength(md.split('\n').length);
    expect(rewritten).toContain('See [the\nrooms](CREATE.ROOMS.MD#ZONES) and [the\nexits](CREATE.EXITS.MD).');
    expect(rewritten).toContain('> A limit naming [a\n> door](CREATE.DOORS.MD) inside a quote.');
    expect(rewritten).toContain('here](not.a.link.md)');
  });

  it('resolves targets from the page folder, as GitHub does', () => {
    expect(classifyTarget('create.rooms.md#zones', 'fr')).toEqual({
      kind: 'page',
      id: 'create.rooms',
      anchor: 'zones',
    });
    expect(classifyTarget('./create.rooms.md', 'en')).toEqual({ kind: 'page', id: 'create.rooms', anchor: undefined });
    expect(classifyTarget('../../src/x.ts#L3', 'en')).toEqual({ kind: 'repo', path: 'src/x.ts', anchor: 'L3' });
    expect(classifyTarget('../images/a/b.png', 'fr')).toEqual({ kind: 'wiki-image', path: 'a/b.png' });
    expect(classifyTarget('../fr/create.rooms.md', 'en').kind).toBe('invalid');
    expect(classifyTarget('src/x.ts', 'en').kind).toBe('invalid');
    expect(classifyTarget('/src/x.ts', 'en').kind).toBe('invalid');
    expect(classifyTarget('https://example.org/a.md', 'en').kind).toBe('external');
  });

  it('matches source globs the way the manifest writes them, braces holding stars', () => {
    expect(globToRegExp('src/**/*.ts').test('src/engine/core/save.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/engine/core/save.ts')).toBe(false);
    expect(globToRegExp('tools/**').test('tools/wiki/check.ts')).toBe(true);
    expect(globToRegExp('LICENSE*').test('LICENSE-ASSETS')).toBe(true);
    expect(globToRegExp('src/studio/{notes,map-*}.ts').test('src/studio/map-tab.ts')).toBe(true);
    expect(globToRegExp('src/studio/{notes,map-*}.ts').test('src/studio/maps/x.ts')).toBe(false);
  });
});

describe('wiki -- build --target wiki', () => {
  const options = (outDir: string, preview: boolean, wikiDir = BASE) => ({
    wikiDir,
    outDir,
    manifest: wiki().report.manifest!,
    preview,
    productVersion: '4.5.0',
    docRevision: 'd0c',
    productCommit: 'c0ffee',
    identifiers: IDENTIFIERS,
  });
  const build = (preview: boolean) => {
    const out = tmp('wiki-build-');
    const files = buildWiki(options(out, preview));
    return { out, files, read: (f: string) => readFileSync(join(out, f), 'utf8') };
  };

  it('publishes the ready pages only: no planned nor draft page in the files or the sidebars', () => {
    const { files, read } = build(false);
    expect(files).toContain('en/EN-Create-Rooms.md');
    expect(files).toContain('fr/FR-Equipe-Ecriture-Refusee-423.md');
    expect(files.some((f) => f.includes('Studio-Notes'))).toBe(false);
    expect(files.some((f) => f.includes('DSL'))).toBe(false);
    for (const lang of ['en', 'fr']) {
      const sidebar = read(`${lang}/_Sidebar.md`);
      expect(sidebar).not.toMatch(/Studio-Notes|DSL/);
      expect(sidebar).toMatch(lang === 'en' ? /\[Rooms\]\(EN-Create-Rooms\)/ : /\[Salles\]\(FR-Creer-Salles\)/);
    }
    expect(files).toEqual(expect.arrayContaining(['Home.md', '_Footer.md', 'en/_Sidebar.md', 'fr/_Sidebar.md']));
  });

  it('rewrites links: pages to their URL, code to the product commit, images to the output, unpublished pages to text', () => {
    const { read, files } = build(false);
    const en = read('en/EN-Create-Rooms.md');
    expect(en).toContain('[a door](EN-Create-Exits#doors)');
    expect(en).toContain(
      '[save.ts](https://github.com/Quest-n-Click/quest-n-click/blob/c0ffee/src/engine/core/save.ts#L1)',
    );
    expect(en).toContain(
      '[the code](https://github.com/Quest-n-Click/quest-n-click/blob/c0ffee/src/engine/core/save.ts "save")',
    );
    expect(en).toContain('[the exits](EN-Create-Exits)');
    expect(en).toContain('every command is in the DSL (coming)');
    expect(en).toContain('Leave a note from the Studio (coming)');
    expect(en).toContain('[the zones](#walkable-zones)');
    expect(en).toContain('![A room](images/room.png "The hall")');
    expect(en).toContain('[![a badge](images/room.png)](EN-Create-Exits#doors "Exits")');
    expect(en).toContain('[still code](nowhere.md)');
    expect(en).toContain('[not a link](nowhere.md)');
    expect(en).toContain('> **Limit** · `no-diagonal`');
    expect(read('en/EN-Create-Exits.md')).toContain('a link written `[its zone](create.rooms.md#walkable-zones)` in');
    expect(read('fr/FR-Creer-Sorties.md')).toContain('[sa zone](FR-Creer-Salles#walkable-zones)');
    expect(files).toContain('images/room.png');
  });

  it('points a repository image at raw.githubusercontent.com at the product commit', () => {
    const { dir } = wiki((d) => {
      append(d, 'en/create.exits.md', '\n![the logo](../../public/og.png)\n');
      append(d, 'fr/create.exits.md', '\n![le logo](../../public/og.png)\n');
    });
    const out = tmp('wiki-build-');
    buildWiki(options(out, false, dir));
    expect(readFileSync(join(out, 'fr', 'FR-Creer-Sorties.md'), 'utf8')).toContain(
      '![le logo](https://raw.githubusercontent.com/Quest-n-Click/quest-n-click/c0ffee/public/og.png)',
    );
  });

  it('heads each page with one short line (twin, type, who read it, versions), and ends with its source', () => {
    const { read } = build(false);
    // The 4.5.1 audit (F17, F18): one line under the title, "published" and who read it, never a bare "ready".
    const en = read('en/EN-Create-Rooms.md');
    expect(en).toContain(
      '# Rooms\n\n> [Français](FR-Creer-Salles) · How-to · Published, no review recorded · Applies from: 4.5.0\n',
    );
    expect(en.split('\n')[2]).not.toMatch(/Status|Audience|Context/);
    const fr = read('fr/FR-Creer-Salles.md');
    expect(fr).toContain(
      "> [English](EN-Create-Rooms) · Procédure · Publiée, aucune relecture enregistrée · S'applique depuis : 4.5.0",
    );
    expect(fr).toContain('(https://github.com/Quest-n-Click/quest-n-click/edit/main/wiki/fr/create.rooms.md)');
  });

  it('folds the audience, the context and the statuses after the lead, before the first section', () => {
    const { read } = build(false);
    const en = read('en/EN-Create-Rooms.md');
    const fold = en.indexOf(
      '<details><summary>Audience, context, and the statuses of what this page rests on</summary>',
    );
    expect(fold).toBeGreaterThan(en.indexOf('> [Français]'));
    expect(fold).toBeLessThan(en.indexOf('<a name="walkable-zones"></a>'));
    expect(en).toContain('> Audience: author · Context: created project\n\n</details>');
    expect(read('fr/FR-Creer-Salles.md')).toContain('> Public : auteur · Contexte : projet créé');
  });

  it("names a page's review by its translation pairs' reviewers: a person, an AI, or nobody", () => {
    const ai = { name: 'claude', kind: 'ai', relation: 'author', date: '2026-10-24' } as const;
    const person = { name: 'wanoo', kind: 'human', relation: 'independent', date: '2026-10-24' } as const;
    const other = { name: 'other-ai', kind: 'ai', relation: 'independent', date: '2026-10-24' } as const;
    expect(pageReview('create.rooms', {})).toBe('none');
    expect(pageReview('create.rooms', { 'create.rooms#a': { reviewers: [ai] } })).toBe('author');
    expect(pageReview('create.rooms', { 'create.rooms#a': { reviewers: [ai, other] } })).toBe('independent');
    expect(
      pageReview('create.rooms', { 'create.rooms#a': { reviewers: [person] }, 'create.rooms#b': { reviewers: [ai] } }),
    ).toBe('partly');
    expect(
      pageReview('create.rooms', { 'create.rooms#a': { reviewers: [person] }, 'x.y#a': { reviewers: [ai] } }),
    ).toBe('person');
  });

  it('builds the four indexes from the published pages, their aliases, the identifiers and the glossary', () => {
    const { read } = build(false);
    const task = read('en/EN-Index-By-Task.md');
    expect(task).toContain('- How do I add a room? → [Rooms](EN-Create-Rooms)');
    expect(task).toContain('- scene → [Rooms](EN-Create-Rooms)');
    expect(task).not.toContain('note');
    expect(task).toContain('· Index · Generated from the published pages');
    expect(read('fr/FR-Index-Par-Symptome.md')).toContain(
      '- Pourquoi mon enregistrement est refusé avec 423 ? → [Écriture refusée : pan verrouillé (423)](FR-Equipe-Ecriture-Refusee-423)',
    );
    const ids = read('en/EN-Index-Identifiers.md');
    expect(ids).toContain('- `walkTo` → [Rooms](EN-Create-Rooms)');
    expect(ids).not.toContain('read_doc');
    const glossary = read('fr/FR-Index-Glossaire.md');
    expect(glossary).toContain('**bail** (aussi : verrou ; anglais : lease)');
    expect(glossary).toContain('→ [Écriture refusée : pan verrouillé (423)](FR-Equipe-Ecriture-Refusee-423)');
    expect(glossary).not.toContain('DSL');
  });

  it('lists a generated identifier under the published pages that claim it', () => {
    const { dir, report } = wiki((_, m) => {
      page(m, 'create.exits').identifiers.push('read_doc');
    });
    const out = tmp('wiki-build-');
    buildWiki({ ...options(out, false, dir), manifest: report.manifest! });
    expect(readFileSync(join(out, 'en', 'EN-Index-Identifiers.md'), 'utf8')).toContain(
      '- `read_doc` → [Exits](EN-Create-Exits)',
    );
  });

  it('builds no generated page while nothing is published', () => {
    const { report } = wiki((_, m) => {
      for (const p of m.pages) if (p.state === 'ready') p.state = 'draft';
    });
    const out = tmp('wiki-build-');
    const files = buildWiki({ ...options(out, false), manifest: report.manifest! });
    expect(files.filter((f) => f.endsWith('.md')).sort()).toEqual([
      'Home.md',
      '_Footer.md',
      '_Sidebar.md',
      'en/_Sidebar.md',
      'fr/_Sidebar.md',
    ]);
  });

  it('includes the drafts under a banner with --preview', () => {
    const { files, read } = build(true);
    expect(files).toContain('fr/FR-Studio-Notes.md');
    // The preview's banner first (§4.5.3: it points to the 4.4.0 documentation), then the draft's.
    expect(read('fr/FR-Studio-Notes.md')).toMatch(
      /^# Notes\n\n> \*\*Aperçu de la documentation de la 4\.5\.0\*\* : .*blob\/v4\.4\.0\/docs\/.*\n\n> \*\*Brouillon\*\* :/,
    );
    expect(read('en/EN-Create-Rooms.md')).toContain('**Preview of the 4.5.0 documentation**');
    expect(read('fr/FR-Studio-Notes.md')).toContain('Statut : brouillon');
    expect(read('en/_Sidebar.md')).toContain('[Notes](EN-Studio-Notes)');
    expect(read('en/EN-Create-Rooms.md')).toContain('[the Studio](EN-Studio-Notes)');
    expect(read('en/EN-Create-Rooms.md')).not.toContain('**Draft**');
  });

  it('fills the footer from the product version and the doc revision, and says edits are overwritten', () => {
    const { read } = build(false);
    const footer = read('_Footer.md');
    expect(footer).toContain("current documentation · documentation courante: quest'n'click 4.5.0 r1");
    expect(footer).toContain('https://quest-n-click.cleverapps.io/docs');
    expect(footer).toContain('`d0c`');
    expect(footer).toContain('overwritten at the next publication');
    expect(read('Home.md')).toMatch(/## Français[\s\S]*## English/);
  });

  it("gives Home a short bilingual sidebar and says the wiki's box filters titles, not text (F09, F23)", () => {
    const { read } = build(false);
    const side = read('_Sidebar.md');
    expect(side).toMatch(/^\*\*\[Accueil · Home\]\(Home\)\*\*\n\n\*\*Français\*\*[\s\S]*\*\*English\*\*/);
    expect(side).toContain('- [Index par symptôme](FR-Index-Par-Symptome)');
    expect(side).toContain('](EN-Index-By-Symptom)');
    const home = read('Home.md');
    expect(home).not.toMatch(/dans la recherche du wiki|in the wiki search/);
    expect(home).toContain('filters page and section titles only, not their text');
    expect(home).toContain('ne filtre que les titres des pages et des sections, pas leur texte');
    expect(home).toContain(
      'https://github.com/search?q=repo%3AQuest-n-Click%2Fquest-n-click%20path%3Awiki%2Fen%2F&type=code',
    );
  });

  it('empties its own previous build on a rebuild, keeping .git and removing a withdrawn page', () => {
    const { out } = build(true);
    mkdirSync(join(out, '.git'));
    writeFileSync(join(out, '.git', 'HEAD'), 'ref: refs/heads/master\n');
    expect(existsSync(join(out, 'en', 'EN-Studio-Notes.md'))).toBe(true);
    buildWiki(options(out, false));
    expect(existsSync(join(out, 'en', 'EN-Studio-Notes.md'))).toBe(false);
    expect(existsSync(join(out, '.git', 'HEAD'))).toBe(true);
    expect(existsSync(join(out, '.quest-n-click-wiki-build'))).toBe(true);
  });

  it('refuses to empty a folder that holds no build marker', () => {
    const out = tmp('wiki-build-');
    writeFileSync(join(out, 'Home.md'), 'not ours');
    expect(() => buildWiki(options(out, false))).toThrow(/holds no previous build/);
    expect(readFileSync(join(out, 'Home.md'), 'utf8')).toBe('not ours');
  });
});

describe('npm run wiki, the command line', () => {
  const quiet = () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    return () => {
      const said = err.mock.calls.map((c) => String(c[0])).join('\n');
      err.mockRestore();
      log.mockRestore();
      return said;
    };
  };

  it('refuses an option without its value, an unknown command and a build without --out', () => {
    for (const [args, message] of [
      [['build', '--target', 'wiki', '--out'], '--out needs a value'],
      [['build', '--target', 'wiki', '--out', '--preview'], '--out needs a value'],
      [['build', '--target=wiki', '--out='], '--out needs a value'],
      [['build', '--target', 'html', '--out', '/tmp/x'], 'build needs --target wiki'],
      [['deploy'], 'unknown command "deploy"'],
      [['publish'], 'publish needs --target wiki'],
      [['pages'], 'pages needs --out'],
      [['archive'], 'archive needs --out'],
    ] as const) {
      const done = quiet();
      expect(main(args), args.join(' ')).toBe(2);
      expect(done()).toContain(message);
    }
  });

  it('refuses an output folder inside the working tree, except under .cache/', () => {
    expect(outProblem(resolve('wiki-out'))).toMatch(/inside the repository's working tree/);
    expect(outProblem(resolve('.'))).toMatch(/inside/);
    expect(outProblem(resolve('.cache/wiki'))).toBeUndefined();
    expect(outProblem(join(tmpdir(), 'wiki'))).toBeUndefined();
    const done = quiet();
    expect(main(['build', '--target', 'wiki', '--out', 'wiki-out', `--wiki=${BASE}`])).toBe(1);
    expect(done()).toContain('inside the repository');
    expect(existsSync(resolve('wiki-out'))).toBe(false);
  });

  it('builds the fixture into a fresh folder', () => {
    const out = join(tmp('wiki-cli-'), 'out');
    const done = quiet();
    expect(main(['build', '--target', 'wiki', '--out', out, `--wiki=${BASE}`, '--product-commit', 'c0ffee'])).toBe(0);
    done();
    expect(readFileSync(join(out, 'en', 'EN-Create-Rooms.md'), 'utf8')).toContain('/blob/c0ffee/src/');
  });
});
