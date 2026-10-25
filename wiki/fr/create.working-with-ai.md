# Travailler avec une IA

quest'n'click est fait pour s'écrire avec un assistant IA : le jeu est une donnée, chaque étape a un outil qui dit si
elle est juste, et l'humain voit chaque changement dans le Studio. Cette page donne la méthode, le serveur MCP qui
confie les opérations du Studio à n'importe quel assistant, une session type, la recherche dans la documentation dont
se sert un agent, et le découpage d'un gros jeu entre sous-agents.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un assistant (Claude Code, Claude Desktop, Cursor, Codex CLI, Gemini CLI, ou un agent écrit par vous) qui lit et
modifie votre jeu comme le fait le Studio, vérifie son propre travail avec le validateur, le solveur, le lint et les
tests, et vous pose la question dans les notes quand il ne doit pas deviner. Vous suivez le résultat en direct dans
`npm run studio`.

<a name="context-and-versions"></a>

## Contexte et versions

- **Dépôt du moteur** : `npm run mcp`, avec `GAME=<id>` (ou `GAME_DIR=<dossier>`) pour un autre jeu que
  `package.json` → `config.game`. `AGENTS.md` à la racine est le manuel d'exploitation pour tout assistant ;
  `CLAUDE.md` y renvoie. Les compétences de `.claude/skills/` (`/storyboard`, `/new-room`, `/placement`, `/review`,
  `/production-plan`…) n'existent que dans ce dépôt.
- **Projet créé** : le même serveur se lance avec `npx quest-n-click mcp`, sur le jeu de `game/`.
- **Studio hébergé** : les mêmes outils atteignent un Studio Server, en tant que membre, en passant par ses
  vérifications : voir [MCP distant](team.remote-mcp.md).
- Le serveur MCP existe depuis 1.0.0, quand le projet s'appelait encore web-scumm ; il s'appelle `quest-n-click`
  depuis 4.2.5 (D47). Les outils de documentation `search_docs` et `list_docs`, et `read_doc { id }`, arrivent avec
  4.5.0.

<a name="prerequisites"></a>

## Prérequis

- Un jeu qui fonctionne : `npm run validate` et `npm run solve` passent ([Vérifier son jeu](create.checking.md)).
- Node 22.12 ou plus récent, la version que demandent les outils.
- Un client MCP configuré pour ce serveur : un bloc par client dans
  [MCP local : configurer chaque client](studio.mcp-setup.md). Dans le dépôt du moteur, Claude Code trouve `.mcp.json`
  et Cursor trouve `.cursor/mcp.json` : approuvez le serveur `quest-n-click` quand on vous le demande.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans le dépôt du moteur (ou dans le projet créé). Le client MCP lance le serveur lui-même, avec le
dépôt comme dossier de travail ; vous lancez le Studio dans un autre terminal pour suivre.

<a name="workflow"></a>

## La méthode

C'est la méthode qui a produit le premier jeu construit avec ce moteur : une aventure familiale de 9 lieux et
15 personnages, écrite et livrée en une seule journée par une seule personne travaillant avec Claude Code. Chaque étape
a un outil dans ce dépôt, et chaque étape se termine par quelque chose que l'auteur peut valider sur un téléphone avant
que la suivante ne commence.

| Étape | Ce que fait l'IA | Ce que vous validez | Page |
|---|---|---|---|
| 1. L'histoire d'abord, comme donnée | écrit `games/<id>/storyboard.json` (compétence `/storyboard`) | l'histoire, les répliques, les indices | [Le storyboard](create.storyboard.md) |
| 2. Le storyboard sur une page | `npm run page:storyboard`, publiée pour que vous annotiez depuis un téléphone | vos notes sous chaque case | [Pages de relecture](create.review-pages.md) |
| 3. Les images | `npm run prompts`, un prompt par planche | les planches que vous générez | [Images](create.images.md) |
| 4. Découper, détourer, relire | `tools/cut-sheet.py`, `npm run page:review` | garder / refaire / inutile, case par case | [Images](create.images.md) |
| 5. Les lieux | un fichier par lieu (compétence `/new-room`), puis `validate` et `solve` | — | [Lieux](create.rooms.md) |
| 6. Le placement | ne tape jamais de coordonnées : vous les demande | vous déplacez dans le Studio, `?edit=<room>` ou la page de placement | [Géométrie](create.geometry.md) |
| 7. Prouver que ça se joue | `npm test`, `npm run e2e`, regarde les captures | une partie sur votre téléphone | [Vérifier son jeu](create.checking.md) |
| 8. Livrer | `npm run build` | le lien que vous envoyez | [Construire et publier un jeu](create.build-release.md) |

