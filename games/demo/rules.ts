import type { GameRules } from '@engine/core/types';

// Fallback answers per verb (drawn at random, never twice in a row), reactions by kind, and rules valid in every room.
export const rules: GameRules = {
  fallbacks: {
    give: [{ id: 'fallback.give.l-nobody-wants', text: 'Nobody wants {objet}. Their loss.' }, { id: 'fallback.give.l-i-will-keep-it', text: 'I will keep it. Cats keep things.' }],
    open: [{ id: 'fallback.open.l-it-does-not-open', text: 'It does not open. I pushed it with my nose.' }, { id: 'fallback.open.l-closed-very', text: 'Closed. Very closed.' }],
    close: [{ id: 'fallback.close.l-already-closed', text: 'Already closed. Like my eyes, most of the day.' }, { id: 'fallback.close.l-nothing-to-close', text: 'Nothing to close.' }],
    take: [{ id: 'fallback.take.l-too-heavy-i-am-a', text: 'Too heavy. I am a small cat.' }, { id: 'fallback.take.l-i-will-leave-it', text: 'I will leave it there. For now.' }, { id: 'fallback.take.l-paws-off-pixel', text: 'Paws off, Pixel.' }],
    look: [{ id: 'fallback.look.l-hmm-nom-nothing', text: 'Hmm. {nom}. Nothing to eat there.' }, { id: 'fallback.look.l-looks-like-nom', text: 'Looks like {nom}. Not like sardines.' }],
    talk: [{ id: 'fallback.talk.l-no-answer-rude', text: 'No answer. Rude.' }, { id: 'fallback.talk.l-it-does-not', text: 'It does not speak cat.' }],
    use: [{ id: 'fallback.use.l-nothing-happens', text: 'Nothing happens. I tried my best paw.' }, { id: 'fallback.use.l-that-does', text: 'That does nothing. Yet.' }],
    push: [{ id: 'fallback.push.l-it-does-not-move', text: 'It does not move. I need more breakfast.' }, { id: 'fallback.push.l-push-push-nope', text: 'Push, push... nope.' }],
    pull: [{ id: 'fallback.pull.l-it-does-not', text: 'It does not budge.' }, { id: 'fallback.pull.l-i-pull-it-stays', text: 'I pull. It stays. We are even.' }],
    use2: [{ id: 'fallback.use2.l-objet-with-cible', text: '{objet} with {cible}? No. Good try though.' }, { id: 'fallback.use2.l-these-do-not-go', text: 'These do not go together. Like cats and baths.' }],
  },
  kinds: [
    { id: 'kind.pull-cat', verb: 'pull', kind: 'cat', say: 'Never pull a cat. Cat law, article one.' },
    { id: 'kind.push-cat', verb: 'push', kind: 'cat', say: 'Never push a sleeping cat. Cat law, article two.' },
    { id: 'kind.take-cat', verb: 'take', kind: 'cat', say: '{nom} is heavier than he looks. Mostly fur.' },
    { id: 'kind.talk-cat', verb: 'talk', kind: 'cat', say: '{nom} says: zzzz. Very deep thoughts.' },
    { id: 'kind.use-cat', verb: ['use', 'give'], kind: 'cat', say: '{nom} purrs and goes back to sleep.' },
    { id: 'kind.take-person', verb: 'take', kind: 'person', say: 'I cannot carry {nom}. But {nom} can carry me.' },
    { id: 'kind.push-person', verb: ['push', 'pull'], kind: 'person', say: 'Pushing people around? Not my style. I am a nice cat.' },
  ],
  on: [
    // Once the note is read, the shell phone calls Lou (two voices on the line). Before that, it gives hints.
    { id: 'game.talk-shell-phone', verb: 'talk', a: 'shell_phone', if: { all: ['lou_has_key', { not: { unlocked: 'market' } }] }, do: [
      { say: ['hero', 'Shell phone, call Lou!'], id: 'game.talk-shell-phone.l-shell-phone-call' },
      { phone: ['neighbor', 'seller'], do: [
        { id: 'game.talk-shell-phone.l-lou-speaking-oh', say: ['neighbor', 'Lou speaking. Oh, hi Pixel!'] },
        { say: ['hero', 'Lou! You have Grandma\'s key!'], id: 'game.talk-shell-phone.l-lou-you-have' },
        { id: 'game.talk-shell-phone.l-had-i-am-at-the', say: ['neighbor', 'Had. I am at the market. Come and get it!'] },
        { id: 'game.talk-shell-phone.l-lou-your-lantern', say: ['seller', 'LOU! Your lantern is ready!'], shout: true },
        { id: 'game.talk-shell-phone.l-hurry-up-it-is', say: ['neighbor', 'Hurry up, it is busy here. Bye!'] },
      ] },
      { unlock: 'market' }, { sfx: 'bell' }, { id: 'game.talk-shell-phone.l-new-on-the-map', toast: 'New on the map: the market' },
    ] },
  ],
};
