// The generated reference pages (4.5.0 "Wiki", lot B11; tools/wiki/generated.ts, generators.ts, ref-*.ts): the
// repository's pages are exactly what their generators give from the code and `wiki/data/` (no drift, both languages,
// the manifest's identifiers too), and each generator fails on the data and the code disagreeing: an npm script with no
// description or a described one gone, a Studio route or an MCP tool nobody describes, a CLI option the code does not
// read, an error code the code no longer raises. The output is the same twice, and a Windows checkout (CRLF) reads the
// same sources.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { TOOLS } from '../tools/studio/tools';
import { trackedFiles } from '../tools/wiki/check';
import {
  type GenContext,
  type Generator,
  prose,
  sectionId,
  withGenerated,
  withPageIdentifiers,
} from '../tools/wiki/generated';
import { GENERATORS, generatedProblems } from '../tools/wiki/generators';
import { readManifest } from '../tools/wiki/manifest';
import { cliGenerator, listedSubcommands } from '../tools/wiki/ref-cli';
import { bridgeErrors, errorsGenerator, solverStatuses, studioErrors } from '../tools/wiki/ref-errors';
import { mcpGenerator } from '../tools/wiki/ref-mcp';
import { projectScripts, repositoryScripts, scriptsGenerator } from '../tools/wiki/ref-scripts';
import { studioApiGenerator, tableRoutes } from '../tools/wiki/ref-studio-api';
import { supportGenerator } from '../tools/wiki/ref-support';

const ROOT = resolve(import.meta.dirname, '..');
const WIKI = join(ROOT, 'wiki');
const tracked = trackedFiles(ROOT);
const ctx: GenContext = { root: ROOT, wikiDir: WIKI, tracked };

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
/** A copy of wiki/data/ whose one file is changed by `edit`: the generator then reads the copy. */
function withData(file: string, edit: (d: Record<string, unknown>) => void): GenContext {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-gen-'));
  temps.push(dir);
  cpSync(join(WIKI, 'data'), join(dir, 'data'), { recursive: true });
  const data = JSON.parse(readFileSync(join(dir, 'data', file), 'utf8')) as Record<string, unknown>;
  edit(data);
  writeFileSync(join(dir, 'data', file), JSON.stringify(data));
  return { root: ROOT, wikiDir: dir, tracked };
}
const problemsOf = (g: Generator, c: GenContext) => g.build(c).problems;

describe('the repository’s generated pages', { timeout: 300_000 }, () => {
  it('are what their generators give, in both languages, with their identifiers, and the data agrees with the code', () => {
    const { manifest, errors } = readManifest(WIKI);
    expect(errors).toEqual([]);
    expect(generatedProblems(ctx, manifest!)).toEqual([]);
  });

  it('come out the same twice (deterministic)', () => {
    for (const g of GENERATORS) expect(g.build(ctx).sections, g.page).toEqual(g.build(ctx).sections);
  });

  it('write each region between its two markers, and refuse a page without them', () => {
    expect(withGenerated('a\n<!-- generated:begin -->\nold\n<!-- generated:end -->\nb', 'new').text).toBe(
      'a\n<!-- generated:begin -->\n\nnew\n\n<!-- generated:end -->\nb',
    );
    expect(withGenerated('no markers', 'x').problem).toMatch(/once, around its generated part/);
    expect(
      withGenerated('<!-- generated:begin --><!-- generated:end --><!-- generated:end -->', 'x').problem,
    ).toBeDefined();
  });

  it('keep a placeholder visible outside code, and code spans as written', () => {
    expect(prose('writes layout/<id>.json, `<id>` stays')).toBe('writes layout/&lt;id>.json, `<id>` stays');
    expect(sectionId('test:mutation:core')).toBe('test-mutation-core');
  });

  it('set one page’s identifiers in the manifest and keep every other byte', () => {
    const text = readFileSync(join(WIKI, 'manifest.json'), 'utf8');
    const after = withPageIdentifiers(text, 'studio.mcp-tools', ['a', 'b']);
    const page = (JSON.parse(after) as { pages: { id: string; identifiers: string[] }[] }).pages.find(
      (p) => p.id === 'studio.mcp-tools',
    );
    expect(page?.identifiers).toEqual(['a', 'b']);
    expect(withPageIdentifiers(after, 'studio.mcp-tools', page!.identifiers)).toBe(after);
  });
});

