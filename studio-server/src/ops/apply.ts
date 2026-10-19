// Applies a patch downloaded from the Studio demo ("Download patch") to the current game, through the Studio core:
// the same writes the dev-server Studio would have made (texts into rooms/<id>.ts, layouts, storyboard.json, notes).
//   npm run studio-apply patch.json            (GAME / GAME_DIR select the game, as for every tool)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStudio, type Studio } from './core';
import type { StudioPatch, StudioPatchFile } from '../../../tools/studio/types';

export interface ApplySummary {
  applied: number;
  unchanged: number;
  failed: { patch: StudioPatch; error: string }[];
  /** One line per patch, in order. */
  log: string[];
}

function describe(p: StudioPatch): string {
  switch (p.kind) {
    case 'text':
      return `${p.room} ${p.path}: ${p.value === null ? 'delete' : JSON.stringify(p.value.length > 60 ? p.value.slice(0, 58) + '…' : p.value)}`;
    case 'layout':
      return `${p.room} layout`;
    case 'entity':
      return `${p.room} add ${p.entity.kind} ${p.entity.id}`;
    case 'storyboard':
      return 'storyboard';
    case 'note':
      return `note about "${p.note.about}" by ${p.note.author}`;
    case 'note-edit':
      return `edit note ${p.id}`;
    case 'note-delete':
      return `delete note ${p.id}`;
  }
}

/** Reads and checks a patch file's content. */
export function parsePatchFile(raw: unknown): StudioPatchFile {
  const f = raw as StudioPatchFile;
  if (!f || f.format !== 'web-scumm-studio-patch' || !Array.isArray(f.patches))
    throw new Error('not a Studio patch (expected { format: "web-scumm-studio-patch", patches: [...] })');
  return f;
}

/** Applies every patch in order; a patch that fails is reported and the others still apply. */
export async function applyPatches(patches: StudioPatch[], studio: Studio = createStudio()): Promise<ApplySummary> {
  const sum: ApplySummary = { applied: 0, unchanged: 0, failed: [], log: [] };
  for (const p of patches) {
    try {
      let changed = true;
      switch (p.kind) {
        case 'text':
          changed = (await studio.setText(p.room, p.path, p.value)).changed;
          break;
        case 'layout':
          await studio.setLayout(p.room, p.layout);
          break;
        case 'entity':
          await studio.addEntity(p.room, p.entity);
          break;
        case 'storyboard':
          changed = (await studio.setStoryboard(p.storyboard)).changed;
          break;
        case 'note':
          await studio.addNote({ about: p.note.about, author: p.note.author, text: p.note.text });
          break;
        case 'note-edit':
          await studio.editNote(p.id, { text: p.text, about: p.about });
          break;
        case 'note-delete':
          await studio.deleteNote(p.id);
          break;
        default:
          throw new Error(`unknown patch kind: ${(p as { kind?: string }).kind}`);
      }
      if (changed) sum.applied++;
      else sum.unchanged++;
      sum.log.push(`${changed ? '✔' : '='} ${describe(p)}`);
    } catch (e) {
      sum.failed.push({ patch: p, error: (e as Error).message });
      sum.log.push(`✘ ${describe(p)}: ${(e as Error).message}`);
    }
  }
  return sum;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: npm run studio-apply <patch.json>');
    process.exit(2);
  }
  (async () => {
    const file = parsePatchFile(JSON.parse(readFileSync(resolve(arg), 'utf8')));
    const studio = createStudio();
    if (file.game && file.game !== studio.gameId)
      console.warn(`⚠ the patch was made on "${file.game}", the current game is "${studio.gameId}"`);
    const sum = await applyPatches(file.patches, studio);
    for (const l of sum.log) console.log(l);
    console.log(`${sum.applied} applied, ${sum.unchanged} unchanged, ${sum.failed.length} failed (${studio.gameDir}).`);
    if (sum.failed.length) process.exit(1);
  })().catch((e) => {
    console.error(`✘ ${(e as Error).message}`);
    process.exit(1);
  });
}
