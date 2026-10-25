# Sécurité en local et en réseau local

Le Studio local écrit des fichiers sur votre machine et peut appeler un fournisseur de modèles avec votre clé. Cette
page dit ce qui protège ces routes, sur votre machine et sur votre réseau local, et où s'arrête la protection.

<a name="why"></a>

## Pourquoi

Un serveur de dev qui écrit des fichiers est une porte sur votre machine. Trois choses pourraient y frapper : une autre
machine du réseau, une page web de votre navigateur qui tente d'atteindre `localhost` (directement, ou en faisant
pointer son propre nom vers votre machine, le « DNS rebinding »), et une adresse de fournisseur qui mènerait le Studio
vers un service de votre réseau privé (« SSRF »). Le Studio ferme chacune par défaut et n'ouvre que ce que vous
demandez.

<a name="local-and-lan"></a>

## En local et en réseau local

- **La boucle locale par défaut.** `npm run studio` et `npm run dev` écoutent sur `127.0.0.1` (port 5173) : une autre
  machine ne peut pas atteindre leurs routes d'écriture.
- **Ses propres noms seulement.** Chaque route du Studio, des assets, du layout et de l'assistant ne répond qu'aux noms
  de cette machine (`localhost`, `127.0.0.1`, `[::1]`), et en mode réseau local aux adresses que sert `studio:lan`. Une
  page d'un autre site qui fait pointer son nom vers votre machine envoie ce nom comme `Host` : refusé (403), même avec
  un `Origin` qui correspond.
- **Même origine.** Une requête qui porte un `Origin` doit venir de l'origine du Studio (403 sinon). Une écriture (tout
  sauf GET, HEAD et OPTIONS) sans en-tête `Origin` est refusée (403) : un script doit en envoyer un.
- **Le réseau local, derrière un jeton.** Pour travailler depuis un téléphone, `npm run studio:lan` (ou
  `npm run dev:lan`) écoute sur le réseau et affiche un nouveau jeton de capacité, tiré à chaque démarrage (24 octets
  aléatoires), sauf si vous posez vous-même `WEB_SCUMM_STUDIO_TOKEN`. Chaque route du Studio, des assets, du layout et
  de l'assistant exige alors ce jeton, dans l'en-tête `x-web-scumm-token`, le paramètre `?token=` de l'URL affichée, ou
  le cookie que pose cette URL (`web_scumm_studio`, `HttpOnly`, `SameSite=Strict`). Les noms d'hôte permis sont les
  adresses IPv4 réseau de la machine (`WEB_SCUMM_STUDIO_HOSTS`, posé par la commande).
- **Jamais sur Internet.** N'exposez pas le port de développement à Internet : le jeton protège une session sur votre
  réseau, pas un serveur public. Pour mettre un Studio en ligne, c'est le Studio hébergé
  ([Ce qui tourne où](team.what-runs-where.md)).

> [!GUARANTEE id=lan-token-same-origin]
> En mode réseau local, le Studio répond 401 à une requête sans le jeton de la session, et 403 à une écriture dont
> l'`Origin` est un autre site, même avec le jeton.

> [!GUARANTEE id=own-names-only]
> Un `Host` qui n'est pas cette machine (ou une adresse que sert `studio:lan`) est refusé, même avec un `Origin` qui
> correspond.

<a name="providers"></a>

## Fournisseurs de modèles

- **Les clés** restent dans l'onglet du navigateur (sessionStorage) et partent avec chaque requête ; le relais garde
  une clé en mémoire le temps de cette requête seulement, jamais sur disque, jamais dans un journal
  ([L'Assistant](studio.assistant.md#key-safety)).
- **Les adresses.** Les URL de fournisseur arbitraires sont désactivées sauf avec `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1`.
  Même alors, les destinations privées et link-local restent bloquées, hors préréglage Ollama local explicite, dans les
  deux familles d'adresses : bouclage (`127.0.0.0/8`, `[::1]`), non spécifiées (`0.0.0.0`, `::`), privées (`10/8`,
  `172.16/12`, `192.168/16`, `100.64/10`, `fc00::/7`), link-local (`169.254/16`, `fe80::/10`), IPv6 mappé IPv4, et les
  noms `localhost`, `*.localhost`, `*.local`, `*.internal`. Un fournisseur personnalisé doit être en HTTPS.
- **Les appels.** Un appel au fournisseur ne suit jamais une redirection, abandonne après 60 s et lit au plus 8 Mo de
  réponse.

<a name="trusted-code"></a>

## Ce qui n'est pas protégé : le jeu est du code de confiance

Le TypeScript d'un jeu et ses commandes personnalisées sont du code de confiance, pas des données isolées : le Studio,
le validateur et le solveur les exécutent sur votre machine. N'ouvrez que des jeux de confiance, comme pour tout projet
sur lequel vous lancez `npm install`. Voir [`SECURITY.md`](../../SECURITY.md).

> [!LIMIT id=lan-is-not-public]
> Le jeton réseau local est une commodité pour un téléphone sur votre propre réseau : il s'affiche dans le terminal et
> dans l'URL, et vit aussi longtemps que le serveur. Ce n'est pas une authentification pour un déploiement public.

<a name="alternatives"></a>

## Alternatives écartées

- **Écouter sur toutes les interfaces par défaut** : pratique pour les téléphones, mais les routes d'écriture seraient
  alors sur chaque réseau que rejoint l'ordinateur. Le réseau local est une commande explicite.
- **Un mot de passe** : un jeton tiré par session n'a rien à retenir et meurt avec le serveur.
- **Permettre n'importe quelle URL de fournisseur** : à un réglage près (`WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1`), mais une
  URL tapée dans une page ne doit jamais atteindre votre réseau privé.

<a name="trade-offs"></a>

## Compromis

- Un script qui écrit par l'API du Studio doit envoyer un en-tête `Origin` qui correspond au Studio, et en réseau
  local le jeton.
- Un téléphone a besoin une fois de l'URL avec le jeton ; le cookie le garde pour la session.

<a name="decisions"></a>

## Décisions et ADR

- Sources : [`tools/studio/security.ts`](../../tools/studio/security.ts), [`tools/serve-args.ts`](../../tools/serve-args.ts),
  [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts), [`vite.config.ts`](../../vite.config.ts).
- Les variables : [`WEB_SCUMM_STUDIO_TOKEN`](reference.environment-variables.md#web-scumm-studio-token),
  [`WEB_SCUMM_STUDIO_HOSTS`](reference.environment-variables.md#web-scumm-studio-hosts),
  [`WEB_SCUMM_LAN`](reference.environment-variables.md#web-scumm-lan),
  [`WEB_SCUMM_ALLOW_CUSTOM_PROVIDER`](reference.environment-variables.md#web-scumm-allow-custom-provider).
- Quand une route refuse : [Dépannage du Studio](studio.troubleshooting.md).
