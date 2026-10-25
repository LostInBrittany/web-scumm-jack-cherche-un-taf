// The project's tsconfig brought to TypeScript 7 (4.1.8): what `quest-n-click migrate` rewrites. A module of its own so a
// test can import the function without running the migration (tools/migrate.ts runs at import).
import ts from '@typescript/typescript6';
/**
 * A project's tsconfig.json written before 4.1.8 has `baseUrl: "."` and non-relative `paths`, which TypeScript 7
 * refuses (TS5102, TS5090): the same configuration, said relative to the file. Returns the text to write, or null
 * when nothing is to change. Pure, so a test can read it.
 */
export function tsconfigWithoutBaseUrl(text: string): string | null {
  // tsconfig.json may carry comments and trailing commas: read as TypeScript reads it (the rewrite is plain JSON,
  // so a hand-written comment does not survive it; said by the command).
  const parsed = ts.parseConfigFileTextToJson('tsconfig.json', text);
  if (parsed.error || !parsed.config) return null;
  const j = parsed.config as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
  const co = j.compilerOptions;
  if (!co || co.baseUrl === undefined) return null;
  if (co.baseUrl !== '.' && co.baseUrl !== './') return null; // another root: a hand-written configuration, left alone
  delete co.baseUrl;
  if (co.paths)
    for (const [k, v] of Object.entries(co.paths))
      co.paths[k] = v.map((x) => (x.startsWith('.') || x.startsWith('/') ? x : `./${x}`));
  return `${JSON.stringify(j, null, 2)}\n`;
}
