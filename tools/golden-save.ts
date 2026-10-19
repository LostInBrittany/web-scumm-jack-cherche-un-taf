// npx tsx tools/golden-save.ts <version>: the golden save of a release (tests/fixtures/saves/demo-<v>.json), eight inputs into the demo's witness.
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { replay } from '@engine/tools/replay';
import { saveEnvelope } from '@engine/core/save';
import type { Engine } from '@engine/core/engine';
import { game, layouts, commands } from '../games/demo';
import { flushExit } from './flush';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: npx tsx tools/golden-save.ts <x.y.z>');
  process.exit(2);
}
const out = JSON.parse(
  execSync('GAME=demo PROOF_CACHE=0 npx tsx tools/solve.ts --json', { maxBuffer: 1 << 26 }).toString(),
);
const log = out.steps;
const cut = 9; // the start entry and 8 inputs
let engine: Engine | undefined;
await replay(
  game,
  layouts,
  { start: { kind: 'new' }, log },
  {
    commands,
    upTo: cut,
    onEntry: (_i, e) => {
      engine = e;
    },
  },
);
const envelope = saveEnvelope(game, engine!.state);
envelope.savedAt = Date.parse(new Date().toISOString().slice(0, 10));
writeFileSync(
  `tests/fixtures/saves/demo-${version}.json`,
  JSON.stringify(
    {
      engine: version,
      made: `npm run solve witness at v${version}, 8 inputs replayed, saveEnvelope()`,
      envelope,
      remaining: log.slice(cut),
    },
    null,
    1,
  ) + '\n',
);
console.log(`demo-${version}.json: ${log.length - cut} inputs remaining`);
await flushExit(0);
