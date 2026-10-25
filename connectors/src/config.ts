// The operator's configuration (4.1.9): secrets come from files next to it (mode 600), never from the command line or
// a log. An inline value (a string) is accepted for tests, a development shortcut wiki/en/bridge.connectors.md names.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** A secret: the file's content (trimmed), else the inline value; an error names what is missing, never its value. */
export function readSecret(
  baseDir: string,
  file: string | undefined,
  inline: string | undefined,
  what: string,
): string {
  if (file) return readFileSync(resolve(baseDir, file), 'utf8').trim();
  // A JSON number or object is refused at start, never taken for a secret every request then fails on.
  if (inline !== undefined && typeof inline !== 'string') throw new Error(`${what}: the secret must be a string`);
  if (inline) return inline;
  throw new Error(`${what}: no secret (name its file)`);
}
