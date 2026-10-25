// Voice production (3.4): the table a studio records from. One row per clip of a line with a stable id (a line with
// text switches has one per value since 4.3.0, `<id>~<flag>=<value>`, core/voice-key.ts, read from the text of that
// language since 4.3.1: a translation may add switches the source has not, or drop them) and per language: who
// speaks, the text in that language, the clip (`audio.voices` for the game's language, `audio.voicesByLang[lang]`
// for the others) and where the line stands (draft, to record, recorded, approved: `games/<id>/voices.json`). CSV or
// JSON out for the actors, back in with their statuses and notes; the clips' facts (duration, loudness, peak, rate,
// codec, measured by `npm run voices -- check` with ffmpeg) judged here. Pure: the command line does the files.
import { lineIds } from '../core/content-ids';
import { parseText, renderText } from '../core/text-switch';
import type { GameDef, Id } from '../core/types';
import { voiceBase, voiceVariants } from '../core/voice-key';

export type VoiceStatus = 'draft' | 'record' | 'recorded' | 'approved';
export const VOICE_STATUSES: readonly VoiceStatus[] = ['draft', 'record', 'recorded', 'approved'];
/** `voices.json`: per language, per line id, where the line stands. */
export type VoiceSheet = Record<string, Record<Id, { status: VoiceStatus; note?: string; actor?: string }>>;

export interface VoiceRow {
  id: Id;
  who: Id;
  text: string;
  status: VoiceStatus;
  file?: string;
  note?: string;
  actor?: string;
}

/** The clips of a language: `audio.voices` for the game's own, `audio.voicesByLang[lang]` for the others. */
function clipsOf(game: GameDef, lang: string): Record<Id, string> {
  return lang === (game.lang ?? 'en') ? (game.audio?.voices ?? {}) : (game.audio?.voicesByLang?.[lang] ?? {});
}

/**
 * The clips a line needs (4.3.0, core/voice-key.ts): a line whose text has switches needs one per combination of the
 * values they list (`<id>~<flag>=<value>…`, its text as it reads then), plus its plain id as the fallback when a
 * switch has `*=` or when a clip is already filed under it; any other line, its plain id. Each text is rendered: a
 * line whose switches list only `*=` reads its default, never the braces (4.3.1).
 */
function lineClips(id: Id, text: string, clips: Record<Id, string>): { key: Id; text: string }[] {
  const vs = voiceVariants(id, text);
  const out = vs.map((v) => ({ key: v.key, text: renderText(text, v.values ?? {}, '{hero}') }));
  if (clips[id] && !out.some((o) => o.key === id)) out.push({ key: id, text: renderText(text, {}, '{hero}') });
  return out;
}

/**
 * The table of a language. `localized`: the game with that language applied (`applyLocale`), for the texts; the ids
 * are the same in every language. One row per clip: a line with switches has one per value (its `id` is the clip's
 * key, `<id>~<flag>=<value>`). A row with no status yet is `recorded` when it has a clip, else `draft`.
 */
export function voiceTable(game: GameDef, sheet: VoiceSheet, lang: string, localized: GameDef = game): VoiceRow[] {
  const clips = clipsOf(game, lang),
    s = sheet[lang] ?? {};
  const texts = new Map(lineIds(localized).map((l) => [l.id, l.text]));
  return lineIds(game).flatMap((l) =>
    lineClips(l.id, texts.get(l.id) ?? l.text, clips).map(({ key, text }) => {
      const row = s[key];
      return {
        id: key,
        who: l.who,
        text,
        status: row?.status ?? (clips[key] ? 'recorded' : 'draft'),
        ...(clips[key] ? { file: clips[key] } : {}),
        ...(row?.note ? { note: row.note } : {}),
        ...(row?.actor ? { actor: row.actor } : {}),
      };
    }),
  );
}

/**
 * Every row id `voiceTable` can list in a language (each line's id and its keyed clips): for `mergeSheet`. `localized`:
 * the game in that language (`applyLocale`), since a translation may add switches the source has not, or drop them
 * (4.3.1): the keys come from the text of the language they voice.
 */
export function voiceIds(localized: GameDef): Set<Id> {
  return new Set(lineIds(localized).flatMap((l) => [l.id, ...voiceVariants(l.id, l.text).map((v) => v.key)]));
}

/**
 * Whether a clip key belongs to a line: its plain id, or `<id>~…` of a line whose text has switches (any value of
 * its flags, listed or not: the engine keys by the flag's value, voice-key.ts).
 */
function claimsClip(texts: ReadonlyMap<Id, string>, key: Id): boolean {
  const base = voiceBase(key),
    text = texts.get(base);
  return text !== undefined && (base === key || parseText(text).switches.length > 0);
}

