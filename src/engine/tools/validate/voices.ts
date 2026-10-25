// The validator's check of voices by value (4.3.0, PLAN-4.3-HERO-CHOICE §3.4, core/voice-key.ts): a voiced line (a clip
// under its id or under one of its keyed ids, `<id>~<flag>=<value>`) whose text has switches needs a clip per
// combination of the values they list. A warning, not an error: the plain id is the fallback, so a game ships before
// every recording exists. Checked in `audio.voices` and in each language of `audio.voicesByLang`, against the text of
// that language when its translation table is given (4.3.1: a translation may add switches the source has not, or
// drop them), else against the text as written.
import { lineIds } from '../../core/content-ids';
import type { GameDef } from '../../core/types';
import { voiceBase, voiceVariants } from '../../core/voice-key';
import { applyLocale } from '../i18n';

/** What `validate` takes for this check (`ValidateOptions` extends it). */
export interface VoiceCheckOptions {
  /** The translation tables (`locales/<lang>.json`): each language's voices by value are checked against its text (4.3.1). */
  locales?: Readonly<Record<string, Record<string, string>>>;
}

export function voiceValueChecks(
  game: GameDef,
  warn: (where: string, msg: string) => void,
  locales: Readonly<Record<string, Record<string, string>>> = {},
): void {
  const a = game.audio;
  const maps: [string, Record<string, string>, GameDef][] = [
    ['', a?.voices ?? {}, game],
    ...Object.entries(a?.voicesByLang ?? {}).map(([l, m]): [string, Record<string, string>, GameDef] => [
      ` (${l})`,
      m,
      locales[l] ? applyLocale(game, locales[l]) : game,
    ]),
  ];
  for (const [lang, clips, texts] of maps) {
    const voiced = new Set(Object.keys(clips).map(voiceBase));
    if (!voiced.size) continue;
    for (const l of lineIds(texts)) {
      if (!voiced.has(l.id)) continue;
      const keyed = voiceVariants(l.id, l.text).filter((v) => v.values);
      const missing = keyed.filter((v) => !clips[v.key]).map((v) => v.key);
      if (missing.length)
        warn(
          `voice:${l.id}`,
          `voiced line with text switches lacks ${missing.length} of ${keyed.length} clip(s) by value${lang}: ${missing.join(', ')} (the plain id plays instead${clips[l.id] ? '' : ', and it has no clip either'})`,
        );
    }
  }
}
