// The MCP server of a game, over any `ToolBackend` (4.2.3 PR 5): its tools (those the backend can run, `toolsFor`) and
// its two resources (the game, a room). One definition for the three ways it runs: on stdio over the Studio core (the
// repository, `npm run mcp`), on stdio over a hosted Studio's API (`npm run mcp -- --server <url>`), and on a Studio
// Server's `/mcp` (Streamable HTTP, ADR 0029). A failing operation is a tool error, never a crash.
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ToolBackend, toolsFor } from '../studio/tools';

export interface ToolsServerOptions {
  name: string;
  version: string;
  instructions: string;
  /** Where a failing tool is said (stderr on stdio, the server's log on `/mcp`). */
  log?: (line: string) => void;
}

export function toolsServer(backend: ToolBackend | ((server: McpServer) => ToolBackend), o: ToolsServerOptions) {
  const server = new McpServer({ name: o.name, version: o.version }, { instructions: o.instructions });
  const b = typeof backend === 'function' ? backend(server) : backend;
  for (const t of toolsFor(b))
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        ...(Object.keys(t.input).length ? { inputSchema: t.input } : {}),
        ...(t.output ? { outputSchema: t.output } : {}),
        ...(t.annotations ? { annotations: t.annotations } : {}),
      },
      async (args: unknown) => {
        const r = await t.run(args ?? {}, b);
        if (r.isError) o.log?.(`${t.name}: ${r.content[0]?.text}`);
        return r;
      },
    );

  server.registerResource(
    'game',
    'webscumm://game',
    { title: 'Game overview', description: 'list_rooms as a resource (JSON).', mimeType: 'application/json' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await b.game(), null, 2) }],
    }),
  );

  server.registerResource(
    'room',
    new ResourceTemplate('webscumm://room/{id}', {
      list: async () => {
        try {
          const g = await b.game();
          return {
            resources: g.rooms.map((r) => ({
              uri: `webscumm://room/${r.id}`,
              name: r.name || r.id,
              mimeType: 'application/json',
            })),
          };
        } catch (e) {
          o.log?.((e as Error).message);
          return { resources: [] };
        }
      },
    }),
    { title: 'Room', description: 'get_room as a resource (JSON).', mimeType: 'application/json' },
    async (uri, { id }) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await b.room(String(id)), null, 2) },
      ],
    }),
  );
  return server;
}

/** What the assistant is told first: the game, and how to work on it (`hosted`: no documents, no test suite there). */
export const instructionsFor = (game: string, where: string, hosted = false) =>
  `web-scumm game "${game}" (${where}). A game is data: rooms in rooms/<id>.ts, geometry in layout/<id>.json, ` +
  'the script in storyboard.json, a shared log with the human in notes.json. Start with list_rooms and get_room; ' +
  (hosted
    ? 'this is a shared Studio: you write as your member, a part another member holds refuses your write (423), ' +
      'say what you need in a note. After any change run validate, then solve. '
    : 'learn the format with read_doc CONTENT_GUIDE. After any change run validate, then solve, then run_tests. ') +
  'Never invent coordinates: ask the human (add_note) to place things in the Studio.' +
  (hosted ? '' : ' Read AGENTS.md for the rules.');
