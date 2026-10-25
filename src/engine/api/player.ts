// quest-n-click/player (4.0): what a build's entry starts the game with, and what a host can plug in (a save store, a
// renderer's contract). Public (wiki/en/start.stability.md).
export { bootGame, openStore, pickLanguage } from '../boot';
export type { BootOptions, Locales, StoreOpener, SwModule } from '../boot';
export type { AssetManifest } from '../dom/assets';
export type { SaveStore, SlotStore, Presenter } from '../core/ports';
export type {
  SceneRenderer,
  SpriteSpec,
  LayerSpec,
  OccluderSpec,
  LightSpec,
  EmitterSpec,
  StageSpec,
} from '../dom/renderer';
// 4.1.11 (ADR 0011): the scene frame a renderer is given, the intentions it answers with, the renderer contract.
export type { SceneFrame, Intent, Renderer } from '../scene/frame';
