# Langues

Dans quelle langue un jeu quest'n'click s’affiche, comment la changer, et ce que deviennent les voix et les
traductions manquantes. Vrai depuis la 4.4.0, quand les clips de voix propres à une traduction ont commencé à être
livrés avec le jeu ; le reste est plus ancien.

<a name="which-language"></a>

## La langue au démarrage

Un jeu est écrit dans une langue (sa langue de base) et peut fournir des traductions. À l’ouverture d’une page, le jeu
choisit, dans l’ordre :

1. le `?lang=` de l’adresse (`https://…/?lang=fr`), quand le lien en porte un ;
2. la langue choisie auparavant dans les réglages, retenue dans ce navigateur (clé `<jeu>.lang` du stockage local) ;
3. la langue de votre navigateur, quand le jeu a une traduction pour elle (un navigateur en `fr-CA` obtient `fr`) ;
4. sinon la langue de base du jeu.

Le jeu d’exemple, *La Clé du garde-manger*, est écrit en anglais et fournit le français.

<a name="change"></a>

## La changer

Menu de pause › **Réglages** › **Langue** : chaque tap passe à la langue suivante du jeu et recharge la page dans cette
langue, sur l’écran titre : **Continuer** reprend la partie depuis la sauvegarde automatique. La ligne n’existe que dans un jeu qui a le menu des
réglages et plus d’une langue. Sans elle, un lien avec `?lang=` marche toujours.

<a name="voices"></a>

## Les voix

Un jeu peut avoir des voix enregistrées, et par langue :

- dans une langue qui a ses propres enregistrements, les répliques jouent ces clips ; une réplique sans clip dans
  cette langue s’affiche sans voix ;
- dans une langue sans enregistrements propres, les répliques jouent les clips de la langue de base : vous pouvez
  lire en français et entendre de l’anglais ;
- un jeu où l’on choisit son héros à la Nouvelle partie (depuis la 4.3.0) peut avoir un clip par héros pour les
  répliques qui changent avec lui.

Le volume des voix est un réglage à part. Avant la 4.4.0, les clips d’une traduction n’étaient pas livrés avec le jeu
construit : une page traduite ne jouait aucune voix ; la 4.4.0 l’a corrigé.

<a name="missing-translations"></a>

## Une traduction manquante

Un texte que la traduction ne couvre pas s’affiche dans la langue de base du jeu. Les textes d’interface propres au
moteur (lignes de menu, bandeau de mise à jour) qu’un jeu ne traduit pas s’affichent en anglais. Les auteurs trouvent
les deux avant la release : `npm run i18n -- status` les liste, et le passage de bout en bout en français échoue sur
tout texte anglais par défaut visible (voir [Traductions](create.translations.md)).

> [!LIMIT id=no-in-game-translation-of-voices]
> Le moteur ne traduit ni ne synthétise jamais la parole : une voix n’existe que là où quelqu’un l’a enregistrée. Il
> ne pose aucun sens d’écriture de droite à gauche, et aucune langue écrite de droite à gauche n’a été essayée.

<a name="related"></a>

## Voir aussi

- [Réglages](play.settings.md#language), [Dépannage pour les joueurs](play.troubleshooting.md#no-sound).
- Pour les auteurs : [Traductions](create.translations.md), [Voix](create.voices.md).
- Le code : [`src/engine/boot.ts`](../../src/engine/boot.ts) (`pickLanguage`, les voix de la langue choisie),
  [`src/engine/core/voice-key.ts`](../../src/engine/core/voice-key.ts).
