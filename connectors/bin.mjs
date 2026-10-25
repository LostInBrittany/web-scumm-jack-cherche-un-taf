#!/usr/bin/env node
// quest-n-click-connector <email|telnet|ssh|open-badge> --config <file.json> (4.1.9): one connector of the world outside, as
// its own process, from the repository's TypeScript sources through tsx. The package runs src/run.mjs, bundled
// (scripts/pack.mjs). wiki/en/bridge.connectors.md.
import { tsImport } from 'tsx/esm/api';

const { main } = await tsImport('./src/run.ts', import.meta.url);
process.exitCode = await main(process.argv.slice(2));
