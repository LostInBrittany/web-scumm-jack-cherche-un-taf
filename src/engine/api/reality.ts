// quest-n-click/reality (4.1.1): signals from the world outside, for a game, a test or a custom transport. The signed
// signal and its verification, the player's client and its HTTP transport, the Studio's simulator, a game's manifest.
// Public (wiki/en/start.stability.md); the reference Bridge itself is the separate package quest-n-click-bridge.
export {
  verifySignal,
  signSignal,
  importBridgeKey,
  MAX_SIGNAL_CHARS,
  WorldSignalV1Schema,
  WorldSignalV2Schema,
} from '../reality/protocol';
export type {
  WorldSignalV1,
  WorldSignalV2,
  WorldSignal,
  SignalEnvironment,
  SignedWorldSignalV1,
  BridgeKey,
  Keyring,
  SignalExpectation,
  VerifyResult,
  RefusalCode,
} from '../reality/protocol';
export { RealityClient } from '../reality/client';
export type { RealityClientOptions } from '../reality/client';
export { httpPort } from '../reality/http-port';
export type { HttpPortOptions } from '../reality/http-port';
export { SignalSimulator } from '../reality/simulator';
export type { Fault, SimulatedDelivery } from '../reality/simulator';
export { realityManifest, manifestHash } from '../reality/manifest';
export type { RealityManifest } from '../reality/manifest';
export type { WorldSignalPort } from '../core/ports';
// 4.1.15 (D26): the daily challenge and the Mystery commitment, checked offline with the game's daily key.
export { revealMatches, verifyCommitment, verifyDayToken } from '../reality/daily';
export type { CommitToken, DayToken, TokenResult } from '../reality/daily';
