// What only server code carries (4.1.9, D19): a game's build must hold none of it. The connectors and the Bridge run
// as processes of their own; the game talks to the Bridge over HTTP and never bundles either. `tools/dist.ts` checks
// every JavaScript file of a build; tests/dist-no-server-code.test.ts checks the sources' imports and, when a build
// is there, the build.

/** Strings that appear in a bundle only if server code went into it. */
export const SERVER_MARKERS = [
  'connectors/',
  'bridge/src',
  'ssh2',
  'imapflow',
  'quest-n-click-connector',
  'quest-n-click-bridge',
  // Their names before 4.2.5 (D47): the connectors' User-Agent and SSH ident still say it (a wire identifier).
  'web-scumm-connector',
  'web-scumm-bridge',
  'mime-worker',
  'propose.datalog',
];

/** The markers a file's text holds. */
export function serverMarkers(text: string): string[] {
  return SERVER_MARKERS.filter((m) => text.includes(m));
}
