# Contribuer avec des agents IA

quest'n'click est fait avec des assistants IA et relu par des personnes. Cette page dit comment un assistant (Claude
Code, Cursor, Codex, Gemini CLI, Aider ou un agent écrit à la main) se met en place dans le dépôt du moteur, quelles
règles il suit, et comment son travail est vérifié avant d'être fusionné.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un assistant qui lit d'abord les règles du projet, modifie le contenu et le code par les mêmes commandes et les mêmes
outils MCP qu'une personne, vérifie son propre travail avec les commandes de vérité, trouve la documentation section
par section au lieu de deviner, et dont le changement est relu par un second contexte avant que le mainteneur le
fusionne.

<a name="context-and-versions"></a>

## Contexte et versions

Le dépôt du moteur. `AGENTS.md` et le serveur MCP existent depuis la 1.0.0 ; les outils de documentation
`search_docs`, `list_docs` et `read_doc { id, section }` depuis la 4.5.0 (`read_doc { name }`, la page historique,
existe avant ; depuis la 4.5.0, elle peut réduire une longue section à un renvoi vers `read_doc { id, section }`).

<a name="prerequisites"></a>

## Prérequis

- Un dépôt préparé : [Préparer son poste de développement](contribute.setup.md).
- Un assistant capable de lancer des commandes shell, ou un client MCP
  ([Configurer le MCP local](studio.mcp-setup.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le dépôt du moteur, sur votre machine ; l'assistant part de la racine du dépôt, où il trouve `AGENTS.md`,
`.mcp.json` et `.cursor/mcp.json`.

<a name="how-it-is-made"></a>

## Comment le projet est fait

```text
src/engine/      core (le DSL, le moteur), tools (validate, solve, lint, i18n…), dom (le lecteur), minigames, reality
games/demo/      le jeu d'exemple : pièces, mises en page, images, son, langues, storyboard
games/_template/ copié par npm run new-game
tools/           les commandes, le Studio, le serveur MCP, les pipelines d'image et de son, les plugins Vite
bridge/          le Bridge Reality (le package @quest-n-click/bridge)
connectors/      les connecteurs du monde extérieur (le package @quest-n-click/connectors)
wiki/            la documentation, en anglais et en français (4.5.0) ; docs/dev : le journal de travail, les décisions, les passes de chaque release
```

Jusqu'à la 4.5.0, la documentation vivait dans `docs/en` et `docs/fr` ; ce sont désormais des pages de transition vers le
wiki. Le moteur, le solveur et le rejeu partagent un seul chemin de code ([Architecture](contribute.architecture.md),
[Visite du code](contribute.code-tour.md)).

**Fait avec un assistant IA, relu par des personnes.** Le contenu est déclaratif : un assistant le lit et l'écrit comme
n'importe quel fichier (`AGENTS.md` en donne les règles) ; chaque opération est une commande et un outil MCP
([Outils MCP](studio.mcp-tools.md)) ; après chaque changement il peut valider, résoudre, rejouer et faire une capture,
et voit ses erreurs avant qu'une personne les voie. Chaque résultat reste relisible, dans le Studio et dans Git.

<a name="steps"></a>

## Étapes

<!-- step: read-agents -->
1. **Faites lire d'abord [`AGENTS.md`](../../AGENTS.md) à l'assistant.** Il ne dépend d'aucun fournisseur : tout
   assistant le lit. [`CLAUDE.md`](../../CLAUDE.md) y renvoie pour Claude Code, avec ce qui lui est propre (les skills,
   le MCP par `.mcp.json`). `AGENTS.md` contient :
   - les fichiers qu'un assistant modifie et qui modifie chacun (le storyboard d'abord ; les pièces surtout par l'IA ;
     les layouts jamais à la main, mais par le Studio ou la page de placement ; `notes.json` partagé par les deux) ;
   - les commandes qui disent la vérité (`validate`, `solve`, `npm test`, `e2e`, `assets`, `prompts`, `audio`, `build`,
     `studio`, `mcp`, `i18n`, `lint`, `playtests`, `ids`, `prove:game`, `doctor`, `dev:lan`, et `GAME=<id>`) ;
   - treize règles. Celles qu'un contributeur du moteur croise le plus : le contenu est une donnée, aucune fonction dans
     `games/` ; ne jamais inventer de coordonnées ; après tout changement de contenu, lancer
     `npm run validate && npm run solve && npm test` et rapporter la sortie, pas un résumé ; après tout changement
     visuel, faire une capture et la regarder ; ne jamais supprimer un asset, le renommer `_v1` ; dans le doute, écrire
     une note dans `notes.json` au lieu de deviner ; lire les mécaniques classiques avant de demander une nouvelle
     commande ; ne jamais déposer dans `audio/` un son d'origine inconnue.

<!-- step: mcp -->
2. **Branchez le serveur MCP** quand l'assistant parle MCP. `npm run -s mcp` sert les opérations du Studio comme outils
   (`get_room`, `set_text`, `add_note`, `validate`, `solve`, `screenshot`, `read_doc`…). Le dépôt l'enregistre pour
   Claude Code (`.mcp.json`) et Cursor (`.cursor/mcp.json`) :

   ```json
   {
     "mcpServers": {
       "quest-n-click": { "type": "stdio", "command": "npm", "args": ["run", "-s", "mcp"], "env": {} }
     }
   }
   ```

   Les autres clients : [Configurer le MCP local](studio.mcp-setup.md). L'humain voit les modifications de l'assistant
   en direct dans le Studio et répond par l'onglet Notes ; une note marquée `task: true` dans `notes.json` est une
   demande de l'humain (écrite depuis l'Assistant du Studio) : l'assistant la fait, puis répond avec `add_note` sur le
   même `about`.

