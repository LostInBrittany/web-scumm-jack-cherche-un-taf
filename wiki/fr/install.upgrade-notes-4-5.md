# Notes de mise à jour : 4.5

Ce que la 4.5.0 « Wiki », la 4.5.1, la 4.5.2 et la 4.5.3 ont changé. Rien à changer jusqu'à la 4.5.1 (la doc a
déménagé) ; en 4.5.2, `npx quest-n-click migrate` passe les imports aux paquets à scope ; la 4.5.3 change la façon de
faire une release, pas un jeu.

La mise à jour elle-même est [Mettre à jour](install.upgrade.md).

<a name="from-4-4-0-to-4-5-0"></a>
<!-- applies: 4.5.0.. -->

## De la 4.4.0 à la 4.5.0 « Wiki »

Rien à changer : un jeu se construit, se joue et se sauvegarde comme en 4.4.0 (mêmes empreintes, sauvegardes et runs de
référence). Le moteur s'installe depuis `releases/download/v4.5.0/…`. Ce qui est nouveau :

- **La documentation, c'est le wiki.** Elle vit dans le wiki GitHub, en français et en anglais, et dans la
  documentation de chaque release (`/docs/<version>/` sur le site du projet). Les anciennes pages sous `docs/` sont
  désormais des pages de transition : chaque ancien titre reste et renvoie à sa nouvelle place, si bien qu'un ancien
  lien arrive encore, et le texte complet de la 4.4.0 reste lisible au tag `v4.4.0`.
- **`read_doc {name}` marche toujours** : les huit noms (`CONTENT_GUIDE`, `ENGINE`, `TOOLS`, `STUDIO`, `WORKFLOW`,
  `AUDIO`, `UPGRADING`, `CLASSICS`) répondent un seul bloc de texte, avec les arguments de la 4.4.0 ; la page est
  reconstruite à partir des sections du wiki, et une section trop longue pour sa borne est réduite à son titre, son
  premier paragraphe et le `read_doc { id, section }` qui donne la suite.
- **Deux nouveaux outils MCP** : `search_docs` (par mots ou par une question, en français ou en anglais) et
  `list_docs` ; et `read_doc {id, section, lang}` lit une section d'une page par son id. Un agent cherche d'abord, puis
  lit par id.
- **Le package porte sa documentation**, `docs-bundle/` : `npx quest-n-click mcp` dans un projet créé la lit, là où la
  4.4.0 ne trouvait rien à lire.
- **Correctifs** : `npx quest-n-click doctor` fonctionne dans un projet créé (Playwright y est optionnel) ;
  `npm run page:world` et `page:puzzles` écrivent un fichier `.html` par défaut ; un Studio partagé accepte un bail sur
  la portée de la carte du scénario (`groupings`).

<a name="from-4-5-0-to-4-5-1"></a>
<!-- applies: 4.5.1.. -->

## De la 4.5.0 à la 4.5.1

Rien à changer : un jeu se construit, se joue et se sauvegarde comme en 4.5.0 (mêmes empreintes, sauvegardes et runs de
référence). Le moteur s'installe depuis `releases/download/v4.5.1/…`. Ce qu'un jeu peut utiliser, chaque fois en option :

