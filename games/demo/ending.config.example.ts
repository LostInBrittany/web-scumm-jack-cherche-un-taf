// Example configuration of the sealed ending (npm run seal -- --outcome=<key>).
// The real one lives in games/demo/private/ending.config.ts (gitignored); without it, `npm run seal` uses this file.
// Only the chosen outcome is encrypted into public/data/dossier.bin; none of these texts ever enters the JS bundle
// (npm run check:spoilers verifies it after a build). The outcome key is compared with the player's guess (flag `guess`).
import type { EndingConfig } from '../../scripts/seal-types';

export const config: EndingConfig = {
  // Must match `ending.password.given` in games/demo/game.ts.
  password: 'sardines-for-everyone',
  outcomes: {
    sardines: {
      ticket: '<b>SARDINES!</b><br>Twelve shiny sardines in a tin.',
      headline: 'Pixel found the sardines!',
      lines: ['Biscuit got half. Ish.'],
    },
    mouse: {
      ticket: '<b>A MOUSE!</b><br>It ate the sardines. It says sorry.',
      headline: 'A very full mouse.',
      lines: ['The mouse and Pixel are now friends.'],
    },
    nothing: {
      ticket: '<b>NOTHING!</b><br>Grandma moved the sardines to the fridge.',
      headline: 'The pantry was empty.',
      lines: ['The fridge, however...'],
    },
  },
  message: 'Thanks for playing The Pantry Key.\nNow go and give your cat a cuddle.',
  photos: [],
  lines: ['Made with web-scumm.'],
};