/** Clips no line claims, in a language. `localized`: the game in that language, whose texts key its clips (4.3.1). */
export function orphanClips(game: GameDef, lang: string, localized: GameDef = game): { id: Id; file: string }[] {
  const texts = new Map(lineIds(localized).map((l) => [l.id, l.text]));
  return Object.entries(clipsOf(game, lang))
    .filter(([id]) => !claimsClip(texts, id))
    .map(([id, file]) => ({ id, file }));
}

const COLUMNS = ['id', 'who', 'text', 'status', 'file', 'actor', 'note'] as const;
const cell = (v: string | undefined) => (v === undefined ? '' : /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: VoiceRow[]): string {
  return (
    [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((k) => cell(r[k] as string | undefined)).join(','))].join('\n') +
    '\n'
  );
}

/** RFC 4180: quoted fields, doubled quotes, line breaks inside quotes. The header names the columns. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    f = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        f += '"';
        i++;
      } else if (ch === '"') q = false;
      else f += ch;
      continue;
    }
    if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(f);
      f = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      f = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else f += ch;
  }
  if (f !== '' || row.length) {
    row.push(f);
    if (row.some((x) => x !== '')) rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries((head ?? []).map((h, i) => [h.trim(), r[i] ?? ''])));
}

/** What an actor's table brings back: statuses, actors and notes, for the lines the game has; the others reported. */
export function mergeSheet(
  sheet: VoiceSheet,
  lang: string,
  rows: Record<string, string>[],
  ids: Set<Id>,
): { sheet: VoiceSheet; unknown: string[]; bad: string[] } {
  const out: VoiceSheet = structuredClone(sheet);
  const s = (out[lang] ??= {});
  const unknown: string[] = [],
    bad: string[] = [];
  for (const r of rows) {
    if (!r.id) continue;
    if (!ids.has(r.id)) {
      unknown.push(r.id);
      continue;
    }
    const status = (r.status || 'draft').trim() as VoiceStatus;
    if (!VOICE_STATUSES.includes(status)) {
      bad.push(`${r.id}: unknown status "${r.status}"`);
      continue;
    }
    s[r.id] = {
      status,
      ...(r.note?.trim() ? { note: r.note.trim() } : {}),
      ...(r.actor?.trim() ? { actor: r.actor.trim() } : {}),
    };
  }
  return { sheet: out, unknown, bad };
}

/** What `ffprobe` and `ffmpeg -af ebur128` say about a clip. */
export interface ClipFacts {
  durationMs: number;
  sampleRate: number;
  codec: string;
  lufs?: number;
  peak?: number;
}

/** A voice clip in a release: present when the line is approved, readable, of a plausible length, at a speech level. */
export function clipVerdict(row: VoiceRow, facts: ClipFacts | null): { errors: string[]; warnings: string[] } {
  const errors: string[] = [],
    warnings: string[] = [];
  const at = `${row.id}${row.file ? ` (${row.file})` : ''}`;
  if (!row.file) {
    if (row.status === 'approved') errors.push(`${at}: approved without a clip`);
    else if (row.status === 'recorded') warnings.push(`${at}: recorded, but no clip in audio.voices`);
    return { errors, warnings };
  }
  if (!facts) {
    errors.push(`${at}: the clip cannot be read`);
    return { errors, warnings };
  }
  if (!['mp3', 'vorbis', 'opus', 'aac', 'pcm_s16le', 'flac'].includes(facts.codec))
    errors.push(`${at}: codec ${facts.codec} (mp3, ogg vorbis or opus, aac, wav, flac)`);
  if (facts.sampleRate < 22050) warnings.push(`${at}: ${facts.sampleRate} Hz (22 050 Hz or more for speech)`);
  const reading = Math.max(1500, row.text.length * 70);
  if (facts.durationMs < 300) warnings.push(`${at}: ${facts.durationMs} ms, too short for a line`);
  else if (facts.durationMs > reading * 3)
    warnings.push(
      `${at}: ${(facts.durationMs / 1000).toFixed(1)} s for ${row.text.length} characters (more than three times the reading time)`,
    );
  if (facts.lufs !== undefined && (facts.lufs < -23 || facts.lufs > -12))
    warnings.push(`${at}: ${facts.lufs.toFixed(1)} LUFS (speech: about −16, between −23 and −12)`);
  if (facts.peak !== undefined && facts.peak > -1)
    warnings.push(`${at}: peak ${facts.peak.toFixed(1)} dBFS (keep below −1)`);
  return { errors, warnings };
}