Les règles que suit un agent sont celles d'`AGENTS.md` : le contenu est une donnée ; la logique dans `rooms/*.ts`, la
géométrie dans `layout/*.json` ; le storyboard change d'abord, le lieu ensuite ; après tout changement de contenu,
`npm run validate && npm run solve && npm test`, avec la sortie rapportée telle quelle, pas résumée ; une capture
regardée après tout changement visuel ; ne jamais supprimer un asset ; une note dans `notes.json` plutôt qu'une
supposition.

<a name="steps"></a>

## Étapes

<!-- step: start-studio -->
1. Lancez le Studio, pour voir ce que l'agent change.

   ```sh
   # dans le dépôt du moteur, sur votre machine (projet créé : npm run studio)
   npm run studio
   ```

<!-- step: connect-client -->
2. Branchez votre client sur le serveur MCP. La commande qu'il lance est :

   ```sh
   # dans le dépôt du moteur : ce que lance le client, en stdio
   npm run -s mcp
   ```

   ```sh
   # dans un projet créé : ce que lance le client, en stdio
   npx quest-n-click mcp
   ```

   Gardez `-s` (silencieux) : sans lui, npm imprime sa bannière `> quest-n-click mcp` sur stdout, qui ne doit porter
   que le protocole, et les clients stricts la refusent. Les journaux du serveur vont sur stderr ; il y écrit
   `[quest-n-click mcp] ready: game "<id>" (<dossier>)`. Les blocs de configuration de chaque client sont dans
   [MCP local : configurer chaque client](studio.mcp-setup.md).

<!-- step: typical-session -->
3. Demandez le travail, et laissez l'agent mener une session comme celle décrite plus bas.

<!-- step: answer-notes -->
4. Répondez à l'agent dans l'onglet **Notes** du Studio, ou en modifiant le storyboard. Il vous relit avec
   `get_notes`.

<a name="mcp-server"></a>

### Ce qu'est le serveur MCP

`npm run mcp` lance un serveur [Model Context Protocol](https://modelcontextprotocol.io) en **stdio**, nommé
`quest-n-click`, qui expose les opérations du Studio (`studio-server/src/ops/core.ts`) comme des outils. N'importe quel
client MCP lit et modifie alors un jeu exactement comme le Studio, et l'humain voit le résultat en direct dans
`npm run studio`, qui surveille les fichiers.

- Serveur : [`tools/mcp/server.ts`](../../tools/mcp/server.ts), SDK `@modelcontextprotocol/sdk` 1.x. Sa version est
  celle du moteur, lue dans `package.json`.
- Les outils sont définis une seule fois, dans [`tools/studio/tools.ts`](../../tools/studio/tools.ts), et partagés
  avec l'Assistant du Studio ([L'Assistant](studio.assistant.md)). Chacun, avec ses arguments :
  [Outils MCP](studio.mcp-tools.md). En bref : `list_rooms`, `get_room`, `set_layout`, `set_text`, `set_value`,
  `add_entity`, `get_storyboard`, `set_storyboard`, `get_notes`, `add_note`, `validate`, `solve`, `content_report`,
  `get_ir`, `world_graph`, `dialogue_tree`, `puzzle_graph`, `storyboard_coverage`, `playtests`, `lint`, `screenshot`,
  `search_docs`, `list_docs`, `read_doc`, `run_tests`, `asset_prompts`, `speedrun_verify`.
