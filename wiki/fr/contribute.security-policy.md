# Politique de sécurité

Comment signaler une vulnérabilité de quest'n'click, quelles versions reçoivent un correctif, et ce à quoi les outils
de développement font confiance ou non. Le fichier [`SECURITY.md`](../../SECURITY.md) du dépôt dit la même chose en
anglais ; cette page en est la référence, dans les deux langues. La sécurité d'un Studio hébergé a sa propre page
([Sécurité sur Clever Cloud](clever.security.md)), celle du Reality Bridge aussi ([Sécurité du Bridge](bridge.security.md)).

<a name="reporting"></a>

## Signaler une vulnérabilité

### Forme

Signalez-la en privé par la fonction **Security Advisory** de GitHub sur `Quest-n-Click/quest-n-click` (l'onglet Security du
dépôt, « Report a vulnerability »), jamais dans une issue publique.

### Ce qu'il faut joindre

- le commit (ou la release) concerné ;
- les étapes pour reproduire ;
- l'impact.

N'y mettez ni clés de fournisseur ni assets de jeu privés.

<a name="supported-versions"></a>

## Versions prises en charge

La dernière mineure de la majeure en cours reçoit tous les correctifs, ceux de sécurité compris. Chaque mineure plus
ancienne reçoit les correctifs de sécurité pendant trois mois après la mineure qui l'a suivie ; ensuite, mettez à jour
([Mettre à jour](install.upgrade.md)). À la 4.5.0 (23 octobre 2026), le même tableau que
[Stabilité et support](start.stability.md#versions) :

| Ligne | Correctifs de sécurité jusqu'au |
| --- | --- |
| 4.5 | la mineure suivante, puis trois mois de plus |
| 4.4 | 23 janvier 2027 |
| 4.3 | 22 janvier 2027 |
| 4.2.5 | 21 janvier 2027, sur une branche partie de `v4.2.5` |

Le correctif d'une ligne plus ancienne se fait sur une branche partie de son dernier tag, et sort comme un correctif de
cette ligne.

<a name="dev-studio"></a>

## Le Studio et le serveur de développement

### Valeurs et défaut

- Le Studio local (`npm run studio`) écoute sur la **boucle locale** par défaut.
- `npm run studio:lan` et `npm run dev:lan` sont des modes réseau local explicites : ils génèrent un **jeton de
  capacité valable une session**, exigent des **écritures de même origine** et affichent l'URL autorisée.

> [!GUARANTEE id=lan-token-required]
> Sur le réseau local, le Studio refuse une requête sans le jeton de la session, et une écriture venant d'une autre
> origine. Le test couvre la vérification des requêtes par le Studio ; il ne couvre pas ce qu'un navigateur du même
> réseau peut lire.

### Contraintes

Ne redirigez pas ces ports de développement vers Internet. Un Studio qu'une équipe partage en ligne, c'est le Studio
Server, avec sa propre connexion ([Ce qui tourne où](team.what-runs-where.md)).

<a name="trusted-code"></a>

## Code de confiance

Les modules TypeScript d'un jeu et ses commandes personnalisées sont du **code de confiance** : ils tournent avec les
droits du moteur. quest'n'click ne met pas en bac à sable un dossier `games/<id>/` dont on ne sait rien. Ouvrez le jeu
de quelqu'un en qui vous n'avez pas confiance comme vous lanceriez son programme.

> [!LIMIT id=no-game-sandbox]
> Il n'y a pas de bac à sable pour le code d'un jeu, ni dans le joueur, ni dans les outils, ni dans le Studio local.

<a name="assistant-providers"></a>

## Les fournisseurs de l'Assistant du Studio

### Valeurs et défaut

- La clé du fournisseur est gardée dans le **stockage de session** de l'onglet et envoyée avec chaque requête ; le
  Studio ne l'écrit jamais sur le disque.
- Les fournisseurs prédéfinis (OpenAI, Anthropic) et un Ollama local sur cette machine sont acceptés tels quels. Toute
  autre adresse (un relais personnalisé) demande l'activation explicite `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1` dans
  l'environnement du Studio.
- Même alors, l'adresse doit être en **HTTPS public** : les hôtes de boucle locale, non spécifiés, privés, de lien local
  et à nom local sont refusés, dans les deux familles d'IP, y compris les formes IPv6 entre crochets et IPv4 mappées.
  Une URL qui contient des identifiants est refusée.
- Un appel au fournisseur **ne suit jamais de redirection**, **abandonne après 60 s** et lit **au plus 8 Mo** de
  réponse.

> [!GUARANTEE id=policy-provider-no-redirect]
> Un fournisseur qui répond par une redirection est refusé avec une erreur.

### Contraintes

```sh
# dans le dépôt du moteur, pour une session du Studio
WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 npm run studio
```

> [!LIMIT id=dns-rebinding]
> La vérification de l'hôte est statique : un nom public qui se résout vers une adresse privée (DNS rebinding) n'est
> pas détecté. Faites tourner le Studio sur une machine de confiance.

<a name="licensing"></a>

## Questions de licence

Tous les assets du jeu d'exemple sont sous CC BY 4.0 depuis la 3.7 ; `npm run verify:commercial` le vérifie. Les
questions de licence trouvent leur réponse dans [Licences et crédits](contribute.licences.md) (`CREDITS.md`,
`LICENSE-ASSETS`).

<a name="related"></a>

## Identifiants liés

- `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER` ([Variables d'environnement](reference.environment-variables.md)).
- `npm run studio:lan`, `npm run dev:lan`, `npm run verify:commercial`.
- [Sécurité locale et réseau local](studio.security.md), [L'Assistant](studio.assistant.md),
  [Code de conduite](contribute.code-of-conduct.md).
