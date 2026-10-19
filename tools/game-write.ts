// How the authoring tools write a game's files (4.2.1, plan P6): through the Studio's journal, as one operation per
// run, never with writeFileSync beside it. The files are written together or not at all, durably, and recorded; a
// Studio open on the same game sees the operation. A file rewritten by someone else after the tool read it is a 409
// when the tool says what it read (`from`); otherwise the window starts at the write itself.
//
// Batch tools (ids, i18n) are not guarded: they rename paths, which changes the text of existing validation errors,
// so a comparison of messages before and after would refuse them for errors they did not add. They are journaled.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative } from 'node:path';
import { createStudio } from '../studio-server/src/ops/core';
import { GAME_DIR } from './game';

/** One Studio per game folder for the whole run: one journal opened, one look at the game. */
const studios = new Map<string, ReturnType<typeof createStudio>>();

/**
 * Writes `files` (absolute paths under the game folder; `null` removes one) as one operation named `what`. `from`:
 * the text the tool read and computed from (the 409 then covers the time since that read).
 */
export async function writeGame(
  what: string,
  files: { file: string; text: string | null; from?: string | null }[],
  o: { gameDir?: string; guard?: boolean } = {},
): Promise<string[]> {
  if (!files.length) return [];
  const dir = o.gameDir ?? GAME_DIR;
  let studio = studios.get(dir);
  if (!studio) {
    studio = createStudio({ gameDir: dir, author: `npm run ${process.env.npm_lifecycle_event ?? 'tool'}` });
    studios.set(dir, studio);
  }
  const paths = files.map((f) => {
    const r = relative(dir, f.file);
    if (r.startsWith('..') || isAbsolute(r)) throw new Error(`${f.file} is not in the game folder ${dir}`);
    return { path: r.split(/[\\/]/).join('/'), after: f.text, from: f.from };
  });
  return studio.writeFiles(what, paths, { undo: false, guard: o.guard ?? true });
}

/**
 * Writes one output of a tool: through the journal when it lands in the game folder (a report a tool keeps beside the
 * game, e.g. `prompts.md`), plainly when it goes elsewhere (`.cache/`, a folder named on the command line).
 */
export async function writeOutput(what: string, file: string, text: string): Promise<void> {
  const r = relative(GAME_DIR, file);
  if (!r.startsWith('..') && !isAbsolute(r)) {
    await writeGame(what, [{ file, text }], { guard: false });
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
