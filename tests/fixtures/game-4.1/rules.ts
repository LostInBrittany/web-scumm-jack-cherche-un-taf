import type { GameRules } from 'web-scumm/content';

// Fallback answers per verb (drawn at random, never twice in a row) and reactions by kind.
export const rules: GameRules = {
  fallbacks: {
    give: ['Nobody wants that.', 'Keep it.'],
    open: ['It does not open.', 'Closed. Very closed.'],
    close: ['It is already closed.'],
    take: ['I will leave it there.', 'Too heavy. Or too boring.'],
    look: ['Nothing special.', 'Looks like what it is.'],
    talk: ['No answer.', 'It stays silent. Rude.'],
    use: ['Nothing happens.', 'That does nothing. Yet.'],
    push: ['It does not move.'],
    pull: ['It does not budge.'],
    use2: ['These do not go together.', 'Nope. Not even with glue.'],
  },
  kinds: [
    { verb: 'take', kind: 'person', say: 'I cannot carry {nom}.' },
    { verb: 'pull', kind: 'cat', say: 'Never pull a cat.' },
  ],
  on: [],
};
