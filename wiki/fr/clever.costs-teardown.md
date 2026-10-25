# Coûts et démontage

Ce dont un Studio hébergé est fait sur votre facture Clever Cloud, et comment tout supprimer une fois le jeu à l’abri
ailleurs.

<a name="what-you-get"></a>

## Ce que vous obtenez

Une organisation où il ne reste rien du Studio : ni application, ni add-on, ni bucket, ni enregistrement DNS qui pointe
vers Clever Cloud, ni aucun de ses secrets sur votre machine ; le jeu ayant été mis à l’abri avant.

<a name="context-and-versions"></a>

## Contexte et versions

- Un Studio hébergé sur Clever Cloud, à partir de la 4.2.3.
- **Vérifié sur : non vérifié sur une installation réelle.** Les ressources du spike et du déploiement de référence ont
  été gardées pour des passes ultérieures (D44), pas supprimées ; ce démontage n’a pas été exercé.

<a name="costs"></a>

### Ce que vous payez

Aucun prix n’a été mesuré par ce projet (ni facture, ni grille de prix datée dans le dépôt). Ce que contient un
déploiement, à chiffrer sur la page des tarifs de Clever Cloud le jour venu :

| Ressource | La taille du déploiement de référence |
|---|---|
| L’application `studio` | Node.js XS, 1 instance (2 pendant chaque redéploiement, quelques minutes) |
| L’application `studio-worker` | Node.js XS, 1 instance (2 pendant chaque redéploiement) |
| PostgreSQL | plan DEV, trop petit pour une équipe ([Applications et add-ons](clever.apps-addons.md#postgresql-sizing)) |
| Cellar | plan S ; le bucket grandit pour de bon avec les prévisualisations et le journal ([Rétention](clever.retention.md)) |
| Keycloak | managé, plan BASE |
| L’add-on PostgreSQL d’un exercice | le temps d’un exercice, si vous le supprimez après |

<a name="prerequisites"></a>

## Prérequis

- **Le jeu sorti d’abord** : [Exporter le jeu et quitter l’installation](clever.export-leave.md), avec une copie du
  bucket gardée ailleurs. Tout ce qui suit est irréversible.
- Prévenez les membres : leurs sessions, jetons et invitations cessent de marcher.

<a name="where-to-run"></a>

## Où lancer les commandes

Sur votre machine, dans le dépôt du moteur où les applications sont liées (`clever …`) ; le bucket avec un outil S3 ;
les enregistrements DNS chez votre fournisseur DNS.

<a name="steps"></a>

## Étapes

<!-- step: stop-cron -->
1. Arrêtez la sauvegarde quotidienne, pour que rien n’écrive dans le bucket pendant que vous le videz :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever env rm STUDIO_BACKUP_CRON --alias my-game-studio
   clever stop --alias my-game-studio
   clever stop --alias my-game-worker
   ```

<!-- step: empty-bucket -->
2. Avec un outil S3 et les identifiants Cellar, videz le bucket (`sha256/`, `journal/`, `backups/`, `staging/`), puis
   supprimez-le. Vérifiez avant que votre copie faite ailleurs s’ouvre.

<!-- step: delete-addons -->
3. Supprimez les add-ons (celui d’un exercice aussi, s’il en reste un) :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever addon delete my-game-pg
   clever addon delete my-game-cellar
   clever addon delete my-game-pg-drill
   ```

   Le Keycloak managé est un add-on lui aussi : supprimez-le de la même façon s’il ne sert à rien d’autre, ou seulement
   son realm `web-scumm` dans sa console d’administration.

<!-- step: delete-apps -->
4. Supprimez les deux applications :

   ```sh
   # sur votre machine, dans le dépôt du moteur
   clever delete --alias my-game-studio
   clever delete --alias my-game-worker
   ```

<!-- step: dns-and-secrets -->
5. Retirez les enregistrements DNS de `studio.`, `play.` et `worker.` chez votre fournisseur DNS ; supprimez
   `.clever.json` du dossier du dépôt et `~/secrets/my-game/` (les clés des jobs, la clé de session, les jetons, le
   fichier du realm) ; retirez l’entrée du serveur dans `~/.config/web-scumm/studio-tokens.json` ; chez votre hébergeur
   Git, retirez la clé de déploiement du Studio.

<a name="expected-result"></a>

## Résultat attendu, et comment le vérifier

`clever applications list` et `clever addon` ne les listent plus ; la console de Clever Cloud ne montre aucune
ressource du Studio ; `https://studio.exemple.fr` ne pointe plus vers Clever Cloud.

<a name="common-errors"></a>

## Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Le bucket ne peut pas être supprimé | Il contient encore des objets | Videz-le d’abord (étape 2) |
| `clever delete` demande quelle application | Aucun alias donné | `--alias` |
| Une sauvegarde apparaît après que vous avez vidé le bucket | La tâche a tourné sur une instance encore en marche | L’étape 1 d’abord, puis videz de nouveau |

<a name="files-changed"></a>

## Fichiers ou données modifiés

Tout ce qui fait l’installation est supprimé : applications, base, bucket, realm ou add-on Keycloak, domaines, secrets.
Seuls restent l’export et les copies que vous avez faites.

<a name="recovery"></a>

## Reprise ou retour arrière

Aucune du côté de Clever Cloud une fois supprimé. Avec la sauvegarde et la copie du bucket gardées, une nouvelle
installation de la même version peut être restaurée ([exercice de restauration](clever.restore-drill.md)) ; avec le
dossier exporté, une nouvelle peut importer le jeu, en nouvelle histoire.

<a name="references"></a>

## Références

- [Vue d’ensemble](clever.overview.md), [Rétention](clever.retention.md), [Exporter le jeu](clever.export-leave.md).
- Les ressources mesurées : [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md) §1 ;
  [`docs/dev/SPIKE-4.2.1-CLEVER.md`](../../docs/dev/SPIKE-4.2.1-CLEVER.md).
