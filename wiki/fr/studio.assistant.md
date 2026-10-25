# L'Assistant : votre propre clé

L'Assistant est un tiroir de conversation dans le Studio où vous demandez à un modèle de votre choix (OpenAI,
Anthropic, Ollama, Mistral, ou tout point d'accès compatible OpenAI) d'aider à compléter le jeu. Il a les mêmes outils
que le serveur MCP et sait ce que vous avez sélectionné. Vous apportez la clé ; sans clé, votre demande devient une
tâche pour un agent IA branché en MCP.

<a name="what-you-get"></a>

## Ce que vous obtenez

Un modèle qui lit le lieu ou la case où vous êtes, écrit des lignes de Regarder, des sujets ou des indices dans les
fichiers du jeu avec les outils du Studio, et lance validate et solve ; le Studio recharge ce qu'il a écrit.

<a name="context-and-versions"></a>

## Contexte et versions

Le Studio local (`npm run studio`, dépôt du moteur ou projet créé), où le serveur du Studio relaie l'appel, et le
Studio de démo, où la page appelle elle-même le fournisseur. Vrai depuis la 4.2.1.

<a name="prerequisites"></a>

## Prérequis

- Le Studio lancé ([présentation](studio.overview.md)).
- Une clé d'API d'un fournisseur (avec un plafond de dépense), ou Ollama sur votre machine avec un modèle qui gère les
  outils, ou un agent MCP pour la voie sans clé ([MCP local : configurer chaque client](studio.mcp-setup.md)).

<a name="where-to-run"></a>

## Où lancer les commandes

Dans le navigateur : le bouton **Assistant** de la barre du haut, ou la touche `a` quand aucun champ n'a le focus.
Pour Ollama, les commandes `ollama` se lancent sur votre machine.

<a name="steps"></a>

## Étapes

<!-- step: provider -->
1. **Choisissez un fournisseur** (icône d'engrenage). Préréglages :

   | Préréglage | URL de base | Modèles proposés | Clé |
   |---|---|---|---|
   | OpenAI | `https://api.openai.com` | `gpt-5`, `gpt-5-mini`, `gpt-4.1` | oui |
   | Anthropic (par défaut) | `https://api.anthropic.com` | `claude-sonnet-5` (par défaut), `claude-opus-5`, `claude-haiku-4-5` | oui |
   | Ollama (local) | `http://localhost:11434` | `llama3.1`, `qwen3`, `mistral-small` | non |
   | Mistral | `https://api.mistral.ai` | `mistral-large-latest`, `mistral-small-latest` | oui |
   | Custom | toute URL de base compatible OpenAI | tapé par vous | selon le point d'accès |

   Pour Ollama, téléchargez d'abord le modèle (`ollama pull llama3.1`) et choisissez-en un qui gère les outils.

<!-- step: key -->
2. **Collez votre clé.** Elle n'est gardée que dans cet onglet du navigateur (sessionStorage) et envoyée avec chaque
   requête ; les autres réglages (préréglage, URL, modèle) sont mémorisés dans le localStorage, jamais la clé.
   **Forget the key** la retire. Utilisez une clé à plafond de dépense, et oubliez-la sur un ordinateur partagé.

<!-- step: ask -->
3. **Demandez.** La zone de saisie montre sur quoi porte la demande : `house › pantry (prop)` (le lieu et l'entité
   sélectionnés dans Rooms), `storyboard › <tableau> › <case> (panel)` (la case sélectionnée, telle qu'éditée, même non
   enregistrée), ou le jeu entier. Les actions rapides s'en servent : *Write 3 look lines*, *Suggest a puzzle for this
   room*, *Write the talk topics for this character*, *Find what's missing (validate + solve)*, *Draft the hint chain*,
   *Generate the art prompts for this sheet*.

<!-- step: read -->
4. **Lisez la réponse.** Les réponses sont en markdown léger (paragraphes, listes, code). Chaque appel d'outil est une
   puce qu'on déplie pour voir ses arguments et son résultat. **Stop** interrompt la requête (le serveur interrompt
   aussi l'appel au fournisseur) ; **New chat** repart de zéro. Après un tour qui a écrit quelque chose, le Studio
   recharge le lieu, le storyboard (un bandeau s'il a des modifications non enregistrées) ou les notes, et relance
   Check.

<a name="assistant"></a>

## Comment ça marche

- **Un seul registre d'outils.** [`tools/studio/tools.ts`](../../tools/studio/tools.ts) définit chaque outil (nom,
  description, schéma, handler sur un backend) ; le serveur MCP et l'Assistant s'en servent tous deux, donc
  l'Assistant a les outils du serveur MCP : `list_rooms`, `get_room`, `set_text`, `set_value`, `add_entity`,
  `set_layout`, `get_storyboard`, `set_storyboard`, `get_notes`, `add_note`, `validate`, `solve`, `screenshot`,
  `read_doc`, `run_tests`, `asset_prompts` et les autres ([Outils MCP](studio.mcp-tools.md)).
- **Le relais** (Studio local). La page envoie la conversation à `POST /__studio/api/assistant/chat` avec
  `{ provider: { kind, baseUrl, model, apiKey? }, messages: [{ role, content }], context }` (un corps de 4 Mo au plus).
  Le relais ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts), boucle dans
  [`tools/studio/assistant-loop.ts`](../../tools/studio/assistant-loop.ts)) construit un prompt système à partir
  d'`AGENTS.md`, du jeu (lieux, personnages, objets, checkpoints) et de la sélection courante avec ses textes. Il
  appelle le modèle, exécute les appels d'outils sur les fichiers du jeu, et renvoie des événements SSE :
  `{ type: 'text', delta }`, `{ type: 'tool_call', id, name, args }`, `{ type: 'tool_result', id, name, result,
  isError? }` (résultat coupé à 4 Ko dans l'événement ; le modèle en reçoit jusqu'à 32 Ko), `{ type: 'error', message }`,
  puis `{ type: 'done', usage?, wrote?, stopped? }`. Le modèle a pour consigne de demander avant un changement
  destructif et de garder la voix du jeu. Les tours précédents sont renvoyés sous forme de texte seulement.
