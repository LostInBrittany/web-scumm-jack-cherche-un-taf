# Limites connues

Ce que le Studio d'équipe (le Studio Server) ne fait pas, ou ne fait que dans certaines bornes, d'après le code
actuel. Chaque limite dit où elle s'applique ; les pages liées donnent le détail.

<a name="instance"></a>

## Un jeu, une instance

> [!LIMIT id=one-instance]
> Un jeu par instance, et une seule instance sert les écritures à la fois : le serveur prend un bail de service, et
> une seconde instance l'attend. Pendant un redéploiement, les écritures sont refusées un court moment (voir
> [Redéploiements](clever.redeploys.md)).

<a name="previews"></a>

## Les aperçus

> [!LIMIT id=preview-of-a-revision]
> Le jeu dans le Studio est l'aperçu d'une révision (4.2.2) : après chaque modification, le worker construit la tête
> (une rafale de modifications ne construit que sa dernière révision), et la vue de salle le charge une fois prêt, sauf
> si un placement n'est pas enregistré. En attendant, les cadres montrent le dernier aperçu prêt, et l'étiquette sous la
> vue de salle dit de quelle révision il s'agit, celle en construction, et une révision qui ne se construit pas, avec
> sa raison. Une sauvegarde faite dans un autre contenu demande avant d'être reprise : la reprendre ici, recommencer,
> ou rester dans sa propre révision (ADR 0026). L'onglet Play garde l'aperçu qu'il a chargé jusqu'à « Load the latest
> preview ».

> [!LIMIT id=preview-text-only]
> Un aperçu se construit à partir des seuls fichiers texte du jeu (sources, données) : un jeu dont le code importe une
> feuille de style ou une image ne peut pas être prévisualisé.

