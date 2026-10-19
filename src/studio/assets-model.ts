// Assets tab, model (4.1.8, programme §4.7: the Studio's biggest owners split into model / IO / view): the selection
// and filter types, and the pure functions over the listing (badges, filters, URLs, the tree's groups). No DOM, no
// api: the tab (assets.ts) and the domain views (assets-sheets.ts, assets-decors.ts, assets-sounds.ts) build on these,
// and the tests run them bare.
import type { AssetCell, AssetPrompt, AssetSheet, AssetSound, AssetsListing, GameInfo } from './api';
import { must } from '../engine/core/must';
import { apiUrl } from './api-base';

export type Sel =
  | { type: 'sheet'; id: string }
  | { type: 'decor'; id: string }
  | { type: 'sounds'; kind: 'music' | 'sfx' };
export type Filter = 'all' | 'used' | 'unused' | 'missing';
/** A badge of the tree: its class (`miss`, `unprep`, `unused`), its count, its title. */
type Badge = [string, number, string];
export type Group = {
  title: string;
  items: { sel: Sel; label: string; sub?: string; badges: Badge[] }[];
  add?: HTMLElement;
};

export const FILTERS: Filter[] = ['all', 'used', 'unused', 'missing'];

/** The text inside the ```text fence of a prompt section (what is pasted to the image model), else the whole section. */
export const fenced = (md: string) => /```text\n([\s\S]*?)\n```/.exec(md)?.[1] ?? md;
const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** Used by the game, has a file, not in public/assets yet: what Prepare assets would do. */
export const unprepared = (c: { used: string[]; prepared: boolean; missing?: boolean }) =>
  c.used.length > 0 && !c.prepared && !c.missing;

/** The three counts shown next to a tree entry, in display order. */
export function badges(cells: (AssetCell | AssetSound)[]): Badge[] {
  const miss = cells.filter((c) => 'missing' in c && c.missing).length;
  const unused = cells.filter((c) => !c.used.length && !('missing' in c && c.missing)).length;
  const unprep = cells.filter(unprepared).length;
  return [
    ['miss', miss, `${miss} missing`],
    ['unprep', unprep, `${unprep} not prepared`],
    ['unused', unused, `${unused} unused`],
  ];
}

/** Whether a cell passes the sheet's filter. */
export function keep(c: AssetCell, f: Filter) {
  return (
    f === 'all' ||
    (f === 'used' && c.used.length > 0 && !c.missing) ||
    (f === 'unused' && !c.used.length && !c.missing) ||
    (f === 'missing' && !!c.missing)
  );
}

/** A cell's state class: `missing`, `unused`, `unprep` or `used`. */
export const cellState = (c: AssetCell) =>
  c.missing ? 'missing' : !c.used.length ? 'unused' : unprepared(c) ? 'unprep' : 'used';

/** A use without the `cast.<character>.` prefix of the sheet's own character. */
export function shortUse(u: string, s: AssetSheet) {
  const p = s.character ? `cast.${s.character}.` : '';
  return p && u.startsWith(p) ? u.slice(p.length) : u;
}

/** Whether two selections name the same thing (the tree's `on` entry). */
export function sameSel(a: Sel | null, b: Sel) {
  return (
    !!a &&
    a.type === b.type &&
    (a.type === 'sounds'
      ? a.kind === (b as { kind: string }).kind
      : (a as { id: string }).id === (b as { id: string }).id)
  );
}

/** The source file on the dev server; in the demo, the prepared copy in public/assets (if any). `base`: the Vite base. */
export function assetUrl(
  x: { file: string; mtime: number; asset?: string },
  demo: boolean,
  base: string,
): string | null {
  if (!demo)
    return x.file ? apiUrl(`assets/file/${x.file.split('/').map(encodeURIComponent).join('/')}?v=${x.mtime}`) : null;
  return x.asset ? `${base}assets/${x.asset}` : null;
}

export const sheetOf = (d: AssetsListing, id: string) => d.sheets.find((s) => s.id === id);
export const promptOf = (d: AssetsListing, id: string): AssetPrompt | undefined =>
  d.prompts.sheets.find((p) => p.id === id);

/** The bar's summary: sheets, images, backgrounds, sounds, and the missing count when there is one. */
export function summaryText(d: AssetsListing): string {
  const cells = d.sheets.flatMap((s) => s.cells);
  return (
    `${plural(d.sheets.length, 'sheet')} · ${plural(cells.filter((c) => !c.missing).length, 'image')} · ${plural(d.decors.length, 'background')} · ${plural(d.sounds.music.length + d.sounds.sfx.length, 'sound')}` +
    (d.missing.length ? ` · ${d.missing.length} missing` : '')
  );
}

/**
 * The tree's groups in display order: Characters (sorted by the character's name), Objects, Backgrounds, Furniture,
 * Talk kits, Sounds. `add.decor`: the "+ background" button of the Backgrounds group (dev server only).
 */
export function treeGroups(d: AssetsListing, chars: GameInfo['characters'], add: { decor?: HTMLElement }): Group[] {
  const entry = (s: AssetSheet) => ({
    sel: { type: 'sheet', id: s.id } as Sel,
    label: s.id,
    badges: badges(s.cells),
    sub: s.character
      ? `${chars[s.character]?.name ?? s.character}${s.promptKind === 'poses' ? ' · special poses' : ''}`
      : undefined,
  });
  const charName = (s: AssetSheet) => {
    const c = must(s.character, 'character of a character sheet');
    return chars[c]?.name ?? c;
  };
  const charSheets = d.sheets
    .filter((s) => s.kind === 'sprites' && s.character)
    .sort((a, b) => natural(charName(a), charName(b)) || natural(a.id, b.id));
  return [
    { title: 'Characters', items: charSheets.map(entry) },
    { title: 'Objects', items: d.sheets.filter((s) => s.kind === 'sprites' && !s.character).map(entry) },
    {
      title: 'Backgrounds',
      items: d.decors.map((x) => ({
        sel: { type: 'decor', id: x.name } as Sel,
        label: x.name.slice(6),
        sub: x.rooms.join(', ') || undefined,
        badges: badges([x]),
      })),
      add: add.decor,
    },
    { title: 'Furniture', items: d.sheets.filter((s) => s.kind === 'furniture').map(entry) },
    { title: 'Talk kits', items: d.sheets.filter((s) => s.kind === 'talk').map(entry) },
    {
      title: 'Sounds',
      items: (['music', 'sfx'] as const).map((k) => ({
        sel: { type: 'sounds', kind: k } as Sel,
        label: k === 'music' ? 'Music' : 'Sound effects',
        sub: plural(d.sounds[k].length, 'file'),
        badges: badges(d.sounds[k]),
      })),
    },
  ];
}