- Une opération qui échoue (lieu inconnu, mauvais chemin, modification cassée…) rend une erreur d'outil avec son
  message ; le serveur continue de tourner.

> [!LIMIT id=screenshot-needs-dev-server]
> `screenshot` fait le rendu à travers un serveur de dev lancé (`npm run studio` ou `npm run dev`, à
> `WEB_SCUMM_DEV_URL`, par défaut `http://localhost:5173/`) et Playwright ; sans eux, il dit pourquoi il n'est pas
> disponible. Un outil dont le backend n'a pas la capacité n'est pas proposé du tout.

<a name="without-mcp"></a>

### Une IA sans MCP

Ça marche quand même. L'IA modifie les fichiers ; le Studio se recharge (il les surveille) ; l'humain voit le résultat
et répond dans **Notes** ou dans le **Storyboard** ; l'IA relit `games/<id>/notes.json`. Git porte l'historique.

<a name="typical-session"></a>

## Une session type

1. Apprendre le jeu et le format : `list_rooms`, `get_storyboard`, `get_notes`, et la documentation (plus bas :
   `search_docs` puis `read_doc { id, section }` ; ou la page historique `read_doc { name: "CONTENT_GUIDE" }`, qui
   peut réduire les longues sections à un renvoi vers `read_doc { id, section }`).
2. Modifier : `set_storyboard` d'abord, puis `set_text` / `add_entity` dans les lieux.
3. Vérifier : `validate`, `solve`, `lint`, `run_tests` ; `screenshot` si l'humain fait tourner le Studio.
4. Demander : `add_note` pour tout ce que l'humain doit décider ou placer ; lire sa réponse avec `get_notes`. Les notes
   marquées `task: true` sont des demandes que l'humain a écrites depuis l'Assistant du Studio : l'agent les fait,
   puis répond avec `add_note` sur le même `about`.

<a name="search-docs"></a>
<!-- applies: 4.5.0.. since 4.5.0 -->

### Trouver la réponse dans la documentation

Un agent n'a pas besoin de lire des pages entières. `search_docs { query }` cherche dans les pages de ce wiki, en
français ou en anglais : les titres et les questions d'abord, puis les alias, mots-clés et identifiants (une commande
du DSL, un script npm, un code HTTP comme `423`), puis les titres de section, puis le texte des sections. Accents et
casse ne comptent pas, et le glossaire ajoute les mots de l'autre langue. Chaque résultat est un `id#section`, avec son
titre, son type, son contexte, ses versions et un extrait : on le lit avec `read_doc { id, section }` (`lang` `en` ou
`fr`, au plus 20 000 caractères par réponse par défaut, un `cursor` pour la suite). `version` écarte ce qui ne
s'applique pas à cette version. `list_docs` liste les pages par public, contexte, type, langue ou état. Sans réponse
sûre, `search_docs` rend une liste vide et les pages d'index à essayer.

`read_doc { name }` rend toujours une des huit pages historiques : `CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`,
`WORKFLOW`, `AUDIO`, `UPGRADING`, `CLASSICS`. Ce n'est pas toujours le texte entier : reconstruite à partir du wiki dans
la limite de 1,5 fois sa taille en 4.4.0, elle réduit ses sections les plus longues à leur titre, leur premier
paragraphe et le `read_doc { id, section }` qui donne la suite ; lisez aussi celles-là avant de vous fier à une section.
Donnez `name` ou `id`, pas les deux.

<a name="publish-read-back"></a>

### Publier une page et relire les annotations (Claude Code)

Les pages de relecture (`npm run page:storyboard`, `page:review`, `page:placement`) laissent l'auteur annoter depuis
un téléphone. Avec Claude Code :

1. Générer la page, puis la publier avec l'outil Artifact, en déclarant la base de données : `capabilities: { db: {} }`.
   Republier sur la même URL après chaque régénération (même chemin de fichier dans la même session, ou passer `url`) :
   la base de données est conservée d'une version à l'autre.
