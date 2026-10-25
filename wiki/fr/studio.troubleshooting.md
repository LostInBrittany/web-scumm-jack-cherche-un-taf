# Dépannage du Studio

Le Studio local refuse quelque chose, ou un outil y dit qu'il n'est pas disponible. Retrouvez le message exact
ci-dessous : chacun a sa cause et son remède. Rien ici ne concerne le Studio hébergé, dont les 409 et 423 ont leurs
propres pages (voir « Cas voisins »).

<a name="symptom"></a>

## Symptôme

Les messages, tels que les affichent le Studio, son serveur ou le serveur MCP :

| Message ou code | Où | Section |
|---|---|---|
| `✖  games/<id>/index.ts not found (GAME=<id>)` | Terminal, au `npm run studio` | [Démarrage](#start) |
| 400 `invalid Host` | Navigateur ou script | [Accès](#access) |
| 403 `the Studio answers its own names only (localhost, 127.0.0.1, [::1], or the address dev:lan serves)` | Navigateur, téléphone | [Accès](#access) |
| 403 `cross-origin Studio request refused` | Navigateur, script | [Accès](#access) |
| 403 `Studio writes require a same-origin Origin header` | Script (curl, l'appel HTTP d'un agent) | [Accès](#access) |
| 401 `Studio token required` | Téléphone, navigateur en réseau local | [Accès](#access) |
| 503 `LAN Studio token is not configured` | Réseau local lancé à la main | [Accès](#access) |
| 422 `refused: the edit adds N validation error(s): …` | Un toast dans le Studio | [Modifications](#edits) |
| 422 `refused: the game would no longer load after the edit (…); nothing was written` | Un toast | [Modifications](#edits) |
| 500 `refused: the edit would break <fichier> (…)` | Un toast | [Modifications](#edits) |
| 409 `cannot undo "<quoi>": <fichier> changed since` | Undo dans l'en-tête | [Modifications](#edits) |
| 409 avec `conflicts` | Envoi dans l'onglet Assets | [Modifications](#edits) |
| 501 `unavailable` … `Playwright is not installed (npm i -D playwright && npx playwright install chromium)` | Onglet Check : Screenshot, captures | [Vérifications](#checks) |
| `The voice table needs the dev server (npm run studio).` / `The scenario map needs the dev server or a hosted Studio.` | Studio de démo | [Vérifications](#checks) |
| `custom provider URLs are disabled (set WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 to opt in)` | Assistant | [Assistant](#assistant) |
| `<url> did not answer within 60 s`, `the provider's answer exceeds 8 MB`, `… answered with a redirect …` | Assistant | [Assistant](#assistant) |
| Le client MCP ne sait pas lire la sortie du serveur ; Claude Desktop ne lance pas `npm` | Client IA | [MCP](#mcp) |

<a name="causes"></a>

## Causes possibles

<a name="start"></a>

### Démarrage

- `GAME` (ou le dernier jeu choisi avec `npm run game`, ou `config.game`) désigne un dossier sans `index.ts` : une
  faute de frappe, ou un jeu pas encore créé.

<a name="access"></a>

### Accès (400, 401, 403, 503)

Les routes du Studio ne répondent qu'à leur propre machine, aux requêtes de même origine, et en réseau local au jeton
de la session ([Sécurité en local et en réseau local](studio.security.md)).

- **403 propres noms** : la page a été ouverte par un nom qui n'est ni `localhost`, ni `127.0.0.1`, ni `[::1]` (un nom
  d'hôte personnalisé, l'adresse de la machine sans `studio:lan`), ou une page a tenté un DNS rebinding.
- **403 autre origine** : la requête vient d'une autre origine (un autre port, un autre site, une page ouverte depuis
  un fichier).
- **403 en-tête Origin** : une écriture envoyée sans en-tête `Origin` (curl, un script).
- **401 jeton** : réseau local, et la requête ne porte pas de jeton, ou le jeton d'une session précédente (un nouveau
  est tiré à chaque démarrage).
- **503 jeton non configuré** : `WEB_SCUMM_LAN=1` posé à la main sans `WEB_SCUMM_STUDIO_TOKEN`.
- **400 Host invalide** : un en-tête `Host` absent ou qui contient des espaces, `/`, `@` ou `\`.

<a name="edits"></a>

### Modifications (409, 422, 500)

- **422** : la garde a jugé le jeu tel qu'il serait après la modification, et celle-ci ajoute des erreurs de
  validation ou empêche le jeu de se charger. Rien n'a été écrit ([Aperçu, application, annulation](studio.preview-apply.md)).
- **500 casserait** : le changement rendrait invalide le TypeScript du fichier.
- **409 annulation** : le fichier a été réécrit depuis cette opération (par une IA, un éditeur, git, ou une autre
  écriture du Studio). Un autre 409, sans annulation : un fichier qu'un autre processus a réécrit pendant la
  préparation de la modification.
- **409 conflicts** : une planche envoyée redécouperait des cases qui existent, et elles n'ont pas été nommées
  ([Assets et découpe](studio.assets.md)).

<a name="checks"></a>

### Vérifications et outils (501, « needs the dev server »)

- **501** : Playwright ou son Chromium manque sur cette machine (Screenshot, captures avant/après) ; ou le Studio est
  un Studio hébergé, qui n'a pas de captures.
- **« needs the dev server »** : le Studio de démo n'a pas de serveur : ni tableau des voix, ni carte du scénario, ni
  diff sémantique, ni écritures structurées, ni captures d'écran ([Mode démo](studio.demo-mode.md)).

<a name="assistant"></a>

### Assistant

- **Fournisseur personnalisé désactivé** : l'URL de base n'est ni un préréglage (OpenAI, Anthropic, Mistral) ni Ollama
  sur cette machine.
- **HTTPS / hôte privé** : avec l'autorisation, l'URL est en `http://` ou vise une adresse locale ou privée.
- **60 s, 8 Mo, redirection** : le fournisseur a été trop lent, a trop répondu, ou a redirigé
  ([L'Assistant](studio.assistant.md#limits)).
- **CORS dans la démo** : le fournisseur refuse les appels depuis une page web (OpenAI le fait pour certaines clés).
- **« Stopped after 12 tool rounds »** : la demande voulait plus de tours qu'un seul n'en permet.

<a name="mcp"></a>

### MCP

- **Le client ne sait pas lire la sortie** : la configuration lance `npm run mcp` sans `-s`, et la bannière de npm
  arrive sur stdout.
- **Claude Desktop ne lance pas `npm`** : il n'a pas le `PATH` de votre shell.
- **Le mauvais jeu** : `GAME` n'est pas posé, et le serveur a pris le dernier jeu choisi ou `config.game`.

<a name="diagnosis"></a>

## Diagnostic

- Le panneau réseau du navigateur montre le statut et le corps (le message ci-dessus) de la requête refusée.
- Le terminal où tourne `npm run studio` montre les erreurs du serveur de dev ; le serveur MCP écrit les siennes sur
  stderr, précédées de `[quest-n-click mcp]`.
- En réseau local, comparez l'URL ouverte à celle qu'a affichée la commande : hôte, port et `token=`.
- Pour un 422, le toast liste les premières erreurs ; l'onglet Check les donne toutes.

<a name="fix"></a>

## Remède

<!-- step: fix-start -->
1. **Démarrage.** Faites pointer `GAME` vers un jeu qui existe :

   ```sh
   # dans le dépôt du moteur
   GAME=demo npm run studio
   ```

<!-- step: fix-access -->
2. **Accès.** Ouvrez le Studio à `http://localhost:5173/__studio/` sur la machine elle-même. Depuis un téléphone,
   lancez `npm run studio:lan` et ouvrez l'URL qu'il affiche, jeton compris ; après un redémarrage, ouvrez la nouvelle
   URL. Un script envoie `Origin: http://localhost:5173` (et en réseau local `x-web-scumm-token: <jeton>`). Ne posez
   jamais `WEB_SCUMM_LAN=1` à la main : passez par les scripts réseau local.

<!-- step: fix-edits -->
3. **Modifications.** Pour un 422, lisez les erreurs et changez la valeur ; pour une annulation refusée, comparez avec
   `git diff` et reprenez le fichier avec git ; pour un 409 `conflicts`, cochez **recut** sur les cases à remplacer.

<!-- step: fix-playwright -->
4. **Playwright.** Installez-le là où tourne le Studio :

   ```sh
   # dans le dépôt du moteur ou le projet créé
   npm i -D playwright && npx playwright install chromium
   ```

<!-- step: fix-assistant -->
5. **Assistant.** Prenez un préréglage, ou relancez avec l'autorisation pour un point d'accès public en HTTPS :

   ```sh
   # dans le dépôt du moteur ou le projet créé
   WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 npm run studio
   ```

   Pour un modèle local, le préréglage Ollama ; dans le Studio de démo, Ollama avec `OLLAMA_ORIGINS=<l'origine de la
   page>`, ou le Studio local. Après « Stopped after 12 tool rounds », redemandez pour continuer.

<!-- step: fix-mcp -->
6. **MCP.** Écrivez `npm run -s mcp` dans la configuration du client ; pour Claude Desktop, le chemin absolu de npm
   (`which npm`) dans `command` ; ajoutez `"env": { "GAME": "<id>" }` ([MCP local : configurer chaque client](studio.mcp-setup.md)).

> [!LIMIT id=local-only-page]
> Cette page couvre le Studio local et le serveur MCP local. Les refus d'un Studio hébergé (401 sur une session, 409
> base périmée, 423 pan verrouillé, 503 pendant un redéploiement) sont dans les pages Équipe.

<a name="check-fixed"></a>

## Vérifier que c'est réparé

Le Studio s'ouvre sur l'onglet Rooms et une modification de texte affiche son toast ; le badge de l'onglet Check est
vert ; l'Assistant répond ; le client MCP liste les outils `quest-n-click` et `list_rooms` répond.

<a name="neighbours"></a>

## Cas voisins

- **409 « The file changed since you read it »** sur un Studio hébergé : [base périmée (409)](team.write-refused-409.md).
- **423** sur un Studio hébergé : [pan verrouillé (423)](team.write-refused-423.md). Le Studio local n'a pas de 423.
- **Le moteur lui-même ne s'installe pas ou ne tourne pas** (Node, Python, Chromium) : [Dépannage de l'installation](install.troubleshooting.md).
- **Quelque chose est visible mais le héros ne peut pas l'atteindre** : [Quelque chose est visible mais inaccessible](create.unreachable.md).
