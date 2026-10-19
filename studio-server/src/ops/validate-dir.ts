// The validator's verdict on a game folder (4.2.1): the Studio's guard runs it on its staging folder, and the
// processing worker (ADR 0028) runs it in a child process on a snapshot. One function, so both judge the same way.
import { join } from 'node:path';
import { validate as validateGame } from '../../../src/engine/tools/validate';
import { loadAssets, loadLayouts } from '../../../src/engine/tools/load';
import type { GameModule } from '../../../tools/game';
import type { ValidateResult } from '../../../tools/studio/types';

export async function validateDir(
  d: string,
  o: { root: string; importFresh: (file: string) => Promise<unknown>; mod?: GameModule },
): Promise<ValidateResult> {
  const t0 = Date.now();
  const mod = o.mod ?? ((await o.importFresh(join(d, 'index.ts'))) as GameModule);
  const layouts = loadLayouts(join(d, 'layout'));
  const assets = loadAssets(join(d, 'assets.gen.json'));
  let minigames: Record<string, { required?: string[] }> | undefined;
  try {
    const eng = (await o.importFresh(join(o.root, 'src/engine/minigames/index.ts'))) as {
      minigames: Record<string, { required?: string[] }>;
    };
    minigames = { ...eng.minigames, ...(mod.minigames ?? {}) };
  } catch {
    minigames = undefined;
  }
  const { errors, warnings } = validateGame(mod.game, layouts, {
    assets,
    commands: mod.commands,
    minigameIds: minigames ? Object.keys(minigames) : undefined,
    minigameParams: minigames
      ? Object.fromEntries(Object.entries(minigames).map(([k, m]) => [k, m.required ?? []]))
      : undefined,
    minigameBindings: minigames
      ? Object.fromEntries(
          Object.entries(minigames).map(([k, m]) => [
            k,
            (m as { bindings?: { images?: string[]; sfx?: string[] } }).bindings ?? {},
          ]),
        )
      : undefined,
  });
  return { ok: errors.length === 0, errors, warnings, ms: Date.now() - t0 };
}
