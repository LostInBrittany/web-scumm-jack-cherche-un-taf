import type { GameRules } from '@quest-n-click/engine/content';

// Fallback answers per verb (drawn at random, never twice in a row) and reactions by kind.
export const rules: GameRules = {
  fallbacks: {
    give: ['Personne ne veut de ça.', 'Je le garde. On ne sait jamais.'],
    open: ['Ça ne s\'ouvre pas.', 'Fermé. Très fermé.'],
    close: ['C\'est déjà fermé.'],
    take: ['Je le laisse là.', 'Trop lourd. Je n\'ai que des os.', 'Ce n\'est pas à moi.'],
    look: ['Rien de spécial.', 'Ça ressemble à ce que c\'est.', '{name}. Pas très effrayant.'],
    talk: ['Pas de réponse.', 'Ça ne parle pas. Ça écoute peut-être.'],
    use: ['Il ne se passe rien.', 'Ça ne fait rien. Pour l\'instant.'],
    push: ['Ça ne bouge pas.'],
    pull: ['Ça ne vient pas.'],
    use2: ['Ça ne va pas ensemble.', 'Non. Même avec de la colle.'],
  },
  kinds: [
    { verb: 'take', kind: 'person', say: 'Je ne peux pas porter {name}. Je suis un squelette, pas une grue.' },
    { verb: 'push', kind: 'person', say: 'On ne pousse pas les gens. Même pour le travail.' },
    { verb: 'pull', kind: 'person', say: 'Tirer {name} ? Il pourrait se détacher un morceau.' },
  ],
  on: [],
};
