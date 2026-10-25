# Aperçu, application, annulation

Toute modification du Studio local suit le même chemin : montrée d'abord en diff quand on le demande, jugée sur le
jeu tel qu'il serait, écrite d'un bloc ou pas du tout, et annulable. Cette page dit pourquoi, et où cela s'arrête.

<a name="why"></a>

## Pourquoi

Un jeu, ce sont des fichiers TypeScript et JSON que des personnes, des éditeurs, git et des agents IA touchent tous.
Le Studio doit changer ces fichiers sans les casser et sans cacher ce qu'il change. D'où :

- **Preview the change.** Dans un formulaire (« Preview the change »), le serveur calcule le diff exact qu'il
  écrirait et n'écrit rien : un essai à blanc. On lit le code que produit le formulaire avant qu'il existe.
- **Apply.** « Apply » écrit la valeur en code dans le style du fichier, par l'analyseur TypeScript : les commentaires
  et le reste du fichier restent tels quels. L'outil MCP `set_value` passe par le même chemin.
- **La garde.** Toute écriture sur des fichiers que lit le validateur est jugée sur une copie du jeu tel qu'il serait
  après elle. Si elle ajoute une erreur de validation (ou si le jeu ne se chargerait plus), elle est refusée avec 422
  et les erreurs, et rien n'est écrit. Les textes sont gardés aussi. Une modification qui casserait la syntaxe du
  fichier est refusée (500) avant cela.
- **Une opération, tout ou rien.** Chaque écriture est une opération du journal du jeu
  ([`studio-server/src/ops/journal.ts`](../../studio-server/src/ops/journal.ts), rangé dans `.cache/studio-journal/`) :
  tous les fichiers qu'elle touche sont écrits ensemble ou pas du tout, durablement (fsync) ; une opération
  interrompue par un crash est terminée à la réouverture du Studio. Ajouter un accessoire écrit le lieu et son layout
  en une seule opération, annulée en une fois. Les écritures passent une par une.
- **Les changements venus d'ailleurs.** Un changement fait hors du Studio (un éditeur, un agent, git) est enregistré
  dans le journal avant que la prochaine écriture touche ce fichier. Un fichier qu'un autre processus réécrit pendant
  la préparation d'une modification donne un 409 : le Studio n'écrit jamais par-dessus ce qu'il n'a pas lu.
- **Undo / Redo.** Undo dans l'en-tête (Ctrl/Cmd+Z) et Redo (avec Maj) couvrent toutes les écritures de la session :
  textes, valeurs, layouts, voix. Une annulation est elle-même une nouvelle opération (chaque fichier remis à son
  contenu d'avant), jamais une réécriture de l'historique. Elle refuse (409) quand le fichier a changé depuis.

> [!GUARANTEE id=dry-run-writes-nothing]
> Un aperçu n'écrit rien ; une écriture appliquée entre dans l'historique d'annulation, et peut être annulée et
> rétablie.

> [!GUARANTEE id=edit-taken-back]
> Une modification qui ajouterait une erreur de validation est refusée (422) sans rien écrire, et une annulation
> refuse un fichier qui a changé depuis l'écriture.

<a name="alternatives"></a>

## Alternatives écartées

- **Écrire ce que dit le formulaire, puis valider.** Avant la 4.2.1, une écriture structurée était écrite, validée,
  puis reprise si elle cassait le jeu ; désormais le jeu est jugé tel qu'il serait, avant toute écriture.
- **Régénérer le fichier du lieu à partir de données.** Le Studio pourrait posséder les fichiers des lieux et les
  réécrire en entier. Il perdrait vos commentaires, vos fonctions et la mise en forme de votre code ; l'analyseur
  TypeScript ne touche que le littéral ou la valeur au chemin donné.
- **Un historique propre au Studio.** L'annulation pourrait vivre dans la page. Elle vit côté serveur, sur le
  journal : une annulation voit un fichier que l'IA ou git a changé entre-temps, et refuse plutôt que de l'écraser.

<a name="trade-offs"></a>

## Compromis

- Une écriture attend une validation du jeu entier : sur un gros jeu, appliquer prend le temps de `npm run validate`.
- La garde juge ce que voit le validateur. Un texte construit par du code (une constante partagée, une fonction)
  n'est pas atteignable par le Studio, et ce que le validateur ne vérifie pas (une blague qui tombe à plat) n'est pas
  attrapé.
- La pile d'annulation du Studio local appartient au processus du Studio : elle couvre les écritures faites par ce
  Studio depuis son lancement. Les écritures d'un agent par le serveur MCP (un autre processus) n'y sont pas ; on les
  reprend avec git.

> [!LIMIT id=undo-session-only]
> Undo et Redo ne couvrent que les écritures de la session du Studio en cours. Après un redémarrage, ou pour un
> changement fait hors du Studio, passez par git (`git diff`, `git checkout -- <fichier>`).

<a name="decisions"></a>

## Décisions et ADR

- Le journal et la garde sont arrivés avec la 4.2.1 (`CHANGELOG.md`, 4.2.1) ; le Studio hébergé utilise le même
  journal, avec une annulation par membre ([Concepts](team.concepts.md)).
- Sources : [`studio-server/src/ops/core.ts`](../../studio-server/src/ops/core.ts),
  [`studio-server/src/ops/undo.ts`](../../studio-server/src/ops/undo.ts), [`src/studio/structured.ts`](../../src/studio/structured.ts).
- Où on s'en sert : [Modifier une salle](studio.edit-room.md), [Langue et objectifs](studio.language-objectives.md).
