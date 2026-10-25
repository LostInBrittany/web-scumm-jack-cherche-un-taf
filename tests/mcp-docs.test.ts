// read_doc's exact compatibility (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.3.2, phase A4), through the real stdio
// MCP server (tools/mcp/server.ts) and the SDK's client, in the repository. The fixture
// tests/fixtures/mcp/read_doc-4.4.0.json holds read_doc's input schema as the 4.4.0 server (c00b44fc) served it, the
// eight calls a 4.4.0 client makes, and each page's size at 4.4.0.
//   - The 4.4.0 schema is included in today's: the same properties keep their type and enum, and `required` is not
//     widened. `name` stops being required: a client that always sends it (every 4.4.0 client, since the schema
//     required it) is served exactly as before; a client that sends nothing now gets an explicit tool error ("give
//     either name … or id") instead of a schema error. Both are refusals; neither is a silent choice.
//   - Required since the switch-over (C2): each of the eight calls is accepted and answers one text block, the
//     concatenation `wiki/legacy.json` orders (tools/wiki/docs-load.ts `legacyDoc`), holding every old `##` heading of
//     docs/en/<NAME>.md at 4.4.0 or its declared rewrite (its destinations in wiki/coverage.json, each section's
//     heading, or every heading of a whole page), within 1.5 × its 4.4.0 size, with no structured content (the 4.4.0
//     result shape) and no provenance in the text; arguments beside `name` are ignored, as 4.4.0's schema stripped them.
//   - search_docs and list_docs are offered; read_doc by id reads the wiki through the loader.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEGACY_BYTES_4_4_0, splitSections } from '../tools/wiki/docs';
import { legacyDoc, repositoryDocs } from '../tools/wiki/docs-load';
import { readCoverage } from '../tools/wiki/coverage';

const ROOT = resolve(__dirname, '..');
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/mcp/read_doc-4.4.0.json'), 'utf8')) as {
  inputSchema: { properties: Record<string, Record<string, unknown>>; required: string[] };
  calls: { name: string }[];
  bytes4_4_0: Record<string, number>;
};
type Result = {
  content: { type: string; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};
let client: Client;

beforeAll(async () => {
  client = new Client({ name: 'docs-compat-test', version: '0' });
  await client.connect(
    new StdioClientTransport({
      command: join(ROOT, 'node_modules', '.bin', 'tsx'),
      args: [join(ROOT, 'tools', 'mcp', 'server.ts')],
      cwd: ROOT,
      env: { ...getDefaultEnvironment(), GAME: 'demo' },
      stderr: 'pipe',
    }),
  );
}, 30000);
afterAll(async () => {
  await client?.close();
});
const call = async (name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })) as Result;

describe('read_doc, compatible with 4.4.0', () => {
  it('includes the 4.4.0 schema: same properties, same types and enum, required not widened', async () => {
    const { tools } = await client.listTools();
    const now = tools.find((t) => t.name === 'read_doc')!.inputSchema as {
      properties: Record<string, Record<string, unknown>>;
      required?: string[];
    };
    for (const [key, old] of Object.entries(FIXTURE.inputSchema.properties)) {
      expect(now.properties[key]?.type, key).toBe(old.type);
      expect(now.properties[key]?.enum, key).toEqual(old.enum);
    }
    for (const r of now.required ?? []) expect(FIXTURE.inputSchema.required).toContain(r);
    expect(Object.keys(now.properties).sort()).toEqual(['cursor', 'id', 'lang', 'maxChars', 'name', 'section']);
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['search_docs', 'list_docs', 'read_doc']));
  }, 30000);

  it('answers the eight 4.4.0 calls with one text block: the legacy concatenation, within 1.5 × its 4.4.0 size', async () => {
    expect(FIXTURE.calls).toHaveLength(8);
    // The bound the loader applies is the fixture's: the 4.4.0 sizes, recorded once.
    expect(LEGACY_BYTES_4_4_0).toEqual(FIXTURE.bytes4_4_0);
    for (const args of FIXTURE.calls) {
      const r = await call('read_doc', args);
      expect(r.isError, args.name).toBeFalsy();
      expect(r.content).toHaveLength(1);
      expect(r.content[0]!.type).toBe('text');
      const text = r.content[0]!.text;
      expect(text).toBe(legacyDoc(ROOT, args.name));
      expect(Buffer.byteLength(text), args.name).toBeLessThanOrEqual(1.5 * FIXTURE.bytes4_4_0[args.name]!);
      expect(text).not.toContain("quest'n'click documentation ·");
      expect(r.structuredContent).toBeUndefined();
    }
  }, 60000);

  it('holds every old `##` heading of the eight pages, or its declared rewrite (its destinations in the matrix)', () => {
    const coverage = readCoverage(join(ROOT, 'wiki')).coverage!;
    const set = repositoryDocs(ROOT);
    const headingOf = (text: string) => text.split('\n').find((l) => /^#{1,6}\s/.test(l));
    /** The headings a destination stands for: its section's, or every heading of a whole page. */
    const headings = (d: string) => {
      const [id, section] = d.split('#') as [string, string | undefined];
      const sections = splitSections(set.pages[`en/${id}`] ?? '');
      expect(sections.length, d).toBeGreaterThan(0);
      return sections.filter((s) => section === undefined || s.id === section).map((s) => headingOf(s.text));
    };
    for (const { name } of FIXTURE.calls) {
      const text = legacyDoc(ROOT, name);
      const lines = new Set(text.split('\n'));
      const rows = coverage.rows.filter((r) => r.file === `docs/en/${name}.md` && r.level === 2);
      expect(rows.length, name).toBeGreaterThan(0);
      for (const r of rows) {
        if (lines.has(`## ${r.heading}`)) continue;
        expect(r.decision, r.key).not.toBe('drop');
        for (const d of r.destinations)
          for (const h of headings(d)) if (h) expect(lines.has(h), `${r.key} → ${d}: ${h}`).toBe(true);
      }
    }
  });

  it('ignores the arguments beside name, as 4.4.0 did', async () => {
    const engine = legacyDoc(ROOT, 'ENGINE');
    for (const extra of [{ lang: 'fr' }, { maxChars: 10 }]) {
      const r = await call('read_doc', { name: 'ENGINE', ...extra });
      expect(r.isError).toBeFalsy();
      expect(r.content).toEqual([{ type: 'text', text: engine }]);
    }
  }, 30000);

  it('refuses nothing silently: neither, or both, is an explicit tool error', async () => {
    for (const args of [{}, { name: 'ENGINE', id: 'create.rooms' }]) {
      const r = await call('read_doc', args);
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toContain('give either name (one of the 8 legacy pages) or id, not both');
    }
  }, 30000);
});

describe('the new tools on the repository', () => {
  it('list_docs and search_docs answer from wiki/, a repository preview', async () => {
    const list = await call('list_docs', {});
    expect(list.isError).toBeFalsy();
    expect(list.structuredContent).toMatchObject({ provenance: { source: 'repository' } });
    const search = await call('search_docs', { query: 'zzzz qqqq xxyyzz' });
    expect(search.structuredContent).toMatchObject({ results: [], note: 'no confident match' });
    const byId = await call('read_doc', { id: 'create.no-such-page' });
    expect(byId.isError).toBe(true);
    expect(byId.content[0]!.text).toContain('no page "create.no-such-page"');
  }, 30000);
});