- **Deux formats, pas de SDK.** `POST <base>/v1/chat/completions` compatible OpenAI avec `tools` et `stream: true`
  (OpenAI, Mistral, Ollama, la plupart des autres), et `POST <base>/v1/messages` d'Anthropic avec `tools`, `x-api-key`
  et `anthropic-version: 2023-06-01`. Les réponses en flux sont lues comme des événements SSE ; un fournisseur qui
  répond en JSON simple marche aussi. Une URL de base peut finir ou non par `/v1`.

<a name="limits"></a>

### Limites

| Limite | Valeur | Quand elle est atteinte |
|---|---|---|
| Tours d'outils par requête | 12 | `Stopped after 12 tool rounds: ask again to continue.` |
| Un appel au fournisseur | 60 s | `<url> did not answer within 60 s` |
| La réponse d'un fournisseur | 8 Mo | `the provider's answer exceeds 8 MB` |
| Redirections | aucune suivie | `<url> answered with a redirect (…): refused, a provider must answer at its own address` |

> [!GUARANTEE id=provider-no-redirect]
> Un appel au fournisseur qui reçoit une redirection est refusé : une redirection pourrait envoyer la requête, et la
> clé, vers un autre hôte.

> [!GUARANTEE id=provider-answer-cap]
> La réponse d'un fournisseur est lue jusqu'à un plafond, et refusée au-delà.

<a name="custom-provider"></a>

### Fournisseurs personnalisés et `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER`

Le relais accepte les adresses des préréglages (OpenAI, Anthropic, Mistral) et Ollama sur cette machine (`localhost`,
`127.0.0.1`, `[::1]`). Toute autre URL de base est refusée, sauf si le Studio a été lancé avec l'autorisation :

```sh
# dans le dépôt du moteur ou le projet créé
WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 npm run studio
```

Même alors, un fournisseur personnalisé doit être en HTTPS et ne peut pas viser un hôte local ou du réseau privé
(adresses de bouclage, non spécifiées, privées et link-local dans les deux familles d'adresses, `.local`,
`.internal`), et une URL de fournisseur ne peut pas porter d'identifiants. Voir
[Sécurité en local et en réseau local](studio.security.md) et
[`WEB_SCUMM_ALLOW_CUSTOM_PROVIDER`](reference.environment-variables.md#web-scumm-allow-custom-provider).

> [!GUARANTEE id=custom-provider-opt-in]
> Les préréglages et Ollama sur cette machine sont permis ; toute autre adresse demande l'autorisation. Même avec elle,
> une adresse link-local en HTTP simple (celle des métadonnées du cloud) reste bloquée.

<a name="key-safety"></a>

### Sûreté de la clé

La clé reste dans cet onglet du navigateur (sessionStorage) et part avec chaque requête. Sur le Studio local, le
relais la garde en mémoire le temps de cette requête seulement : jamais écrite sur disque, jamais journalisée, et
retirée des messages d'erreur (remplacée par `***`). Dans le Studio de démo, elle va de la page directement au
fournisseur.

<a name="no-key-tasks"></a>

### Sans clé : des tâches pour un agent MCP

Sans clé (et hors Ollama), la zone de saisie propose **Send as a task to the AI agent**. La page envoie
`POST /__studio/api/assistant/task` avec `{ about, text }`, qui ajoute à `notes.json` une note avec `author: "you"` et
`task: true`, à propos de la sélection courante. Un agent branché en MCP (Claude Code, Cursor, Codex, Gemini CLI…) la
lit avec `get_notes` et fait le travail ; le Studio montre ses modifications en direct, et l'onglet Notes étiquette ces
notes « task » ([Notes](studio.notes.md)).

<a name="demo"></a>

### Dans le Studio de démo

Pas de relais sur un hébergement statique : la page exécute elle-même la même boucle, avec les outils sur le backend
du navigateur (modifications gardées en patchs de démo, [Mode démo](studio.demo-mode.md)). `screenshot`, `run_tests`
et `asset_prompts` ne sont pas disponibles, `set_value` répond qu'il lui faut le serveur de dev, et `read_doc` n'a que
`CONTENT_GUIDE`. Le navigateur appelle le fournisseur directement : Anthropic reçoit son en-tête
`anthropic-dangerous-direct-browser-access` ; OpenAI refuse les appels depuis un navigateur d'origine inconnue pour
certaines clés, et l'erreur le dit. Utilisez Ollama sur votre machine en autorisant l'origine de la page, ou le Studio
local, dont le serveur relaie l'appel :

```sh
# sur votre machine, pour la page du Studio de démo
OLLAMA_ORIGINS=<l'origine de la page> ollama serve
```

Les tâches vont dans les notes de la démo, et dans son patch.

<a name="demo-docs"></a>
<!-- applies: 4.5.0.. -->

#### La documentation dans la démo

Une démo construite depuis la 4.5.0 porte aussi les pages prêtes du wiki dans son instantané : l'Assistant de la démo
peut s'en servir avec `search_docs`, `list_docs` et `read_doc` par id.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

La réponse arrive au fil de l'eau ; une puce d'outil montre `validate` qui renvoie `{ ok: true … }` ; après une
écriture, le lieu ou le storyboard montre le changement et `git diff` le contient.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Que faire |
|---|---|---|
| `custom provider URLs are disabled (set WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 to opt in)` | Une URL de base qui n'est pas un préréglage | Relancer le Studio avec l'autorisation, ou prendre un préréglage |
| `custom providers must use HTTPS and cannot target local or private network hosts` | `http://`, ou une adresse privée | Un point d'accès public en HTTPS ; pour un modèle local, le préréglage Ollama |
| `` `provider.kind` must be openai, anthropic or ollama `` | Une requête faite à la main | Passer par la fenêtre de réglages |
| `The browser could not reach <url> … (CORS)` | Studio de démo, fournisseur qui refuse les appels du navigateur | Ollama avec `OLLAMA_ORIGINS`, ou le Studio local |
| `Stopped after 12 tool rounds` | La tâche demande plus de tours | Redemander pour continuer |

Plus : [Dépannage du Studio](studio.troubleshooting.md#assistant).

<a name="files-changed"></a>

## Fichiers ou données modifiés

Ce qu'écrivent les outils (fichiers des lieux, layouts, `storyboard.json`, `notes.json`), comme le ferait le Studio.
La clé n'est jamais écrite ; les réglages sans la clé sont dans le localStorage du navigateur sous
`web-scumm.studio-assistant`.

<a name="recovery"></a>

## Revenir en arrière

Les écritures du modèle passent par les opérations du Studio : annulez-les depuis l'en-tête pendant la session, ou
avec git.

<a name="references"></a>

## Références

- [`src/studio/assistant.ts`](../../src/studio/assistant.ts) (le tiroir), [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts)
  (le relais), [`tools/studio/assistant-loop.ts`](../../tools/studio/assistant-loop.ts) (la boucle, partagée avec la démo).
- [Travailler avec une IA](create.working-with-ai.md), [Sécurité en local et en réseau local](studio.security.md).