- **`games/<id>/spans.json`** : les pans des fichiers propres au jeu (les modules qu'importe son `index.ts`, ses
  notes, ses scripts), qu'un Studio partagé refusait d'écrire jusqu'ici. Les règles du moteur passent d'abord ; un
  fichier que ni l'un ni l'autre ne nomme reste refusé ([pan](team.concepts.md#span)).
- **`games/<id>/audit-allow.json`** : un mot que l'audit des fuites bloque et qui est aussi, par hasard, un mot du jeu
  (le prénom d'une vraie personne), autorisé par son préfixe SHA-1 et une raison, dans le dossier du jeu et ses assets
  construits seulement ([audit-allow.json](create.build-release.md#audit-allow)).
- **`url` dans `site.json`** : l'adresse publique du jeu. Avec elle, l'`og:image` de la page est absolue et un `og:url`
  s'ajoute, si bien que LinkedIn et Facebook montrent l'image de partage ; sans elle, la page est comme en 4.5.0
  ([site.json](create.project-layout.md#site-json)).
- **La documentation** : les corrections de l'audit du wiki par le mainteneur (liens dont le libellé est du code, le
  premier tutoriel, les sauvegardes, la fenêtre de support, la recherche). Un lien vers une page ou une section de la
  4.5.0 arrive toujours.

<a name="from-4-5-1-to-4-5-2"></a>
<!-- applies: 4.5.2.. -->

## De la 4.5.1 à la 4.5.2

Les paquets du moteur sont nommés sous le scope de l'organisation npm (D53) : `quest-n-click` est
`@quest-n-click/engine`, et `create-quest-n-click`, `quest-n-click-bridge`, `quest-n-click-connectors` et
`quest-n-click-studio-server` sont `@quest-n-click/create`, `@quest-n-click/bridge`, `@quest-n-click/connectors` et
`@quest-n-click/studio-server`. Les commandes gardent leur nom (`quest-n-click dev`, `npx quest-n-click migrate`,
`npx quest-n-click-bridge serve`), et les fichiers de la release aussi (`quest-n-click-4.5.2.tgz`, …). Un jeu se
construit, se joue et se sauvegarde comme en 4.5.1. Ce qu'un projet créé change :

1. Installez le nouveau moteur à la place de l'ancien paquet (le paquet de l'archive est maintenant
   `@quest-n-click/engine`) :

   ```bash
   # dans le projet créé
   npm uninstall quest-n-click
   npm install https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.5.2/quest-n-click-4.5.2.tgz
   ```

2. Laissez `migrate` déplacer le reste, puis vérifiez :

   ```bash
   # dans le projet créé
   npx quest-n-click migrate
   npx quest-n-click migrate --check
   npm install
   npm run verify
   ```

   `migrate` renomme les imports `quest-n-click/content`, `/player`, `/minigames`, `/testing`, `/reality` (et
   `quest-n-click-bridge/cli`) en `@quest-n-click/engine/…` (`@quest-n-click/bridge/cli`) dans chaque fichier source ;
   dans `tsconfig.json`, le chemin `quest-n-click/*` et les cibles `node_modules/quest-n-click/…` vers
   `@quest-n-click/engine` ; dans `package.json`, il retire la dépendance à un paquet sans scope une fois son nom à
   scope installé, et dit celles qui restent (`package.json depends on quest-n-click-bridge: npm uninstall
   quest-n-click-bridge && npm install @quest-n-click/bridge`). Il ne renomme aucune commande : les scripts restent
   tels quels.

- **Pas encore migré ?** Pendant toute la 4.5.x, les imports sans scope `quest-n-click/…` se résolvent encore, dans un
  build (Vite) et dans le `tsconfig.json` du moteur lui-même, si bien qu'un jeu qui n'a pas lancé `migrate` se
  construit encore ; son propre `tsconfig.json` pointe encore dans `node_modules/quest-n-click`, que la nouvelle
  installation a retiré, jusqu'à ce que `migrate` le renomme.
- **Un Studio hébergé** renomme lui-même les imports sans scope d'un jeu, à la mise à jour du moteur, comme il l'a
  fait pour les `web-scumm/…` ([Mettre à jour le moteur hébergé](team.upgrade-engine.md)).
- **Le Bridge, les connecteurs et le Studio Server** s'installent depuis leurs archives comme avant ; dans
  `node_modules`, ils sont maintenant sous `@quest-n-click/` (`node_modules/@quest-n-click/bridge`, …).
- **Le hook de build d'un worker du Studio** installe `requirements.txt`, qui porte maintenant toutes les empreintes
  (D54) : `python3 -m pip install --target .python --require-hashes --only-binary=:all: -r
  node_modules/@quest-n-click/engine/requirements.txt`. `ops/studio/worker-requirements.lock` n'existe plus : un hook
  qui le nomme échoue tant qu'il n'est pas changé ([Premier déploiement](clever.first-deployment.md)).
- **Un nouveau projet** se crée comme avant depuis l'archive (`npx --package=<URL de l'archive> quest-n-click create …`).
  Une fois les paquets sur npm, `npm init @quest-n-click mon-jeu` le crée en une commande, et
  `npx create-quest-n-click mon-jeu` marche toujours : ce nom sans scope relaie vers `@quest-n-click/create`.
- **L'adresse du dépôt** est `github.com/Quest-n-Click/quest-n-click` (D51). Les anciennes adresses y redirigent,
  téléchargements des releases compris, si bien qu'une URL d'archive déjà dans un `package.json` installe encore ;
  écrivez la nouvelle la prochaine fois que vous la changez. Un fichier de la 4.5.2 se vérifie avec `gh attestation verify <file> -R Quest-n-Click/quest-n-click` ;
  une release faite avant le déménagement garde ses attestations sous l'utilisateur `wanoo`
  ([Publier une release](contribute.releasing.md#expected-result)). La démo et la documentation la plus récente sont
  sur le site du projet, `quest-n-click.cleverapps.io`, et non plus sur GitHub Pages ([Jouer en ligne](start.play-online.md)).
- **npm** : la 4.5.2 est la première release dont release.yml met les paquets en attente sur npm ; ils sont publiés
  une fois qu'un propriétaire de l'organisation les approuve avec la 2FA, pas avant. Tant que
  `npm view @quest-n-click/engine version` ne répond pas 4.5.2, installez depuis l'archive
  ([Installer depuis npm, une fois publié](install.from-npm.md)). Les noms sans scope deviennent des pointeurs
  dépréciés vers les noms à scope.

<a name="from-4-5-2-to-4-5-3"></a>
<!-- applies: 4.5.3.. -->

## De la 4.5.2 à la 4.5.3 « One pass »

Rien à changer dans un jeu : il se construit, se joue et se sauvegarde comme en 4.5.2 (aucun champ de contenu, aucune
sauvegarde, aucun schéma ni aucune empreinte de jeu ne bouge). Le moteur s'installe depuis npm,
`npm install @quest-n-click/engine@4.5.3` dans un projet créé une fois qu'un propriétaire l'a approuvé, ou depuis
`releases/download/v4.5.3/…` ([Installer depuis npm](install.from-npm.md)). Ce qui change, c'est la façon de faire une
release, pour les mainteneurs ([Publier une release](contribute.releasing.md#the-chain)) :

- **Le candidat est la seule passe de tests de la release** (D55). L'ordre reste le même : un candidat lancé à la main
  sur le commit de main, puis un tag signé qui le nomme. Le push du tag lance `release.yml`, et non plus le run `ci`
  du tag lui-même (un tag ne lance plus de `ci`). Il vérifie que le commit du tag est sur la ligne des premiers parents
  de main et que le `ci` de main y a réussi, que le tag stable précédent est un ancêtre et que le candidat est un run
  vert lancé à la main sur main, puis publie les fichiers de ce candidat sans rien retester : des minutes, plus des
  heures.
- **`ship tag` attend toujours le `ci` de main** : `--now` est refusé, et `ship watch` n'attend plus que le run de
  release.
- **Un candidat fait avant la 4.5.3 ne peut pas être publié** : les preuves des catalogues Remix sont maintenant faites
  par le candidat (son job `remix-proof`) et un candidat qui ne les a pas est refusé. Lancez-en un nouveau sur le
  commit à taguer.
- **L'environnement `docs-publish` demande une règle de tag `v*`**, une fois : Settings → Environments → docs-publish →
  Deployment branches and tags, à côté de `main` et `docs/*`. Le job de documentation tourne maintenant sur la ref du
  tag ; sans la règle, il est refusé, la release elle-même étant publiée (`mode=promote` depuis main rattrape la
  documentation) ([Publier une release](contribute.releasing.md#maintainer-settings)).
- **La provenance npm nomme le tag et son commit**, et non plus la tête de main comme pour la 4.5.2.
- **L'un ou l'autre co-mainteneur signe un tag** : `.github/allowed_signers` nomme la clé de LostInBrittany à côté de
  celle de wanoo, et `ship preflight-stable` compte un nom publié par `lostinbrittany` ou `wanoo` comme celui du
  projet.
- **Une paire de traduction vérifiée par son auteur IA n'arrête plus une publication** (D56) :
  `npm run wiki -- check --publish` range ces paires parmi ses lacunes, une paire « à relire » le fait toujours
  échouer, et une affirmation publiée demande toujours la relecture d'une personne. L'en-tête d'une page dit toujours
  qui l'a lue ([Écrire la documentation](contribute.writing-docs.md#reviews)).
- **Le candidat d'une pull request** ne démarre que quand on ajoute le label `full-ci` ; retirez le label et
  remettez-le pour le relancer.
