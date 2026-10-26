// The game's own tests (game/tests). They import the engine through its public entry points
// (@quest-n-click/engine/testing, /content…), which the package declares: no alias needed.
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['game/tests/**/*.test.ts'] } });