2. Envoyer le lien à l'auteur. Seules les personnes avec droit d'édition (Contributor ou plus) peuvent écrire.
3. Lire les annotations avec l'outil **ArtifactData**, `action: "list"`, sur l'`url` de l'artefact :
   - storyboard : collection `notes` ; répondre en écrivant `rewrites/<panel id>` avec `{ "text": "…" }` (`set`) ;
   - relecture : collection `decide` ; lister les cases `redo` avec leurs notes, un prompt de régénération par
     planche ;
   - placement : collection `layouts` ; sauvegarder les documents dans un fichier JSON et les importer.
4. Si l'auteur a utilisé un simple fichier à la place, il envoie le JSON exporté : même contenu, à lire directement.

Les pages elles-mêmes : [Pages de relecture](create.review-pages.md).

<a name="sub-agents"></a>

## Travailler avec des sous-agents

Pour un jeu de plusieurs lieux, on découpe le travail en lots qu'un orchestrateur confie à des sous-agents :
changements du moteur, contenu par groupe de lieux, assets, mini-jeux, QA. Le plan utilisé est le
[Modèle de production](create.production-template.md) ; dans le dépôt du moteur, la compétence `/production-plan` le
remplit à partir du storyboard. Chaque lot se termine par validate + solve + tests + captures d'écran.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

Le client liste le serveur `quest-n-click` avec ses outils. Demandez-lui d'appeler `list_rooms` : il répond avec l'id
du jeu, son titre, le héros, les lieux, les personnages et les objets. Une modification qu'il fait apparaît dans le
Studio dès que le fichier est écrit, et `validate` rend `{ ok, errors, warnings, ms }`.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Le client dit que la sortie du serveur n'est pas du JSON valide, ou coupe la connexion au démarrage | `npm run mcp` sans `-s` : la bannière de npm est partie sur stdout | Utilisez `npm run -s mcp` dans la configuration du client |
| L'agent modifie un autre jeu que celui ouvert dans le Studio | `GAME` diffère entre les deux, ou `config.game` a changé | Donnez le même `GAME=<id>` dans l'`env` du client et au Studio |
| `screenshot` répond qu'il n'est pas disponible | Pas de serveur de dev à `WEB_SCUMM_DEV_URL`, ou Chromium de Playwright pas installé | Lancez `npm run studio` ; `npx playwright install chromium` |
| `read_doc` répond « give either name … or id, not both » | `name` et `id` à la fois, ou aucun des deux | Donnez-en un seul |
| `read_doc { id }` répond que la lecture par id demande la documentation de `wiki/` | Le backend sur lequel il tourne n'a pas de documentation | Lisez la page sur le wiki, ou utilisez `name` |
| Une modification est reprise après l'écriture | `set_value` valide le jeu après l'écriture et annule une modification qui ajoute une erreur | Lisez l'erreur qu'il rend, corrigez la valeur |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Ce qu'écrivent les outils : `games/<id>/rooms/<room>.ts` (`set_text`, `set_value`, `add_entity`),
`games/<id>/layout/<room>.json` (`set_layout`, `add_entity`), `games/<id>/storyboard.json` (`set_storyboard`),
`games/<id>/notes.json` (`add_note`), le fichier du jeu pour ses objectifs (`set_value` sur `@game`). `screenshot` écrit
un PNG sous `.cache/studio/`. Les autres outils ne font que lire. Committez petit, et relisez le diff de l'agent.

<a name="recovery"></a>

## Retour arrière

Chaque écriture est un changement de fichier dans votre copie de travail : `git diff` le montre et
`git restore <fichier>` l'annule.

<a name="references"></a>

## Références

- [`AGENTS.md`](../../AGENTS.md) : les règles et les commandes pour tout assistant.
- [`tools/mcp/server.ts`](../../tools/mcp/server.ts), [`tools/studio/tools.ts`](../../tools/studio/tools.ts).
- [MCP local : configurer chaque client](studio.mcp-setup.md), [Outils MCP](studio.mcp-tools.md),
  [MCP distant](team.remote-mcp.md), [L'Assistant](studio.assistant.md).
- [Modèle de production](create.production-template.md), [Contribuer avec des agents IA](contribute.ai-agents.md).
