# Écriture refusée sur le Studio hébergé : révision de base périmée (409)

Sur un Studio d’équipe, votre enregistrement a été refusé avec une 409 : quelqu’un d’autre a enregistré le même fichier
après que vous l’avez ouvert. Rien de ce qu’il a fait n’a été écrasé, et votre brouillon est gardé. Cette page explique
comment voir ce qui a changé et comment enregistrer le vôtre.

<a name="symptom"></a>

## Symptôme

- Dans le Studio (en anglais) : une fenêtre « The file changed since you read it », avec « Someone saved
  `rooms/kitchen.ts` meanwhile (revision 42): this is what changed since you read it at revision 40. Your draft is
  kept: apply it on the latest version, or copy it. »
- Par l’API, la CLI ou le MCP : un HTTP **409**, `{"error": "rooms/kitchen.ts changed since revision 40 (now 42)",
  "path", "readAt", "head", "before", "now"}` : le fichier tel que vous l’avez lu et tel qu’il est maintenant, quand
  c’est du texte.

<a name="causes"></a>

## Causes possibles

Chaque écriture dit quelle révision son éditeur a lue, dans l’en-tête `x-studio-base` ; chaque lecture répond avec sa
révision dans `x-studio-revision`. Si l’un des fichiers que l’écriture modifie a été enregistré par quelqu’un d’autre
après cette révision, l’écriture est refusée :

1. **Un autre membre a enregistré le même fichier** après que vous l’avez ouvert. C’est le cas le plus courant.
2. **Vous l’avez enregistré vous-même ailleurs** : un autre onglet, ou un agent d’IA qui travaille pour vous par le MCP.
   Seules les écritures d’un même onglet, d’une même CLI ou d’une même session MCP ne se refusent jamais entre elles.
3. **Annuler ou rétablir** une opération dont le fichier a été modifié depuis par quelqu’un d’autre : refusé de la même
   façon, « cannot undo …: <file> changed since ».

> [!LIMIT id=per-file]
> La vérification se fait fichier par fichier : deux notes modifiées en même temps sont un seul fichier (`notes.json`),
> elles se refusent donc l’une l’autre. Un script qui n’envoie pas `x-studio-base` n’est pas vérifié ainsi. Le
> placement de la vue de salle est vérifié par rapport à ce qu’a lu l’onglet Rooms, alors que la vue peut encore
> montrer un moment une prévisualisation plus ancienne.

<a name="diagnosis"></a>

## Diagnostic

- La fenêtre montre ce qui a changé entre la révision que vous aviez lue et maintenant.
- Par l’API, `readAt` est la révision lue, `head` la révision actuelle, `before` et `now` le fichier à chacune.
- Si l’erreur n’a pas de `path` mais dit « changed while this edit was being prepared » ou « while this edit was being
  checked », une autre écriture est passée pendant la vôtre : réessayez, il n’y a rien d’autre à faire.

<a name="fix"></a>

## Correction

<!-- step: review-change -->
1. **Lisez ce qui a changé** dans la fenêtre : cela contient peut-être déjà ce que vous vouliez, ou cela contredit votre
   changement.

<!-- step: apply-on-latest -->
2. **Pour une modification que le serveur fait sur le fichier** (un texte, une valeur, une note, une réplique de voix) :
   cliquez sur « Apply my edit on the latest version ». Votre modification s’applique par-dessus la sienne ; rien de la
   sienne n’est perdu.

<!-- step: replace-or-merge -->
3. **Pour un document entier** (la disposition d’une salle, le storyboard) : soit cliquez sur « Replace with my version
   (drops their change) », en sachant que cela retire son changement, soit copiez votre brouillon, rechargez le
   fichier et refaites votre changement sur la nouvelle version.

<!-- step: retry -->
4. Par l’API, relisez le fichier (sa réponse donne le nouveau `x-studio-revision`), refaites le changement et
   envoyez-le avec cette révision dans `x-studio-base`. Rien n’est renvoyé sans que vous le demandiez.

<a name="check-fixed"></a>

## Vérifier que c’est corrigé

L’enregistrement passe, avec une révision postérieure à celle du `head` de l’erreur. `GET /api/ops` liste les deux
opérations, la sienne et la vôtre.

<a name="neighbours"></a>

## Cas voisins

- **423, « … is held by … »** : quelqu’un tient le pan en ce moment ; c’est un verrou, pas une lecture périmée. Voir
  [Écriture refusée sur le Studio hébergé : pan verrouillé (423)](team.write-refused-423.md).
- **La 409 du Reality Bridge** n’a rien à voir avec le Studio : un code d’appairage confirmé deux fois, un run de
  speedrun envoyé deux fois. Voir [Dépannage du Bridge et des connecteurs](bridge.troubleshooting.md#conflict-409).
- Autres 409 du Studio Server : `"… already exists in room …"` (un identifiant déjà pris), et
  `"another epoch: resynchronise"` sur `GET /api/ops?epoch=…` quand le projet n’est plus celui que le client
  connaissait (relisez l’historique depuis le début).
