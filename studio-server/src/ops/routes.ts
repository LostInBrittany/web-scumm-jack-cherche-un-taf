// The Studio API's routes (docs/en/STUDIO.md) and the checks of their bodies, shared by the dev server's plugin
// (tools/studio/plugin.ts) and the Studio Server (4.2.1): one table, so both serve the same API.
import type { Point } from '../../../src/engine/core/types.ts';
import type { AddEntity, EntityKind, NoteEdit } from '../../../tools/studio/types.ts';
import type { Studio } from './core.ts';
import { StudioError } from './errors.ts';

/** A request body once known to be a JSON object (an array passes too, as before: its fields are just absent). */
type Body = Readonly<Record<string, unknown>>;
export const isBody = (v: unknown): v is Body => v !== null && typeof v === 'object';
export type Handler = (m: RegExpMatchArray, body: Body, ctx: { baseUrl: string }) => Promise<unknown> | unknown;

const ENTITY_KINDS: readonly EntityKind[] = ['prop', 'hotspot', 'actor'];
const isKind = (v: unknown): v is EntityKind => ENTITY_KINDS.some((k) => k === v);
const isPoint = (v: unknown): v is Point =>
  Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
/** A string field, '' when it is anything else (core.ts then refuses it as missing, with its own message). */
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const optText = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** set_text: core.ts checks `path`, then `value`; a wrong-typed `value` gets the same refusal here. */
export function textEdit(b: Body): { path: string; value: string | null } {
  const path = text(b.path);
  const value = b.value;
  if (value === null || typeof value === 'string') return { path, value };
  throw new StudioError(path ? '`value` must be a string or null' : '`path` is required');
}

/** add: the fields core.ts reads, narrowed; a wrong kind, id or point is refused with core.ts's own message. */
export function entity(b: Body): AddEntity {
  if (!isKind(b.kind)) throw new StudioError('`kind` must be prop, hotspot or actor');
  if (typeof b.id !== 'string') throw new StudioError('`id` must be letters, digits and _ (not starting with a digit)');
  if (!isPoint(b.at)) throw new StudioError('`at` must be [x, y]');
  return {
    kind: b.kind,
    id: b.id,
    at: b.at,
    name: optText(b.name),
    // A character or image id is looked up as a property key: String() keeps the lookup and the message it gives.
    char: b.char === undefined || b.char === null ? undefined : String(b.char),
    img: b.img ? String(b.img) : undefined,
    look: optText(b.look),
  };
}

/** PUT notes/:id: core.ts checks `text`, then `about`. */
export function noteEdit(b: Body): NoteEdit {
  const t = text(b.text);
  if (t.trim() && b.about !== undefined && typeof b.about !== 'string')
    throw new StudioError('`about` must be a string');
  return { text: t, about: optText(b.about) };
}

/** PUT voices/:lang/:id: each field a string, or absent (null: absent). */
export function voicePatch(b: Body): { status?: string; note?: string; actor?: string } {
  const field = (k: 'status' | 'note' | 'actor') => {
    const v = b[k];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'string') throw new StudioError(`\`${k}\` must be a string`);
    return v;
  };
  return { status: field('status'), note: field('note'), actor: field('actor') };
}

/** The Studio API's routes (docs/en/STUDIO.md): the dev server and the Studio Server serve the same table. */
export function routes(s: Studio): [string, RegExp, Handler][] {
  return [
    ['GET', /^\/game$/, () => s.gameInfo()],
    ['GET', /^\/room\/([\w-]+)$/, (m) => s.getRoom(m[1])],
    ['PUT', /^\/room\/([\w-]+)\/layout$/, (m, b) => s.setLayout(m[1], b)],
    [
      'PUT',
      /^\/room\/([\w-]+)\/text$/,
      (m, b) => {
        const t = textEdit(b);
        return s.setText(m[1], t.path, t.value);
      },
    ],
    ['POST', /^\/room\/([\w-]+)\/add$/, (m, b) => s.addEntity(m[1], entity(b))],
    // 3.4: structured values (stage, conditions, commands) with a dry run for the diff, undo / redo, voices.
    // `@game` (4.1.12): the game file's objectives.
    ['PUT', /^\/room\/(@game|[\w-]+)\/value$/, (m, b) => s.setValue(m[1], text(b.path), b.value, { dry: !!b.dry })],
    // 4.1.12: the game's intermediate representation, with the provenance of its ids.
    ['GET', /^\/ir$/, () => s.ir()],
    // 4.2.3 (H3): what changed between two revisions, by what the game names.
    ['GET', /^\/diff\/(\d{1,12})\.\.(\d{1,12})$/, (m) => s.diff(Number(m[1]), Number(m[2]))],
    ['POST', /^\/undo$/, () => s.undo()],
    ['POST', /^\/redo$/, () => s.redo()],
    ['GET', /^\/history$/, () => s.history()],
    ['GET', /^\/voices(?:\/([\w-]+))?$/, (m) => s.voices(m[1])],
    ['PUT', /^\/voices\/([\w-]+)\/([\w.-]+)$/, (m, b) => s.setVoice(m[1], m[2], voicePatch(b))],
    ['GET', /^\/voices\/([\w-]+)\/csv$/, (m) => s.voicesCsv(m[1])],
    ['GET', /^\/storyboard$/, () => s.getStoryboard()],
    ['PUT', /^\/storyboard$/, (_m, b) => s.setStoryboard(b)],
    ['POST', /^\/storyboard\/markdown$/, () => s.exportStoryboardMarkdown()],
    // 4.2.3 (H1): the groupings of the scenario map, and the map derived from them and the IR.
    ['GET', /^\/groupings$/, () => s.getGroupings()],
    ['PUT', /^\/groupings$/, (_m, b) => s.setGroupings(b)],
    ['GET', /^\/map$/, () => s.map()],
    ['GET', /^\/notes$/, () => s.getNotes()],
    [
      'POST',
      /^\/notes$/,
      (_m, b) =>
        s.addNote({ text: text(b.text), about: optText(b.about), author: optText(b.author), task: b.task === true }),
    ],
    ['PUT', /^\/notes\/([\w-]+)$/, (m, b) => s.editNote(m[1], noteEdit(b))],
    ['DELETE', /^\/notes\/([\w-]+)$/, (m) => s.deleteNote(m[1])],
    ['POST', /^\/validate$/, () => s.validate()],
    ['POST', /^\/report$/, () => s.report()],
    ['GET', /^\/graph$/, () => s.graph()],
    ['POST', /^\/puzzle$/, (_m, b) => s.puzzle(typeof b.id === 'string' && b.id ? b.id : undefined)],
    ['POST', /^\/coverage$/, () => s.coverage()],
    ['POST', /^\/playtests$/, () => s.playtests()],
    ['POST', /^\/lint$/, (_m, b) => s.lint(!!b.prove)],
    [
      'POST',
      /^\/solve$/,
      (_m, b) =>
        s.solve(typeof b.from === 'string' && b.from ? b.from : null, undefined, b.prove ? 'prove' : 'witness'),
    ],
    [
      'POST',
      /^\/screenshot$/,
      async (_m, b, ctx) => {
        if (typeof b.room !== 'string') throw new StudioError('`room` is required');
        const r = await s.screenshot(
          b.room,
          typeof b.checkpoint === 'string' && b.checkpoint ? b.checkpoint : null,
          ctx.baseUrl,
        );
        if ('unavailable' in r) throw Object.assign(new StudioError(r.reason, 501), { body: r });
        return r;
      },
    ],
  ];
}
