// The validator's checks of events (emitted, listened to, waited for) and of `reality` (4.1.1, wiki/en/bridge.what-it-is.md): a
// finite, declared alphabet of signals, each one an event the world emits; a required one names the action that stands
// in for it when the outside never answers. Called by validate() with the event maps it filled walking the content.
import type { GameDef, Id } from '../core/types';

const ids = (x: Id | Id[] | undefined) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

export function eventChecks(
  game: GameDef,
  {
    emitted,
    listened,
    waited,
  }: { emitted: Map<string, string>; listened: Map<string, string>; waited: Map<string, string> },
  err: (where: string, msg: string) => void,
  warn: (where: string, msg: string) => void,
): void {
  const SIGNAL_ID = /^[\w.:-]{1,128}$/;
  const signalIds = new Set<string>();
  (game.reality?.signals ?? []).forEach((sg, i) => {
    const w = `reality.signals[${i}]`;
    if (!SIGNAL_ID.test(sg.id ?? '')) err(w, `signal id "${sg.id}": letters, digits and . _ : - only, at most 128`);
    else if (signalIds.has(sg.id)) err(w, `signal "${sg.id}" is declared twice`);
    signalIds.add(sg.id);
    if (!sg.source) err(w, 'a signal names its `source` (mail, webhook…)');
    if (sg.availability !== 'optional' && sg.availability !== 'required')
      err(w, '`availability` is "optional" or "required"');
    if (sg.replay !== 'record') err(w, '`replay` is "record" (the only mode of 4.1.1)');
    if (sg.availability === 'required') {
      const f = sg.fallback;
      if (!f)
        err(w, `required signal "${sg.id}" has no \`fallback\`: what a player does when the outside never answers`);
      else if (
        !game.rooms.some((r) =>
          (r.on ?? []).some(
            (x) =>
              ids(x.verb as Id | Id[]).includes(f.verb) &&
              ids(x.a).includes(f.a) &&
              (f.b === undefined || ids(x.b as Id | Id[] | undefined).includes(f.b)),
          ),
        )
      )
        err(w, `the fallback of "${sg.id}" (${f.verb} ${f.a}${f.b ? ` ${f.b}` : ''}) matches no rule`);
    }
    if (!emitted.has(sg.id)) emitted.set(sg.id, w);
    if (!listened.has(sg.id) && !waited.has(sg.id)) warn(w, `signal "${sg.id}" is declared but nothing listens to it`);
  });
  const bridge = game.reality?.bridge;
  if (bridge !== undefined && !/^(https:\/\/[^\s/]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)(\/[^\s]*)?$/.test(bridge))
    err('reality.bridge', `"${bridge}": an https:// URL (http:// only for 127.0.0.1 or localhost)`);
  connectorChecks(game, signalIds, err);
  for (const [ev, where] of emitted)
    if (!listened.has(ev) && !waited.has(ev) && !game.reality?.signals.some((x) => x.id === ev))
      warn(where, `event "${ev}" is emitted but nothing listens to it`);
  for (const [ev, where] of listened)
    if (!emitted.has(ev)) {
      // A game that takes signals from outside declares every one it listens to: an undeclared name is a typo or a
      // signal the Bridge would refuse.
      if (game.reality) err(where, `event "${ev}" is never emitted nor declared in reality.signals`);
      else warn(where, `event "${ev}" is listened to but never emitted`);
    }
  for (const [ev, where] of waited)
    if (!emitted.has(ev)) warn(where, `script waits for event "${ev}", which is never emitted`);
}

/** The commands a virtual terminal answers by itself (4.1.9): a game's command may not take their name. */
export const TERMINAL_BUILTINS = ['help', 'exit', 'quit', 'clear', 'ls', 'cd', 'cat', 'pwd'];

/**
 * `reality.connectors` (4.1.9, wiki/en/bridge.connectors.md): every signal it names is declared; words, commands and paths
 * have the shapes the connectors read without a pattern of the author's (no regular expression reaches a connector).
 */
function connectorChecks(game: GameDef, signalIds: Set<string>, err: (where: string, msg: string) => void): void {
  const c = game.reality?.connectors;
  if (!c) return;
  const known = (where: string, id: Id | undefined) => {
    if (id !== undefined && !signalIds.has(id)) err(where, `signal "${id}" is not declared in reality.signals`);
  };
  const WORD = /^[\p{L}\p{N}'-]{1,64}$/u;
  (c.email?.answers ?? []).forEach((a, i) => {
    const w = `reality.connectors.email.answers[${i}]`;
    if (!a.words?.length || a.words.some((x) => !WORD.test(x)))
      err(w, '`words`: one or more, each 1 to 64 letters or digits, no space');
    known(w, a.signal);
  });
  if (c.email) known('reality.connectors.email.otherwise', c.email.otherwise);
  const SAYS = /^[a-z0-9][a-z0-9-]{0,31}( [a-z0-9][a-z0-9-]{0,31}){0,7}$/;
  for (const k of ['telnet', 'ssh'] as const) {
    const seen = new Set<string>();
    (c[k]?.commands ?? []).forEach((cmd, i) => {
      const w = `reality.connectors.${k}.commands[${i}]`;
      if (!SAYS.test(cmd.says ?? '')) err(w, '`says`: lower-case words of letters, digits and -, one space apart');
      else if (TERMINAL_BUILTINS.includes(cmd.says.split(' ')[0]!))
        err(w, `"${cmd.says}": ${TERMINAL_BUILTINS.join(', ')} are the terminal's own commands`);
      if (seen.has(cmd.says)) err(w, `"${cmd.says}" is declared twice`);
      seen.add(cmd.says);
      if (typeof cmd.reply !== 'string' || cmd.reply.length > 2000)
        err(w, '`reply`: plain text, at most 2000 characters');
      known(w, cmd.signal);
    });
  }
  for (const [path, text] of Object.entries(c.ssh?.files ?? {}))
    if (!/^(\/[\w-][\w.-]{0,63}){1,8}$/.test(path) || path.split('/').some((x) => x === '..' || x === '.'))
      err('reality.connectors.ssh.files', `"${path}": an absolute path of plain names (no . or .., at most 8 deep)`);
    else if (text.length > 16_384) err('reality.connectors.ssh.files', `"${path}": at most 16 KB of text`);
  const b = c['open-badge'];
  if (b) {
    if (!b.issuers?.length || b.issuers.some((x) => typeof x !== 'string' || !x || x.length > 512))
      err('reality.connectors.open-badge', '`issuers`: the issuer ids (URLs or DIDs) whose badges count');
    for (const k of ['valid', 'invalid', 'expired', 'revoked', 'indeterminate'] as const)
      known(`reality.connectors.open-badge.${k}`, b[k]);
  }
}
