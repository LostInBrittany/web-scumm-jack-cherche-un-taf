# Notes de mise à jour : 4.4

Ce que la 4.4.0 « Author's Desk » a changé, conservé tel quel. Rien à changer dans un jeu ; tout ajout est optionnel.

La mise à jour elle-même est [Mettre à jour](install.upgrade.md). Le numéro de section est celui de l'ancien
`docs/fr/UPGRADING.md` (§41).

<a name="from-4-3-1-to-4-4-0"></a>

## 41. De la 4.3.1 à la 4.4.0 « Author's Desk »

Rien à changer : un jeu se construit, se joue et se sauvegarde comme en 4.3.1 (mêmes empreintes, sauvegardes et runs de
référence). Le moteur s'installe depuis `releases/download/v4.4.0/…`. Nouveau, tout est optionnel :

- **`onTap: 'go'` sur un hotspot** (#221) : un seul tap sans verbe choisi y marche et agit avec son `defaultVerb`, comme
  une sortie peut le faire (CONTENT_GUIDE). Sans lui, un tap ne fait que marcher, comme avant.
- **Le `portrait` d'un lieu de carte peut être une liste, et `joins: '<lieu>'`** (#223) place un lieu sur l'épingle
  d'un autre : une seule épingle pour une ville à plusieurs lieux, un visage par lieu (CONTENT_GUIDE, la carte).
- **`games/heroes`** : le choix du héros en deux langues, à copier. `npm run assets` livre désormais les clips de
  `audio.voicesByLang` (ils étaient en 404 dans une page traduite) : relancez-le si votre jeu en a.
- **Le Studio** : la vue « Héros × langues » de l'onglet Voix ; « Capturer les lieux (avant / après) » dans l'onglet
  Vérifier d'un Studio local. Un Studio hébergé : son worker fait les prévisualisations dans une file à part ; de
  nouveaux champs de journal et métriques (STUDIO-SERVER). La CLI et le MCP ont besoin du client scope et du rôle de
  realm `offline_access` (STUDIO-SERVER).
- Le JavaScript de la première visite a grossi d'environ 1 Ko : un jeu dont `assetBudgets.initialJsKB` est au plus
  juste peut avoir besoin d'1 Ko de plus.
