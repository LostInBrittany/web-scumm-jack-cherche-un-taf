// Text paths of a room file (`look.piano[1]`, `on[3].do[0]`…) and which of them are texts. Pure, with no dependency:
// shared by the source editor (studio-server/src/ops/source.ts, node) and the Studio's browser backend (src/studio/api-browser.ts).
import type { TextKind } from './types';
import { must } from '../../src/engine/core/must';

export type Seg = string | number;

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const IDENT = /^[A-Za-z_$][\w$]*$/;

/** ['on', 3, 'do', 0] → `on[3].do[0]`; keys that are not identifiers become `["a.b"]`. */
export function formatPath(segs: Seg[]): string {
  let out = '';
  for (const s of segs) {
    if (typeof s === 'number' || s === '+') out += `[${s}]`;
    else if (IDENT.test(s)) out += out ? `.${s}` : s;
    else out += `[${JSON.stringify(s)}]`;
  }
  return out;
}

/** The reverse of formatPath. `[+]` (append) is returned as the string '+'. */
export function parsePath(path: string): Seg[] {
  const segs: Seg[] = [];
  let rest = path.trim();
  const re = /^(?:\.?([A-Za-z_$][\w$]*)|\[(\d+)\]|\[(\+)\]|\[("(?:[^"\\]|\\.)*")\])/;
  while (rest) {
    const m = re.exec(rest);
    if (!m || (m[1] !== undefined && segs.length === 0 && rest.startsWith('.')))
      throw new SourceError(`invalid path: "${path}"`);
    if (m[1] !== undefined) segs.push(m[1]);
    else if (m[2] !== undefined) segs.push(Number(m[2]));
    else if (m[3] !== undefined) segs.push('+');
    else segs.push(JSON.parse(must(m[4], 'quoted key of a matched path segment')) as string);

    rest = rest.slice(m[0].length);
  }
  if (!segs.length) throw new SourceError('empty path');
  return segs;
}

// ---------------------------------------------------------------------------
// Which string literals are texts
// ---------------------------------------------------------------------------

/** Command lists: a bare string element is a hero line. */
const HERO_LISTS = new Set(['do', 'once', 'then', 'else', 'cutscene', 'after', 'onEnter']);
/** Lists of command lists: `nth[0][1]` is a hero line too. */
const HERO_LISTS2 = new Set(['nth', 'cycle', 'random', 'parallel']);

/** The kind of text at this path, or null for ids, image refs, flags and other non-text strings. */
export function classify(segs: Seg[]): TextKind | null {
  const n = segs.length;
  const last = segs[n - 1];
  const prev = segs[n - 2];
  if (last === 'name') return 'name';
  if (last === 'locked' && segs[0] === 'exits') return 'hero';
  if (last === 'topic') return 'topic';
  if (last === 'toast') return 'toast';
  if (last === 'say' && prev === 'guide') return 'guide';
  if (last === 'text' && typeof prev === 'number' && segs[n - 3] === 'choice') return 'choice';
  if (typeof last === 'number') {
    if (prev === 'lines') return 'hint';
    if ((prev === 'say' || prev === 'shout') && last === 1) return 'say';
    if (segs[0] === 'look' && n === 3) return 'look';
    if (typeof prev === 'string' && HERO_LISTS.has(prev)) return 'hero';
    if (typeof prev === 'number' && typeof segs[n - 3] === 'string' && HERO_LISTS2.has(segs[n - 3] as string))
      return 'hero';
  }
  if (segs[0] === 'look' && n === 2) return 'look';
  return null;
}
