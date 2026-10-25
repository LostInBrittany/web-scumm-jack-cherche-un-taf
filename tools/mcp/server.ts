// MCP server (stdio): the Studio operations (studio-server/src/ops/core.ts) as Model Context Protocol tools and resources, so
// any AI assistant (Claude Code, Claude Desktop, Cursor, Codex, Gemini CLI…) can read and edit a game the way the
// Studio does. Started by `npm run mcp` in the repository; the game is GAME / GAME_DIR as for every tool (tools/game.ts).
// `npm run mcp -- --server <url>` (4.2.3): the same tools on a hosted Studio, through its API with the CLI's token
// (`studio-server login --server <url>` first), every write meeting the API's checks.
// stdout carries the protocol: everything else goes to stderr. A failing operation is a tool error, never a crash.
import { readFileSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Nothing but JSON-RPC may reach stdout.
console.log = console.error;
console.info = console.error;
console.debug = console.error;

const { instructionsFor, toolsServer } = await import('./tools-server');

/** The engine's version, read from package.json (4.1.6): the server said 0.1.0 whatever the release. */
const VERSION = String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version);
const log = (line: string) => console.error(`[quest-n-click mcp] ${line}`);
const at = process.argv.indexOf('--server');
const remote = at >= 0 ? process.argv[at + 1] : undefined;

let server: ReturnType<typeof toolsServer>;
let where: string;
if (remote) {
  const { accessToken } = await import('../../studio-server/src/server/auth/device');
  const { httpBackend } = await import('../studio/http-backend');
  const url = remote.replace(/\/+$/, '');
  // Refreshed when it nears its end; "not logged in" said by accessToken itself.
  const token = () => accessToken(url);
  let client = 'ai';
  const backend = httpBackend({ api: `${url}/api`, token, author: () => client });
  const game = await backend.game();
  where = url;
  server = toolsServer(backend, {
    name: 'quest-n-click',
    version: VERSION,
    instructions: instructionsFor(game.title, url, true),
    log,
  });
  server.server.oninitialized = () => {
    client = server.server.getClientVersion()?.name ?? 'ai';
  };
} else {
  const { GAME, GAME_DIR, ROOT } = await import('../game');
  const { coreBackend } = await import('../studio/backend');
  const { createStudio } = await import('../../studio-server/src/ops/core');
  const studio = createStudio({ gameDir: GAME_DIR, root: ROOT });
  const DEV_URL = process.env.WEB_SCUMM_DEV_URL?.trim() || 'http://localhost:5173/';
  where = `game "${GAME}" (${GAME_DIR})`;
  server = toolsServer(
    (s) =>
      coreBackend(studio, { root: ROOT, devUrl: DEV_URL, author: () => s.server.getClientVersion()?.name ?? 'ai' }),
    { name: 'quest-n-click', version: VERSION, instructions: instructionsFor(GAME, GAME_DIR), log },
  );
}

process.on('uncaughtException', (e) => console.error('[quest-n-click mcp] uncaught:', e));
process.on('unhandledRejection', (e) => console.error('[quest-n-click mcp] unhandled:', e));

await server.connect(new StdioServerTransport());
console.error(`[quest-n-click mcp] ready: ${where}`);
