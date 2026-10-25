// The validator's checks of the player's side (out of tools/validate.ts, 4.2.4): the texts of the save and settings
// menus, and how the player's taps read (#188): `input.exitOnTap` a boolean, an exit's `onTap` `go` or `walk`; the
// hero's distance to a character (#198): `actorGap` a positive number; the verbs' keys (#203).
import type { GameDef, VerbDef } from '../../core/types';
import { applyLocale } from '../i18n';

const SAVE_TEXTS = ['save', 'load', 'slot', 'emptySlot', 'exportSave', 'importSave', 'confirmOverwrite'] as const;
const SETTINGS_TEXTS = [
  'settings',
  'textSpeed',
  'textSize',
  'reduceMotion',
  'volumeMusic',
  'volumeSfx',
  'slow',
  'normal',
  'fast',
  'large',
] as const;
const ON_TAP = new Set(['go', 'walk']);

export function playerChecks(
  game: GameDef,
  o: {
    err: (where: string, msg: string) => void;
    warn: (where: string, msg: string) => void;
    /** The translations: their verb keys are checked too (4.4.0: by every caller of `validate`, the Studio's too). */
    locales?: Readonly<Record<string, Record<string, string>>>;
  },
): void {
  const { err, warn } = o;
  if (o.locales) localeVerbKeyChecks(game, o.locales, o);
  if (game.saves && (!Number.isInteger(game.saves.slots) || game.saves.slots < 0))
    err('saves', 'slots must be a whole number');
  if (game.saves?.slots)
    for (const k of SAVE_TEXTS)
      if (!game.ui[k]) warn(`ui.${k}`, 'missing text for the save menu (English default used)');
  if (game.settings)
    for (const k of SETTINGS_TEXTS)
      if (!game.ui[k]) warn(`ui.${k}`, 'missing text for the settings menu (English default used)');
  const input: unknown = game.input;
  const tap = input && typeof input === 'object' ? (input as Record<string, unknown>).exitOnTap : undefined;
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input)))
    err('input', 'input is an object: { exitOnTap?: boolean }');
  else if (tap !== undefined && typeof tap !== 'boolean') err('input.exitOnTap', 'exitOnTap is true or false');
  // The runtime keeps 44 for anything else; said here so an author learns it.
  const gap: unknown = game.actorGap;
  if (gap !== undefined && !(typeof gap === 'number' && Number.isFinite(gap) && gap > 0))
    err('actorGap', 'actorGap is a positive number of pixels (44 is used instead)');
  for (const r of game.rooms)
    for (const [xid, ex] of Object.entries(r.exits ?? {}))
      if (ex.onTap !== undefined && !ON_TAP.has(ex.onTap))
        err(`${r.id}.exits.${xid}`, `onTap is "go" or "walk", not "${String(ex.onTap)}"`);
  for (const r of game.rooms)
    for (const [hid, h] of Object.entries(r.hotspots ?? {}))
      if (!h.exit && h.onTap !== undefined && !ON_TAP.has(h.onTap))
        err(`${r.id}.hotspots.${hid}`, `onTap is "go" or "walk", not "${String(h.onTap)}"`);
  verbKeyChecks(game.verbs, o);
  // A single-letter shortcut must be one the player can turn off (WCAG 2.1.4): the settings row does it (4.3.0).
  if (game.verbs.some((v) => v.key !== undefined)) {
    if (!game.settings)
      warn('settings', 'the verbs have keys but no settings menu: a player cannot turn them off (settings: true)');
    else if (!game.ui.verbKeys) warn('ui.verbKeys', 'missing text for the settings menu (English default used)');
  }
}

/** The verbs' keys in each translation (#203): a clash there is the translator's, reported as `<lang>: verbs.…`. */
export function localeVerbKeyChecks(
  game: GameDef,
  locales: Readonly<Record<string, Record<string, string>>>,
  o: { err: (where: string, msg: string) => void; warn: (where: string, msg: string) => void },
): void {
  if (!game.verbs.some((v) => v.key !== undefined)) return;
  for (const [lang, table] of Object.entries(locales))
    if (lang !== (game.lang ?? 'en')) verbKeyChecks(applyLocale(game, table).verbs, o, `${lang}: `);
}

/**
 * The verbs' keyboard shortcuts (#203): one character each, not Space (it advances a line), never shared by two verbs
 * (in any case); a key missing from the label works but shows nowhere, so it is a warning. `where` prefixes the place,
 * for a locale's verbs (`npm run validate` checks each one, since a translation may change the letters).
 */
function verbKeyChecks(
  verbs: readonly VerbDef[],
  o: { err: (where: string, msg: string) => void; warn: (where: string, msg: string) => void },
  where = '',
): void {
  const seen = new Map<string, string>();
  for (const v of verbs) {
    const key: unknown = v.key;
    if (key === undefined) continue;
    const w = `${where}verbs.${v.id}.key`;
    if (typeof key !== 'string' || [...key].length !== 1) {
      o.err(w, `a verb's key is one character, not ${JSON.stringify(key)}`);
      continue;
    }
    if (key.trim() === '') {
      o.err(w, "a verb's key cannot be a space: Space advances a line of dialogue");
      continue;
    }
    const k = key.toLocaleLowerCase();
    const other = seen.get(k);
    if (other) o.err(w, `"${key}" is already the key of "${other}"`);
    else seen.set(k, v.id);
    if (!v.label.toLocaleLowerCase().includes(k))
      o.warn(w, `"${key}" is not in the label "${v.label}": the button cannot underline it`);
  }
}
