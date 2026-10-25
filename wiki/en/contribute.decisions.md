# Decisions and ADRs

An index of the project's recorded decisions: the maintainer's dated decisions (D1 to D50) and the architecture
decision records (ADR 0001 to 0030). Both live in the public development documentation, `docs/dev/`, in English; this
page indexes them, it does not copy them. The ADR titles below are the files' own.

<a name="where"></a>

## Where they live

| Record | File | What one entry is |
|---|---|---|
| Decisions | [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md) | One line per decision, dated, written by the assistant who received it, never without a human decision; the maintainer's words quoted (often in French, with the English beside them) |
| ADRs | [`docs/dev/adr/`](../../docs/dev/adr/README.md) | One file per decision that looks surprising without its context: the context, the decision, what it costs, what would change it |
| The exchange | [`docs/dev/LOG.md`](../../docs/dev/LOG.md) | Numbered, dated, append-only entries (proposals, reviews, answers) that lead to the decisions |

`DECISIONS.md` ends with a "Pending (asked, not decided)" list; on 23 October 2026 it says "(none)". There is no D6:
the numbering goes from D5 to D7.

<a name="adrs"></a>

## Architecture decision records

| ADR | Decision |
|---|---|
| [0001](../../docs/dev/adr/0001-dom-renderer.md) | The DOM is the reference renderer |
| [0002](../../docs/dev/adr/0002-declarative-content.md) | Content is data; code a game needs is trusted and named |
| [0003](../../docs/dev/adr/0003-solver-runs-the-engine.md) | The solver runs the real engine |
| [0004](../../docs/dev/adr/0004-session-unit-of-reproduction.md) | A session is the unit of reproduction |
| [0005](../../docs/dev/adr/0005-indexeddb-read-back.md) | A save is read back before it counts |
| [0006](../../docs/dev/adr/0006-double-tap-default-verb.md) | A double tap acts with the verb a player means |
| [0007](../../docs/dev/adr/0007-biscuit-and-signed-events.md) | Biscuit authorises a connector; a signature attests an event (4.1.1) |
| [0008](../../docs/dev/adr/0008-connector-sdk.md) | A connector is a process of its own, behind one small SDK (4.1.9) |
| [0009](../../docs/dev/adr/0009-reality-store.md) | The Bridge keeps its state behind an asynchronous `RealityStore` (4.1.10) |
| [0010](../../docs/dev/adr/0010-signal-v2.md) | `SignalV2`: a signed signal names the context it was signed for (4.1.10) |
| [0011](../../docs/dev/adr/0011-scene-frame-intents-journal.md) | A scene frame, intentions and a semantic journal (4.1.11) |
| [0012](../../docs/dev/adr/0012-canvas-backend.md) | Canvas 2D stays the complete backend; WebGL/Pixi not measured in 4.1.11 |
| [0013](../../docs/dev/adr/0013-game-ir-and-fingerprint.md) | One intermediate representation of a game (GameIR) and its fingerprint (4.1.12) |
| [0014](../../docs/dev/adr/0014-objectives.md) | Objectives and the quest journal, the one primitive family admitted in 4.1.12 |
| [0015](../../docs/dev/adr/0015-compact-state.md) | A search stores its states by index, with exact interned keys (4.1.13 "Solver Research") |
| [0016](../../docs/dev/adr/0016-run-clock-and-envelope.md) | A run clock that observes, a seeded generator, a chained proof of a run (4.1.14) |
| [0017](../../docs/dev/adr/0017-speedrun-verdicts-and-trust.md) | Speedrun verdicts and trust levels (4.1.14) |
| [0018](../../docs/dev/adr/0018-variation-manifest-and-world-variant.md) | A variation manifest compiles to an immutable world (4.1.15) |
| [0019](../../docs/dev/adr/0019-run-world-binding.md) | A run is bound to the world it was played in (4.1.16) |
| [0020](../../docs/dev/adr/0020-minigame-transcripts.md) | A minigame's result is computed again from its transcript (4.1.17) |
| [0021](../../docs/dev/adr/0021-backup-snapshot-and-atomic-restore.md) | A backup is one snapshot; a restore is all or nothing (4.1.19) |
| [0022](../../docs/dev/adr/0022-hero-choice.md) | The player chooses the hero: variant names, text switches, portraits in a choice (4.3.0) |
| [0023](../../docs/dev/adr/0023-backup-completeness-and-restore-modes.md) | A backup says what it holds; a restore says its mode (4.1.20) |
| [0024](../../docs/dev/adr/0024-pass-surfaces-and-carry-attestations.md) | A pass is bound to its surface, and carried only by a signed attestation (4.1.20) |
| [0025](../../docs/dev/adr/0025-studio-server.md) | One shared game, edited live: transactions, one owner per file, revisions (4.2.1) |
| [0026](../../docs/dev/adr/0026-saves-across-revisions.md) | Saves across revisions: the envelope unchanged, a question before resuming (4.2.2) |
| [0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md) | The Studio Server's identity: OIDC for who, the Studio for what (4.2.1) |
| [0028](../../docs/dev/adr/0028-studio-content-execution.md) | Where a hosted Studio runs the game's code: a worker without secrets (4.2.1) |
| [0029](../../docs/dev/adr/0029-remote-mcp.md) | The remote MCP: the same checks as the API, by going through it (4.2.3) |
| [0030](../../docs/dev/adr/0030-documentation-from-wiki-sources.md) | The documentation is generated from one source in the repository, and published per release (4.5.0) |

