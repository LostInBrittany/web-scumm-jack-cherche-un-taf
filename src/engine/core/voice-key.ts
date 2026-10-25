// Voices by value (4.3.0, PLAN-4.3-HERO-CHOICE §3.4, ADR 0022): a line whose text has switches is recorded once per
// value ("him" and "her" are two clips), keyed by its id and the values of the flags its switches read:
//
//   <id>~<flag>=<value>[~<flag>=<value>…]    flags sorted (`switchFlags`), each value as `String(value)`
//
// The lookup tries that key first, then the plain id: a game ships before every clip exists. A flag a switch reads
// that is unset (the line is spoken before the choice) means no keyed lookup at all, the plain id only (the text
// shows its `*=` or first alternative then, which is what the plain clip says). A line without switches keeps its
// one clip. The keys are map keys only (`audio.voices`, `voicesByLang`, `voices.json`): the file each one names is
// written by hand and never derived from the key, so `~` and `=` never reach a file name or an asset URL (the Studio
// encodes a key in its `PUT voices/<lang>/<id>` route).
// Pure: no DOM, no engine.
import { parseText, switchFlags } from './text-switch';
import type { GameDef, Id, Value } from './types';

/** Between the id and each `flag=value`. */
const VOICE_KEY_SEP = '~';

/** The keyed clip id of a line for these flags; undefined when its text has no switch or a flag it reads is unset. */
export function voiceKey(id: Id, text: string, flags: Readonly<Record<string, Value>>): Id | undefined {
  const fs = switchFlags(text);
  if (!fs.length || fs.some((f) => flags[f] === undefined)) return undefined;
  return id + fs.map((f) => `${VOICE_KEY_SEP}${f}=${String(flags[f])}`).join('');
}

/** The clip a line plays: its keyed id when `voices` has a clip under it, else its plain id when it has one. */
export function lineClip(
  voices: Readonly<Record<Id, string>> | undefined,
  id: Id | undefined,
  text: string | undefined,
  flags: Readonly<Record<string, Value>> | undefined,
): Id | undefined {
  if (!id || !voices) return undefined;
  const k = text !== undefined && flags ? voiceKey(id, text, flags) : undefined;
  if (k && voices[k]) return k;
  return voices[id] ? id : undefined;
}

/**
 * The clips a translation plays (boot.ts): `audio.voicesByLang[lang]` for a language other than the game's own;
 * undefined for the game's own language or one without clips (the game's `audio.voices` play then).
 */
export function langVoices(
  game: Pick<GameDef, 'lang' | 'audio'>,
  lang: string | undefined,
): Record<Id, string> | undefined {
  return lang && lang !== (game.lang ?? 'en') ? game.audio?.voicesByLang?.[lang] : undefined;
}

/** The id a clip key belongs to: the key before its first `~` (a plain id is its own). */
export const voiceBase = (key: Id): Id => {
  const i = key.indexOf(VOICE_KEY_SEP);
  return i < 0 ? key : key.slice(0, i);
};

/** One clip a line needs: its key and, for a keyed one, the flags' values it stands for (absent: the plain id). */
export interface VoiceVariant {
  key: Id;
  values?: Record<string, string>;
}

/**
 * Every clip a line can need, for a recording sheet: one per combination of the values its switches list (a flag
 * read by two switches: the values of both, once each, in the order written), flags sorted; then the plain id when a
 * switch has `*=` (the fallback: a value no switch lists, or the flag unset). A line without switches: its plain id.
 */
export function voiceVariants(id: Id, text: string): VoiceVariant[] {
  const sws = parseText(text).switches;
  if (!sws.length) return [{ key: id }];
  const listed = new Map<string, string[]>();
  for (const f of switchFlags(text)) listed.set(f, []);
  for (const sw of sws)
    for (const a of sw.alts) {
      const vs = listed.get(sw.flag)!;
      if (a.value !== '*' && !vs.includes(a.value)) vs.push(a.value);
    }
  let combos: Record<string, string>[] = [{}];
  for (const [f, vs] of listed) combos = combos.flatMap((c) => vs.map((v) => ({ ...c, [f]: v })));
  const out: VoiceVariant[] = combos.map((values) => ({ key: voiceKey(id, text, values)!, values }));
  if (sws.some((s) => s.hasDefault)) out.push({ key: id });
  return out;
}