<!-- step: docs -->
3. **Laissez-le trouver la documentation par section.** Avec le serveur MCP :
   - `search_docs { query, lang?, context?, version? }` renvoie des résultats `id#section` avec un extrait et la raison
     de la correspondance, ou une liste vide explicite quand rien ne correspond avec assez de confiance ;
   - `read_doc { id, section, lang? }` lit cette section (20 000 caractères par défaut, un `cursor` pour la suite),
     avec en tête d'où vient le texte (version, commit, révision de la doc) ;
   - `list_docs { audience?, context?, type?, lang? }` liste les pages à lire.

   `read_doc { name: "CONTENT_GUIDE" }` renvoie toujours une page historique en un bloc, peut-être abrégée : une
   longue section donne son titre, son premier paragraphe et le `read_doc { id, section }` de la suite. Préférez `id`
   et `section`.

<!-- step: skills -->
4. **Utilisez les skills du projet (Claude Code).** `.claude/skills/` contient `new-game`, `new-room`, `new-character`,
   `storyboard`, `placement`, `review`, `production-plan`, `asset-prompts` et `megadrive-audio`.

<!-- step: check-own-work -->
5. **Faites-lui vérifier son propre travail, et dire ce qu'il n'a pas pu vérifier.** Avant une pull request,
   l'assistant déroule la liste d'[Avant une pull request](contribute.before-a-pr.md), une suite de tests à la fois, et
   rapporte les commandes avec leur sortie. Une vérification qu'il n'a pas pu lancer (pas de navigateur, pas de Python)
   est dite, jamais sautée en silence.

<!-- step: second-context -->
6. **Faites-le relire par un second contexte.** Un changement d'un certain poids est relu par un contexte qui ne l'a
   pas écrit (une autre session, un sous-agent), qui reproduit avant de juger et classe ses constats (`blocker`,
   `should`, `nit`), puis par le mainteneur ([Gouvernance](contribute.governance.md)). La vérification par un assistant
   de ses propres pages du wiki est consignée comme telle (`--kind ai --relation author`), jamais comme la relecture
   d'une personne ([Écrire la documentation](contribute.writing-docs.md#reviews)).

> [!LIMIT id=no-approval-by-agent]
> Un assistant ne donne jamais les approbations du mainteneur : signer un tag de release, approuver une passe de
> terrain reportée ou consigner une relecture humaine demandent chacun le oui explicite du mainteneur (D37).

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le rapport de l'assistant nomme les commandes lancées et leur sortie ; `npm run -s mcp` liste les outils dans le
client ; `search_docs` répond avec des sections de `wiki/`. La pull request passe `pr-gate`, et le LOG ou la pull
request dit ce que la seconde lecture a trouvé.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Le client MCP ne liste aucun outil | Il a été lancé hors du dépôt, ou `npm ci` n'a pas été fait | Lancez-le depuis la racine du dépôt ; faites `npm ci` |
| L'assistant invente des coordonnées | Il a sauté la règle 2 d'`AGENTS.md` | Demandez à l'humain de placer les choses dans le Studio ou la page de placement, puis lisez le JSON |
| La machine chauffe, les tests traînent | Plusieurs suites de tests en même temps, ou des workers Vitest orphelins | Une suite à la fois ; arrêtez les workers restants par leur numéro de processus |
| Un rapport dit « tout est vert » sans sortie | La sortie des commandes de vérité a été résumée | Demandez la sortie elle-même (règle 5) |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Ce que l'assistant modifie (`games/<id>/`, `src/`, `wiki/`…), `games/<id>/notes.json` par `add_note`, et le fragment
`changes/` de la branche. Les fichiers de configuration MCP sont suivis par Git et n'ont pas à changer.

<a name="recovery"></a>

## Revenir en arrière

Tout ce qu'écrit l'assistant est dans Git et dans l'annulation du Studio : `git restore` ou `git revert` le défait.

<a name="references"></a>

## Références

- [`AGENTS.md`](../../AGENTS.md), [`CLAUDE.md`](../../CLAUDE.md), [`.mcp.json`](../../.mcp.json).
- [Travailler avec une IA sur un jeu](create.working-with-ai.md), [Outils MCP](studio.mcp-tools.md),
  [Configurer le MCP local](studio.mcp-setup.md).
- [Gouvernance](contribute.governance.md), [Avant une pull request](contribute.before-a-pr.md).
