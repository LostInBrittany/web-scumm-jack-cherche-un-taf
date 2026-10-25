// npm run bridge -- <init|serve|grant|revoke> (4.1.1): the reference Reality Bridge for the current game
// (bridge/src/cli.ts). The game's manifest comes from its content; nothing else of the game reaches the Bridge.
import { realityManifest } from '../src/engine/reality/manifest';
import { loadGameModule } from './game';
import { flushExit } from './flush';

const { game } = await loadGameModule();
// In this repository the Bridge is bridge/src/; in a game project, the separate package @quest-n-click/bridge.
type Cli = { main(args: string[], game?: { manifest: ReturnType<typeof realityManifest> }): Promise<number> };
const pkg = '@quest-n-click/bridge/cli';
const cli: Cli = await import('../bridge/src/cli').catch(() =>
  import(pkg).catch(() => {
    console.error('✖  the Reality Bridge is a separate package: npm install @quest-n-click/bridge');
    process.exit(1);
  }),
);
const code = await cli.main(process.argv.slice(2), { manifest: realityManifest(game) });
await flushExit(code);
