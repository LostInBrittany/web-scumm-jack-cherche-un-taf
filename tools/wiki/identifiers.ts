// The identifiers the documentation must give a destination (4.5.0 "Wiki", docs/dev/PLAN-4.5-WIKI.md §4.1, "By
// identifier"), generated from structured sources rather than typed by hand: every npm script of `package.json`
// (`npm run <name>`) and every MCP tool of the Studio's registry (`tools/studio/tools.ts`, read through its export,
// not its text). A page claims an identifier by listing it in its manifest `identifiers`. A2 lists the identifiers no
// page claims yet as gaps; the routes, the DSL commands, the variables and the error register come in A5.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../game';
import { TOOLS } from '../studio/tools';

export interface Identifier {
  /** As a reader would type it, and as a page lists it: `npm run validate`, `read_doc`. */
  id: string;
  source: 'npm-script' | 'mcp-tool';
}

export function generatedIdentifiers(root = ROOT): Identifier[] {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  return [
    ...Object.keys(pkg.scripts).map((s) => ({ id: `npm run ${s}`, source: 'npm-script' as const })),
    ...TOOLS.map((t) => ({ id: t.name, source: 'mcp-tool' as const })),
  ];
}
