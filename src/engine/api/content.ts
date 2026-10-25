// quest-n-click/content (4.0): what a game's sources are written with. Public: its names follow wiki/en/start.stability.md (a
// change is announced, a removal waits for the next major). Everything else of src/engine is internal.
export { defineGame, defineRoom, compileGame, EMPTY_LAYOUT, FLOOR, NEAR } from '../core/define';
export type { GameSource, CompiledGame } from '../core/define';
export type * from '../core/types';
export type { CustomCommand, CustomCommands, CustomContext } from '../core/custom';
// 4.1.12 (ADR 0013, 0014): the game's intermediate representation, the canonical text it is hashed through, and the
// solver's 100% goal from the objectives.
export { canonicalJson } from '../core/canonical';
export { compileIR, logicView, provenanceOf } from '../core/ir';
export type {
  CompileIROptions,
  ExtensionHashes,
  GameIR,
  IrEntity,
  IrExtensions,
  IrObjective,
  IrRealityPolicies,
  IrRoom,
  IrRule,
  IrScript,
  IrSource,
  IrVariantSlot,
  IrWorld,
} from '../core/ir';
export { completionGoal } from '../core/objectives';
// 4.1.15 (ADR 0018): Remix. The variation manifest a game declares (`GameDef.remix`, `RoomDef.anchors`), the world a
// seed makes, and the game as that world makes it; seed codes; the code wheel's parameters and the wheel of a seed.
export type {
  AnchorDef,
  AnchorRef,
  CoupledPair,
  RemixText,
  VariationConstraint,
  VariationDimension,
  VariationManifest,
  VariationMode,
} from '../core/remix/manifest';
export { parseManifest, REMIX_ALGORITHM_VERSION, variantFlag } from '../core/remix/manifest';
export type { CompiledManifest, RemixWorld, WorldVariant } from '../core/remix/compile';
export {
  CATALOGUE_MAX,
  catalogue,
  compileManifest,
  compileVariant,
  loadVariant,
  RemixManifestError,
  storyVariant,
} from '../core/remix/compile';
export type { ApplyOptions } from '../core/remix/apply';
export { applyStory, applyVariant, compileGameManifest, remixWorld } from '../core/remix/apply';
export {
  encodeSeedCode,
  isSeed,
  newSeedCode,
  normalizeSeed,
  RemixSeedError,
  STORY_SEED,
} from '../core/remix/seed-code';
export type { CodeWheel, CodeWheelMode, CodeWheelParams, WheelItem, WheelRecord } from '../core/remix/code-wheel';
export { checkWheel, CODE_WHEEL_VERSION, generateWheel, wheelProblems, wheelTable } from '../core/remix/code-wheel';