<a name="decisions-index"></a>

## The maintainer's decisions, by period

One line each; the full text, with the maintainer's own words, is in `DECISIONS.md`.

| Decisions | Dates | What they settle |
|---|---|---|
| D1–D4 | 4 Oct 2026 | v3 may break v2, each break with its migration (D1); the v3 branch model (D2); the maintainer arbitrates every disagreement and the exchange is committed in `docs/dev/`, in English (D3); the goal: a v3 a small studio would trust (D4) |
| D5, D7–D9 | 4 Oct 2026 | The whole game offline after the first visit (D5); `main` is the release branch after v3.0.0, WebKit gated after three green runs (D7); the private reference game stays on 3.1.0 (D8); one branch at a time, merged on green CI, reviewed afterwards (D9) |
| D10–D13 | 5 Oct 2026 | A Canvas 2D renderer beside the DOM one (D10); the 3.3.1–3.5 releases (D11); human gates reported, not blocking (D12); the reference chapter reuses the demo's art (D13) |
| D14–D17 | 6 Oct 2026 | The 4.1.x line before 4.2 (D14); the Reality Bridge's signed envelope (D15), Biscuit on the Bridge only (D16), Server-Sent Events, no WebSocket (D17) |
| D18–D29 | 7–8 Oct 2026 | The 4.1.8–4.1.15 programme (D18); connectors as separate processes (D19); the Bridge's storage (D20); rendering is not a source of state (D21); the DSL stabilised then frozen (D22, D28); LiveSplit and OBS local (D23); the run clock observes (D24); Remix strategies, Mystery and Daily seeds, presentation variance (D25–D27); a speedrun category names its world (D29) |
| D30–D37 | 8–14 Oct 2026 | Tag signatures put off to 4.2 (D30); a minigame's result proved (D31); 4.1.18, 4.1.19, 4.1.20 (D32–D34); a pass qualifies a surface (D35); two restore modes (D36); the trust root is the maintainer's software key, each signed tag needs its own explicit yes (D37) |
| D38–D46 | 15–20 Oct 2026 | 4.2.0 ships before the people's passes, on a reduced stable scope (D38); the Studio Server as three 4.2.x patches, hosted behind OIDC (D39–D41); 4.2.2's and 4.2.3's choices (D42–D45); optional presentation-only fields in 4.2.x (D46) |
| D47–D50 | 20–23 Oct 2026 | The project becomes quest'n'click (D47); main is the 4.3 line (D48); 4.3 "Hero Choice" (D49); the documentation moves to a wiki generated from `wiki/`, and the yes to sign v4.5.0 (D50) |

<a name="related"></a>

## Related identifiers

- [Governance](contribute.governance.md): who decides, and how a decision is recorded.
- [Architecture](contribute.architecture.md#decisions) links the ADRs behind the engine's design.
