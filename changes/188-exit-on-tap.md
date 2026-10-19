### Changes

- **An exit can be gone through on a single tap (4.2.3, #188)**: `input: { exitOnTap: true }` in `game.ts` makes a
  single tap on an exit with no verb picked walk there and go through on arrival, with the double tap's verb, as in
  the LucasArts classics; a locked exit says its `locked` line. A picked verb still wins, a tap elsewhere during the
  walk still redirects the hero (and nothing is gone through), a double tap is unchanged. An exit's `onTap: 'go' |
  'walk'` overrides the game's setting either way; the Studio offers it on the exit's sheet. Off by default: a game
  without either plays exactly as before. Input only (presentation in the fingerprint): the rules, the solver and
  saves do not see it.