describe('npm scripts (reference.npm-scripts)', () => {
  it('reads the repository’s scripts and the ones `quest-n-click create` writes', () => {
    expect(Object.keys(repositoryScripts(ROOT)).length).toBeGreaterThan(100);
    expect(projectScripts(ROOT)).toEqual({
      dev: 'quest-n-click dev',
      studio: 'quest-n-click studio',
      assets: 'quest-n-click assets',
      verify: 'quest-n-click verify',
      build: 'quest-n-click build',
      release: 'quest-n-click release',
      preview: 'quest-n-click preview',
      'quest-n-click': 'quest-n-click',
    });
  });

  it('reads a Windows checkout (CRLF) the same way', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiki-gen-crlf-'));
    temps.push(dir);
    cpSync(join(ROOT, 'package.json'), join(dir, 'package.json'));
    cpSync(join(ROOT, 'cli'), join(dir, 'cli'), { recursive: true });
    const f = join(dir, 'cli', 'create.mjs');
    writeFileSync(f, readFileSync(f, 'utf8').replace(/\n/g, '\r\n'));
    expect(projectScripts(dir)).toEqual(projectScripts(ROOT));
  });

  it('fails on a script with no description, and on a described script that is gone', () => {
    const missing = withData('npm-scripts.json', (d) => {
      d.repository = (d.repository as { name: string }[]).filter((s) => s.name !== 'validate');
      d.project = (d.project as { name: string }[]).filter((s) => s.name !== 'verify');
    });
    expect(problemsOf(scriptsGenerator, missing).join('\n')).toMatch(
      /the script validate of package.json has no description/,
    );
    expect(problemsOf(scriptsGenerator, missing).join('\n')).toMatch(
      /the script verify of cli\/create.mjs has no description/,
    );
    const gone = withData('npm-scripts.json', (d) => {
      const list = d.repository as { name: string }[];
      list.push({ ...list[0]!, name: 'no-such-script' });
    });
    expect(problemsOf(scriptsGenerator, gone).join('\n')).toMatch(
      /no-such-script is described, and package.json has no such script/,
    );
  });
});

describe('the Studio API (studio.api)', () => {
  it('reads every route of the shared table', () => {
    expect(tableRoutes().map((r) => `${r.method} ${r.re.source}`)).toContain('GET ^\\/game$');
  });

  it('fails on a table route nobody describes, and on a described route the code does not serve', () => {
    const c = withData('studio-api.json', (d) => {
      const routes = d.routes as { method: string; path: string }[];
      d.routes = routes.filter((r) => !(r.method === 'GET' && r.path === '/game'));
      (d.routes as unknown[]).push({ ...routes[0]!, method: 'DELETE', path: '/no-such-route' });
    });
    const p = problemsOf(studioApiGenerator, c).join('\n');
    expect(p).toMatch(/the route GET \^\\\/game\$ of studio-server\/src\/ops\/routes.ts has no description/);
    expect(p).toMatch(/DELETE \/no-such-route is not a route of studio-server\/src\/ops\/routes.ts/);
  });
});

describe('the MCP tools (studio.mcp-tools)', () => {
  it('fails on a tool or a field with no French text, and on French text for a tool that is gone', () => {
    const c = withData('mcp-tools.json', (d) => {
      const tools = d.tools as Record<string, { fields: Record<string, string> }>;
      delete tools.validate;
      delete tools.get_room!.fields.id;
      tools.no_such_tool = { ...tools.list_rooms!, fields: {} };
    });
    const p = problemsOf(mcpGenerator, c).join('\n');
    expect(p).toMatch(/the tool validate has no French title and description/);
    expect(p).toMatch(/the field id of get_room has no French description/);
    expect(p).toMatch(/the registry has no tool no_such_tool any more/);
  });

  it('gives a section to every tool of the registry', () => {
    const en = mcpGenerator.build(ctx).sections!.en;
    for (const t of TOOLS) expect(en).toContain(`<a name="${sectionId(t.name)}"></a>`);
  });
});