> [!LIMIT id=preview-kept]
> L'aperçu de chaque révision est gardé, sans expiration : `gc` ne ramasse jamais un blob qu'un aperçu nomme. La base
> `/preview/<rev>/` est écrite dans la page et son code, si bien que peu de fichiers sont partagés d'une révision à
> l'autre (moins de 1 Mo de code par révision pour le jeu de démo : un chiffre de conception, pas une mesure, tiré
> [du spike d'aperçu de la 4.2.2](../../docs/dev/SPIKE-4.2.2-PREVIEW.md), 18 octobre 2026).

> [!LIMIT id=game-frame-idle]
> Un cadre de jeu resté inactif au-delà de sa session de jeu de 15 minutes ne montre plus rien de neuf : « Reload
> view » (ou l'onglet Play) le rouvre.

<a name="diagnostics"></a>

## Vérifications et santé

> [!LIMIT id=diagnostics-on-worker]
> Les diagnostics qui exécutent le code du jeu (lint, solveur, playtests) tournent sur le worker, avec les commandes
> propres du jeu (4.2.2) ; le solveur s'y arrête après 45 s et dit qu'il a été interrompu. Chaque lecture dit la
> révision à laquelle elle a été faite : l'onglet Check l'affiche, et marque ses résultats comme périmés dès que la
> tête a avancé.

> [!LIMIT id=read-revision]
> La révision d'une lecture est la tête du journal : une instance qui ne tient pas encore le bail (un déploiement) peut
> répondre depuis un dossier en retard, et une nouvelle histoire (un import, une restauration) n'est pas distinguée
> d'une révision plus ancienne.

> [!LIMIT id=health-bounds]
> La santé d'une révision dans l'en-tête passe le validateur, puis le solveur depuis une nouvelle partie (45 s au
> plus), sur le worker, après chaque rafale de modifications. Une bissection nomme la première révision en échec en
> ⌈log₂ n⌉ jugements au plus, jamais qui l'a faite. Un solveur interrompu dit « inconnu », jamais « valide », et arrête
> une bissection ; une révision qui n'a pas pu être jugée cinq fois dit « ne peut être jugée ». Un verdict plus ancien
> est affiché en gris, jamais en vert. Une passe de l'onglet Check retient les lectures de l'instance pendant que le
> worker exécute ses diagnostics : une écriture l'attend. Voir
> [Routes de santé et de métriques](team.health-metrics.md#game-health).

<a name="worker"></a>
<!-- applies: 4.4.0.. -->

## La capacité du worker

> [!LIMIT id=worker-lanes]
> Le worker exécute un job à la fois par file (4.4.0) : la construction d'un aperçu (ou d'un build publié) dans sa
> propre file, toutes les autres sortes dans l'autre, donc deux processus enfants au plus à la fois. Chaque révision lui
> demande trois jobs : la construction d'un aperçu, le validateur et une passe du solveur (jusqu'à 45 s) ; l'aperçu
> n'attend plus les deux autres, et la validation de la modification suivante peut encore les attendre. Une bissection
> demande jusqu'à deux jobs par révision qu'elle juge. Chaque file tient 8 jobs au plus (en cours ou en attente) ; le
> suivant est refusé (429).

> [!LIMIT id=snapshot-shared]
> Depuis la 4.4.0, un seul instantané par révision est empaqueté (sous le verrou, le dossier réparé) et partagé par
> l'aperçu, la santé, les builds publiés et la montée de version du moteur, redonné tant que la tête n'a pas bougé. Ses
> fichiers sont stockés 8 à la fois, et un blob que cette instance a stocké il y a moins d'une heure n'est pas réécrit.
> Le Studio répond dès qu'il a lu le résultat du worker, son dépôt effacé ensuite. Ce que prend chaque phase est dans
> la ligne de journal `preview` et dans `studio_preview_phase_seconds`. Le cache de Vite n'est pas gardé d'un job à
> l'autre : un `vite build` ne s'en sert pas, et un dossier où écrit le code du jeu ne doit pas survivre à son job
> (ADR 0028).

> [!LIMIT id=outside-folder]
> Un jeu qui importe des fichiers hors de son propre dossier ne peut pas tourner sur le worker.

<a name="assets"></a>

## Assets, Prepare et jobs

> [!LIMIT id=assets-hosted]
> Les uploads font 10 Mio au plus une fois décodés, et leur type se lit dans leurs octets : des images PNG, JPEG ou WebP
> (un décor : PNG ou JPEG), des sons Ogg, MP3 ou WAV (un Studio local prend aussi M4A, FLAC, AAC, Opus et WebM). Un
> Studio hébergé ne garde pas la planche téléversée elle-même. Prepare est refusé, et le jeu se prépare sur un Studio
> local, au-delà d'environ 31 Mio d'art et de sons (en base64) ou d'environ 22 Mio de fichiers préparés, avec un
> `sources.json`, ou quand le nouveau manifeste perdrait une image ou un son. Les builds publiés servent l'ensemble
> préparé tel qu'il est maintenant. Un seul job tourne à la fois, quatre autres attendent (429 au-delà) ; l'état d'un
> job est perdu à un redémarrage. Voir [Assets hébergés](team.hosted-assets.md).

<a name="local-only"></a>

## Ce que seul le Studio local a

> [!LIMIT id=local-only-features]
> Les captures (et les captures avant/après du diff) ne sont pas disponibles sur un Studio hébergé. L'onglet Play montre
> le jeu avec son panneau DEV ; l'inspecteur d'état, l'explication des règles et les rejeux à côté ont besoin du jeu
> sur l'origine du Studio, donc du Studio local seulement. L'Assistant n'est pas encore sur un Studio hébergé. Le MCP
> d'un Studio hébergé ne propose ni captures, ni suite de tests, ni documentation, ni prompts d'assets
> ([MCP distant](team.remote-mcp.md#tools)).

<a name="editing"></a>

## L'édition

> [!LIMIT id=base-revision-scope]
> Depuis la 4.2.3, les éditeurs du Studio envoient la révision de ce qu'ils ont lu (`x-studio-base`) avec chaque
> écriture qui se rattache à une lecture (une salle, le storyboard, les notes, les regroupements, les voix…), et un
> fichier que quelqu'un d'autre a écrit depuis donne une 409. La vérification se fait par fichier. Une écriture qui
> dérive un fichier (l'export Markdown du storyboard) n'en envoie pas. Les clients de la CLI et du MCP n'en envoient pas
> non plus : leurs écritures se font sur le fichier tel qu'il est, dans les règles des pans
> ([409](team.write-refused-409.md)).

> [!LIMIT id=room-editor-save]
> Le bouton Save de l'éditeur de salle ne fait rien sur un Studio hébergé : « Save layout » dans le Studio enregistre
> (la page de l'éditeur est celle du jeu, et seul le membre lance une écriture).

> [!LIMIT id=groupings-span-by-hand]
> Le pan `groupings` (la carte du scénario) est pris par une écriture comme les autres, mais il ne peut pas être pris
> d'avance, rendu ni repris à la main : la liste des noms de pans de l'API ne le contient pas (400, « `spans` is a list
> of span names »), alors que le panneau *Spans* l'affiche.

> [!LIMIT id=undo-not-for-all]
> L'annulation ne reprend que vos propres opérations annulables. Les uploads, les découpes, Prepare, un import Git et
> le renommage de l'ancien nom sont écrits sans annulation : une sauvegarde faite avant est leur chemin du retour.

<a name="people"></a>

## Personnes et accès

> [!LIMIT id=people-limits]
> Trois rôles fixes, pas de droit par salle. Une invitation en attente ne peut pas être retirée. L'API d'audit donne
> les 200 dernières entrées, sans pagination. Aucune sous-commande en ligne de commande ne gère les membres
> ([Gérer les membres](team.members.md#not-possible)). Un fournisseur qui émet des jetons d'accès opaques (les
> applications OAuth de GitLab, au moment où ces lignes sont écrites) sert le navigateur mais ni la CLI ni le MCP
> distant ([OIDC générique et GitLab](clever.generic-oidc.md)).

> [!LIMIT id=browsers]
> La CI lance l'e2e hébergé sous Chromium et Firefox ; WebKit sous macOS garde le cookie partitionné du jeu, et n'est
> testé qu'à la main (la matrice de support de la 4.4.0, 23 octobre 2026). WebKit sous Linux (GNOME Web) ne garde aucun
> cookie posé par un cadre d'un autre hôte : les cadres du jeu y restent vides. Un vrai Safari, sous macOS et iOS, est
> la passe humaine `studio-hosted`, pas encore faite.

<a name="related"></a>

## Identifiants liés

- [Ce qui tourne où](team.what-runs-where.md), [Concepts](team.concepts.md).
- [Dépannage Clever Cloud](clever.troubleshooting.md).
