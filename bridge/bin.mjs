#!/usr/bin/env node
// quest-n-click-bridge <init|serve|grant|rotate|revoke|doctor|compact|migrate|tenant|backup|restore> (4.1.1; 4.1.10): the reference Reality Bridge on its own, for a game that
// is already built: `init --manifest=<game>/dist/reality-manifest.json`, then `serve`. wiki/en/bridge.install-run.md.
import { tsImport } from 'tsx/esm/api';

const { main } = await tsImport('./src/cli.ts', import.meta.url);
process.exitCode = await main(process.argv.slice(2));
