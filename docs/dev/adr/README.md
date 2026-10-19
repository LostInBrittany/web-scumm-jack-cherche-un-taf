# Architecture decision records

Decisions that look surprising without their context (4.1.0 "Clarity"). One file each: the context, the decision,
what it costs, what would change it. The maintainer's decisions themselves are dated in `docs/dev/DECISIONS.md`.

| # | Decision |
|---|---|
| [0001](0001-dom-renderer.md) | The DOM is the reference renderer |
| [0002](0002-declarative-content.md) | Content is data; code a game needs is trusted and named |
| [0003](0003-solver-runs-the-engine.md) | The solver runs the real engine |
| [0004](0004-session-unit-of-reproduction.md) | A session is the unit of reproduction |
| [0005](0005-indexeddb-read-back.md) | A save is read back before it counts |
| [0006](0006-double-tap-default-verb.md) | A double tap acts with the verb a player means |
| [0007](0007-biscuit-and-signed-events.md) | Biscuit authorises a connector; a signature attests an event (4.1.1) |
| [0008](0008-connector-sdk.md) | A connector is a process of its own, behind one small SDK (4.1.9) |
| [0009](0009-reality-store.md) | The Bridge keeps its state behind an asynchronous `RealityStore` (4.1.10) |
| [0010](0010-signal-v2.md) | `SignalV2`: a signed signal names the context it was signed for (4.1.10) |
| [0011](0011-scene-frame-intents-journal.md) | A scene frame, intentions and a semantic journal (4.1.11) |
| [0012](0012-canvas-backend.md) | Canvas 2D stays the complete backend; WebGL/Pixi not measured in 4.1.11 |
| [0013](0013-game-ir-and-fingerprint.md) | One intermediate representation of a game (GameIR) and its fingerprint (4.1.12) |
| [0014](0014-objectives.md) | Objectives and the quest journal, the one primitive family admitted in 4.1.12 |
| [0015](0015-compact-state.md) | A search stores its states by index, with exact interned keys (4.1.13) |
| [0016](0016-run-clock-and-envelope.md) | A run clock that observes, a seeded generator, a chained proof of a run (4.1.14) |
| [0017](0017-speedrun-verdicts-and-trust.md) | Speedrun verdicts and trust levels (4.1.14) |
| [0018](0018-variation-manifest-and-world-variant.md) | A variation manifest compiles to an immutable world (4.1.15) |
| [0019](0019-run-world-binding.md) | A run is bound to the world it was played in (4.1.16) |
| [0020](0020-minigame-transcripts.md) | A minigame's result is computed again from its transcript (4.1.17) |
| [0021](0021-backup-snapshot-and-atomic-restore.md) | A backup is one snapshot; a restore is all or nothing (4.1.19) |
| [0023](0023-backup-completeness-and-restore-modes.md) | A backup says what it holds; a restore says its mode (4.1.20) |
| [0024](0024-pass-surfaces-and-carry-attestations.md) | A pass is bound to its surface, and carried only by a signed attestation (4.1.20) |
| [0025](0025-studio-server.md) | One shared game, edited live: transactions, one owner per file, revisions (4.2.1) |
| [0026](0026-saves-across-revisions.md) | Saves across revisions: the envelope unchanged, a question before resuming (4.2.2) |
| [0027](0027-studio-oidc-sessions-tokens.md) | The Studio Server's identity: OIDC for who, the Studio for what (4.2.1) |
| [0028](0028-studio-content-execution.md) | Where a hosted Studio runs the game's code: a worker without secrets (4.2.1) |
| [0029](0029-remote-mcp.md) | The remote MCP: the same checks as the API, by going through it (4.2.3) |
