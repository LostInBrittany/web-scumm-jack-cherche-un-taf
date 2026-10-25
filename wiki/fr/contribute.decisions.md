# Décisions et ADR

Un index des décisions consignées du projet : les décisions datées du mainteneur (D1 à D50) et les ADR, les
enregistrements de décisions d'architecture (ADR 0001 à 0030). Les deux vivent dans la documentation publique de
développement, `docs/dev/`, en anglais ; cette page les indexe, elle ne les recopie pas. Les titres des ADR ci-dessous
sont ceux des fichiers, en anglais.

<a name="where"></a>

## Où elles vivent

| Registre | Fichier | Ce qu'est une entrée |
|---|---|---|
| Décisions | [`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md) | Une ligne par décision, datée, écrite par l'assistant qui l'a reçue, jamais sans décision humaine ; les mots du mainteneur cités (souvent en français, avec l'anglais à côté) |
| ADR | [`docs/dev/adr/`](../../docs/dev/adr/README.md) | Un fichier par décision qui semble surprenante sans son contexte : le contexte, la décision, ce qu'elle coûte, ce qui la ferait changer |
| L'échange | [`docs/dev/LOG.md`](../../docs/dev/LOG.md) | Des entrées numérotées, datées, jamais réécrites (propositions, relectures, réponses) qui mènent aux décisions |

`DECISIONS.md` se termine par une liste « Pending (asked, not decided) » ; au 23 octobre 2026 elle dit « (none) ». Il
n'y a pas de D6 : la numérotation passe de D5 à D7.

<a name="adrs"></a>

## Les ADR

| ADR | Décision |
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

## Les décisions du mainteneur, par période

Une ligne chacune ; le texte complet, avec les mots du mainteneur, est dans `DECISIONS.md`.

| Décisions | Dates | Ce qu'elles tranchent |
|---|---|---|
| D1–D4 | 4 oct. 2026 | La v3 peut casser la v2, chaque rupture avec sa migration (D1) ; le modèle de branches de la v3 (D2) ; le mainteneur tranche chaque désaccord et l'échange est committé dans `docs/dev/`, en anglais (D3) ; le but : une v3 à laquelle un petit studio ferait confiance (D4) |
| D5, D7–D9 | 4 oct. 2026 | Le jeu entier hors ligne après la première visite (D5) ; `main` est la branche de release après la v3.0.0, WebKit bloquant après trois exécutions vertes (D7) ; le jeu privé de référence reste en 3.1.0 (D8) ; une branche à la fois, fusionnée sur CI verte, relue ensuite (D9) |
| D10–D13 | 5 oct. 2026 | Un rendu Canvas 2D à côté de celui du DOM (D10) ; les versions 3.3.1 à 3.5 (D11) ; les barrières humaines rapportées, non bloquantes (D12) ; le chapitre de référence reprend l'art de la démo (D13) |
| D14–D17 | 6 oct. 2026 | La ligne 4.1.x avant la 4.2 (D14) ; l'enveloppe signée du Reality Bridge (D15), Biscuit sur le Bridge seulement (D16), Server-Sent Events, pas de WebSocket (D17) |
| D18–D29 | 7–8 oct. 2026 | Le programme 4.1.8–4.1.15 (D18) ; les connecteurs en processus séparés (D19) ; le stockage du Bridge (D20) ; le rendu n'est pas une source d'état (D21) ; le DSL stabilisé puis gelé (D22, D28) ; LiveSplit et OBS en local (D23) ; l'horloge du run observe (D24) ; les stratégies de Remix, les graines Mystery et Daily, la variance de présentation (D25–D27) ; une catégorie de speedrun nomme son monde (D29) |
| D30–D37 | 8–14 oct. 2026 | La signature des tags repoussée à la 4.2 (D30) ; le résultat d'un mini-jeu prouvé (D31) ; 4.1.18, 4.1.19, 4.1.20 (D32–D34) ; une passe qualifie une surface (D35) ; deux modes de restauration (D36) ; la racine de confiance est la clé logicielle du mainteneur, chaque tag signé demande son propre oui explicite (D37) |
| D38–D46 | 15–20 oct. 2026 | La 4.2.0 sort avant les passes humaines, sur un périmètre stable réduit (D38) ; le Studio Server en trois correctifs 4.2.x, hébergé derrière OIDC (D39–D41) ; les choix de la 4.2.2 et de la 4.2.3 (D42–D45) ; des champs facultatifs de présentation seulement en 4.2.x (D46) |
| D47–D50 | 20–23 oct. 2026 | Le projet devient quest'n'click (D47) ; main est la ligne 4.3 (D48) ; la 4.3 « Hero Choice » (D49) ; la documentation passe à un wiki généré depuis `wiki/`, et le oui pour signer la v4.5.0 (D50) |

<a name="related"></a>

## Identifiants liés

- [Gouvernance](contribute.governance.md) : qui décide, et comment une décision est consignée.
- [Architecture](contribute.architecture.md#decisions) relie les ADR qui fondent la conception du moteur.