describe('the command-line tools (reference.cli)', () => {
  it('reads the subcommands where the code lists them', () => {
    expect(listedSubcommands(ROOT, 'quest-n-click')).toEqual(expect.arrayContaining(['create', 'build', 'help']));
    expect(listedSubcommands(ROOT, 'quest-n-click-bridge')).toEqual(
      expect.arrayContaining(['init', 'serve', 'restore']),
    );
    expect(listedSubcommands(ROOT, 'quest-n-click-connector')).toEqual(['email', 'telnet', 'ssh', 'open-badge']);
    expect(listedSubcommands(ROOT, 'quest-n-click-studio-server')).toEqual(expect.arrayContaining(['serve', 'gc']));
  });

  it('fails on a subcommand the code has and the data lacks, and on an option the code does not read', () => {
    const c = withData('cli.json', (d) => {
      const cli = (d.clis as { id: string; commands: { name: string; options?: unknown[] }[] }[]).find(
        (x) => x.id === 'quest-n-click',
      )!;
      cli.commands = cli.commands.filter((k) => k.name !== 'doctor');
      const build = cli.commands.find((k) => k.name === 'build')!;
      build.options = [...(build.options ?? []), { flag: '--no-such-option', description: { en: 'x', fr: 'x' } }];
    });
    const p = problemsOf(cliGenerator, c).join('\n');
    expect(p).toMatch(/quest-n-click doctor is in the code and has no description/);
    expect(p).toMatch(/the option --no-such-option is not read/);
  });
});

describe('the error register (reference.error-codes)', () => {
  it('reads a StudioError’s message and status, 400 by default, and a computed message as such', () => {
    const r = studioErrors(
      'x.ts',
      [
        "throw new StudioError('no such room', 404);",
        'throw new StudioError(`room ${id} is busy`, 423);',
        "throw new StudioError('`path` is required');",
        'throw new StudioError(v.failed, 422);',
      ].join('\n'),
    );
    expect(r.map((e) => [e.status, e.message])).toEqual([
      [404, 'no such room'],
      [423, 'room … is busy'],
      [400, '`path` is required'],
      [422, undefined],
    ]);
  });

  it('reads a BridgeError’s status, code and message', () => {
    expect(bridgeErrors('b.ts', "throw new BridgeError(429, 'rate', 'too many requests');")).toEqual([
      { status: 429, code: 'rate', message: 'too many requests', file: 'b.ts' },
    ]);
  });

  it('lists only codes the code raises: a described status or code that is gone fails', () => {
    const c = withData('errors.json', (d) => {
      (d.studio as unknown[]).push({ status: 418, description: { en: 'x', fr: 'x' } });
      (d.bridge as unknown[]).push({ status: 418, code: 'teapot', description: { en: 'x', fr: 'x' } });
      (d.solver as unknown[]).push({ status: 'no_such_status', description: { en: 'x', fr: 'x' } });
    });
    const p = problemsOf(errorsGenerator, c).join('\n');
    expect(p).toMatch(/the Studio no longer raises a StudioError with 418/);
    expect(p).toMatch(/the Bridge no longer raises 418 teapot/);
    expect(p).toMatch(/has no status no_such_status any more/);
    expect(solverStatuses(ROOT)).toEqual(expect.arrayContaining(['solved', 'truncated', 'checkpoint_mismatch']));
  });
});

describe('the support matrix (reference.support-matrix)', () => {
  it('gives every surface of the status registry its section, in both languages', () => {
    const contracts = JSON.parse(readFileSync(join(ROOT, 'docs/dev/contracts.json'), 'utf8')) as {
      contracts: Record<string, unknown>;
    };
    const s = supportGenerator.build(ctx).sections!;
    for (const id of Object.keys(contracts.contracts)) {
      expect(s.en).toContain(`<a name="${id}"></a>`);
      expect(s.fr).toContain(`<a name="${id}"></a>`);
    }
  });
});
