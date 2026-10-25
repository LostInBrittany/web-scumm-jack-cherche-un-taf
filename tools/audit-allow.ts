// A game's allowance in the leak audit (4.5.1, #269): a word of the private origin's list that is also, by chance, a word
// of this game (a real colleague's first name, say). `games/<id>/audit-allow.json` lists them the way the audit lists
// its words, as SHA-1 prefixes, so the allowance publishes no word either:
//   { "allow": [{ "sha1": "<12 hex>", "why": "<the reason, without the word>" }] }
// A word is allowed only inside games/<id>/ (audit-allow.json itself excepted: its reason must not spell the word), and
// in public/assets/ when <id> is the game being built. A prefix the audit does not block is an error: the file cannot
// outlive the word it excuses.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Allowance = { sha1: string; why: string };

/** Reads one audit-allow.json; throws on the first fault, with what to change. */
export function parseAuditAllow(json: unknown, blocked: ReadonlySet<string>, where = 'audit-allow.json'): Allowance[] {
  const list = (json as { allow?: unknown } | null)?.allow;
  if (!Array.isArray(list)) throw new Error(`${where}: { "allow": [{ "sha1": "<12 hex>", "why": "…" }] }`);
  return list.map((a: { sha1?: unknown; why?: unknown }, i) => {
    if (typeof a?.sha1 !== 'string' || !/^[0-9a-f]{12}$/.test(a.sha1))
      throw new Error(`${where}: allow[${i}].sha1 is the first 12 hex digits of the word's SHA-1`);
    if (typeof a.why !== 'string' || !a.why.trim()) throw new Error(`${where}: allow[${i}] says why (why)`);
    if (!blocked.has(a.sha1))
      throw new Error(`${where}: allow[${i}] (${a.sha1}) is no word the audit blocks: remove it`);
    return { sha1: a.sha1, why: a.why };
  });
}

/** The words each path may contain: a game's allowance in its own folder, the current game's in public/assets/. */
export function allowances(
  root: string,
  blocked: ReadonlySet<string>,
  current?: string,
): (path: string) => ReadonlySet<string> {
  const byGame = new Map<string, Set<string>>();
  const games = join(root, 'games');
  for (const g of existsSync(games) ? readdirSync(games) : []) {
    const file = join(games, g, 'audit-allow.json');
    if (!existsSync(file)) continue;
    const where = `games/${g}/audit-allow.json`;
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`${where}: not JSON (${(e as Error).message})`);
    }
    byGame.set(g, new Set(parseAuditAllow(json, blocked, where).map((a) => a.sha1)));
  }
  const none: ReadonlySet<string> = new Set();
  return (path) => {
    const p = path.split('\\').join('/');
    // The allowance itself allows nothing: a reason (or any other text in it) that spells the word is still a leak.
    if (/^games\/[^/]+\/audit-allow\.json$/.test(p)) return none;
    const game = /^games\/([^/]+)\//.exec(p)?.[1] ?? (current && p.startsWith('public/assets/') ? current : undefined);
    return (game && byGame.get(game)) || none;
  };
}
