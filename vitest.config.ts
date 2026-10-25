// The game's own tests (game/tests), with the engine's public API resolved from the installed package,
// the same paths as tsconfig.json.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const engine = fileURLToPath(new URL('./node_modules/@quest-n-click/engine/src/engine/', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@quest-n-click\/engine\/(content|player|minigames|testing|reality)$/, replacement: `${engine}api/$1.ts` },
      { find: /^@engine\/(.*)$/, replacement: `${engine}$1` },
    ],
  },
  test: { include: ['game/tests/**/*.test.ts'] },
});
