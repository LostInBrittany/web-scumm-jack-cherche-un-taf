# Voix : par langue et par héros

Une réplique dite joue un clip enregistré quand le jeu en a un pour elle. Cette page explique comment une réplique
trouve son clip, comment un jeu traduit reçoit ses propres enregistrements, comment une réplique dont les mots changent
avec le héros s’enregistre une fois par valeur, ce qui joue quand un clip manque, et ce que permettent le navigateur et
le jeu hors ligne. Elle finit par la table de production (`voices`), des répliques jusqu’aux fichiers qu’un comédien
renvoie.

<a name="overview"></a>

## Comment une réplique trouve son clip

- Une réplique qui a un **id stable** (`npm run ids -- --lines` en donne un à chaque réplique) joue le clip rangé sous
  cet id dans `audio.voices`. Une réplique sans id n’a pas de clip : elle est repérée par sa position, qui bouge quand
  le contenu bouge.
- Un jeu traduit joue `audio.voicesByLang[lang]` à la place, sous **les mêmes ids**.
- Une réplique dont le texte a un **aiguillage de texte** (`{form?m=lui|f=elle}`) cherche d’abord
  `<id>~<flag>=<valeur>`, puis l’id seul : voir [Répliques avec des aiguillages de texte](#text-switches).
- Un `voice` explicite sur un `say` nomme un clip exactement, sans clé.

Les fichiers sont dans `games/<id>/audio/voice/` dans le dépôt du moteur, `game/audio/voice/` dans un projet créé ;
`npm run assets` les encode (64 kb/s, mono) dans `public/assets/audio/voices/`.

> [!GUARANTEE id=voice-keyed-then-plain]
> Une réplique à aiguillages joue son clip par valeur pour les flags tels qu’ils sont, sinon son id seul.

Avec un flag pas encore posé, elle joue l’id seul.

<a name="voice-lines"></a>

## La voix dans le contenu

```ts
audio: { voices: { grandma_01: 'grandma-01.mp3' } },   // fichiers dans games/<id>/audio/voice/
{ say: ['grandma', 'Pixel! Bad news.'], voice: 'grandma_01' }
```

- La réplique reste à l’écran tant que le clip joue ; un tap la passe toujours. Sans clip, le temps de lecture
  s’applique (le réglage de vitesse du texte).
- Le volume des voix est un réglage à part (Réglages, avec `settings: true`), et la musique s’efface pendant qu’on
  parle, puis revient.
- Les autres langues ont leurs propres clips, choisis avec la langue :
  `audio.voicesByLang: { fr: { <id de ligne>: 'fr/…mp3' } }`.
- Un son qui compte reçoit un sous-titre, montré par écrit et traduit comme toute ligne
  ([Bruitages](create.sound-effects.md#captions)).

<a name="per-language"></a>

## Par langue : `voicesByLang`

La langue du jeu (`lang` dans `game.ts`, `en` en son absence) joue `audio.voices`. Pour toute autre langue que choisit
le joueur ([Traductions](create.translations.md)) :

| `audio.voicesByLang[lang]` | Ce qui joue |
|---|---|
| absent | les clips du jeu, `audio.voices` : le texte traduit, dit dans la langue d’origine |
| présent | ses clips seulement, sous les mêmes ids (et les mêmes clés) ; une réplique qui y manque n’a pas de voix |

> [!LIMIT id=no-per-line-fallback]
> Il n’y a pas de repli réplique par réplique entre les langues : dès qu’une langue a sa table, une réplique qui y
> manque n’est pas dite dans la langue du jeu ; elle s’affiche pour son temps de lecture. Enregistrez toutes les
> répliques de cette langue, ou laissez la langue sans table.

> [!GUARANTEE id=voices-by-language]
> Un jeu traduit joue `audio.voicesByLang[lang]` à la place de `audio.voices`, sous les mêmes ids de répliques.

Depuis la 4.4.0, `npm run assets` publie aussi les clips de `voicesByLang` (avant, seul `audio.voices` était encodé et
une page traduite ne jouait rien), et `npm run voices -- check` lit le texte propre à chaque langue.

<a name="text-switches"></a>

## Répliques avec des aiguillages de texte (par héros)

Une réplique dont les mots suivent un flag (`{form?m=lui|f=elle}`, la syntaxe est dans
[Héros](create.heroes.md#hero-choice)) s’enregistre une fois par valeur : Grand-mère qui dit « lui » et « elle », ce
sont deux clips. Le clip a pour clé l’id de la réplique et les valeurs des flags que lisent ses aiguillages :

```ts
audio: { voices: {
  grandma_saw: 'grandma_saw.mp3',              // l'id seul : le repli
  'grandma_saw~form=m': 'grandma_saw_m.mp3',   // {form?m=…} quand form vaut "m"
  'grandma_saw~form=f': 'grandma_saw_f.mp3',
  'greet~form=f~mood=calm': 'greet_f_calm.mp3', // deux flags dans une réplique : triés par nom, joints par "~"
} }
```

- **La recherche** : quand la réplique est dite, `<id>~<flag>=<valeur>` pour les flags tels qu’ils sont (valeurs en
  texte : `true`, `2`, `f`), puis l’id seul. C’est le texte tel qu’écrit qui dit quels flags comptent. Même règle dans
  `voicesByLang`.
- **Un flag pas encore posé** (la réplique est dite avant le choix) : pas de recherche par clé, l’id seul. Le texte
  montre alors son alternative `*=` (sinon la première) : c’est ce que le clip de l’id seul doit dire.
- **Une valeur qu’aucun aiguillage ne liste** (couverte par `*=`) : le clip de cette valeur s’il existe, sinon l’id
  seul.
- **Une traduction** garde les aiguillages de sa source (`npm run i18n -- status` signale celle qui abandonne un
  choix), et peut ajouter les siens : un accord que l’anglais écrit pareil, `Prêt{form?f=e|*=}`. Les clips français
  suivent le texte français (4.3.1) : un aiguillage que seul le texte français a demande des clips français par valeur,
  et un aiguillage que le texte français abandonne n’en demande aucun en français.
- **La table d’enregistrement** (`npm run voices -- export`, l’onglet Voices du Studio) liste une ligne par combinaison
  des valeurs listées par les aiguillages, avec le texte tel qu’il se lit pour ces valeurs, puis l’id seul quand un
  aiguillage a `*=` (ou quand un clip est déjà rangé sous lui). `{hero}` y reste tel qu’écrit.
- **Le validateur** avertit quand une réplique doublée (un clip sous son id ou sous une de ses clés) avec des
  aiguillages n’a pas le clip d’une valeur listée, langue par langue : `voiced line with text switches lacks 1 of 2
  clip(s) by value: grandma_saw~form=f (the plain id plays instead)`. Un avertissement, pas une erreur : un jeu peut
  sortir avant que tout soit enregistré.
- **Une réplique sans aiguillage** garde un seul clip. `{hero}` seul n’est pas un aiguillage : une réplique qui dit le
  nom du héros dans un jeu à plusieurs héros a un seul clip ; écrivez `{form?m=Max|f=Fay}` quand il faut l’enregistrer
  par héros.
- **Les fichiers** : les clés ne sont que des clés de table. Le fichier que chacune nomme s’écrit à la main
  (`'grandma_saw_f.mp3'`), et `npm run assets` comme le lecteur construisent les chemins depuis le fichier, jamais
  depuis la clé : `~` et `=` n’arrivent jamais dans un nom de fichier ni dans une URL d’asset. Nommez les fichiers comme
  vous voulez ; lettres, chiffres, `_` et `-` passent partout.

La vue « Heroes × languages » du Studio (4.4.0) montre, pour chacune de ces répliques, le texte que lit chaque héros
dans chaque langue, le clip qui joue et le clip par valeur qui manque :
[Studio : voix et matrice héros × langues](studio.voices-matrix.md).

<a name="autoplay"></a>

## Ce que permet le navigateur

Les navigateurs refusent le son avant le premier geste du joueur sur la page. Le moteur attend le premier
`pointerdown`, `touchend` ou `keydown` ; choisir Nouvelle partie ou Continuer sur l’écran titre en est un, donc les
répliques du premier lieu peuvent s’entendre.

Une réplique pour laquelle le jeu n’a **pas** de clip s’affiche pour son temps de lecture. Une réplique qui **a** un
clip qui ne peut pas jouer se termine dès que le clip renonce, sans temps de lecture :

- avant le premier geste ;
- avec les sons coupés dans le menu pause, ou le volume des voix à 0 dans Réglages ;
- quand le fichier ne se charge pas ou ne joue pas (absent de `public/assets/audio/voices/`, hors ligne et pas en
  cache).

> [!LIMIT id=voiced-line-without-sound]
> En 4.4.0, une réplique doublée dont le clip ne peut pas jouer ne retombe pas sur le temps de lecture : la bulle se
> ferme aussitôt ([`src/engine/dom/speech.ts`](../../src/engine/dom/speech.ts)). Un joueur qui coupe les sons dans un
> jeu doublé ne lit ces répliques que dans la transcription d’une conversation et la zone annoncée par le lecteur
> d’écran. Livrez chaque clip que vous déclarez.

<a name="offline"></a>

## Hors ligne

Avec `offline: 'full'` (le défaut dans `game.ts`), une fois le lieu courant et ses voisins chargés, le lecteur
télécharge en arrière-plan, par lots, chaque image et chaque son du jeu, y compris les clips de **toutes** les langues
(`voicesByLang`, et chaque clip par valeur d’une réplique). Le menu pause montre l’état (« Offline: complete », ou une
relance). Le téléchargement en arrière-plan est sauté sur une connexion en mode « économie de données » ou en 2G. Avec
`offline: 'nearby'`, seuls le lieu courant et ses voisins sont mis en cache, et une réplique d’un lieu jamais visité a
besoin du réseau : sans lui, le clip échoue et la réplique se ferme aussitôt (voir
[Ce que permet le navigateur](#autoplay)). Plus : [Installer comme une application](play.install-app.md).

<a name="what-you-get"></a>

## Produire les enregistrements

La table de production vous donne, par langue, chaque clip dont le jeu a besoin, qui le dit, son texte dans cette
langue, son fichier et son statut, gardés dans `games/<id>/voices.json` (`game/voices.json` dans un projet créé), et un
contrôle de chaque fichier enregistré.

<a name="where-to-run"></a>

### Où lancer les commandes

- Dans le dépôt du moteur, à sa racine : `npm run voices -- …`, `npm run ids -- …` (le jeu est `GAME=<id>`, sinon
  celui choisi par `npm run game`, sinon le `config.game` de `package.json`).
- Dans un projet créé, à sa racine : `npx quest-n-click voices …`, `npx quest-n-click ids …`.

`ffmpeg` (avec `ffprobe`) est requis pour `check` : voir [doctor](install.doctor.md).

<a name="steps"></a>

### Étapes

<!-- step: give-ids -->
1. **Donner un id stable à chaque réplique.** Sans id, une réplique n’est pas listée.

   ```sh
   # dans le dépôt du moteur
   npm run ids -- --lines --write
   ```

   ```sh
   # dans le projet créé
   npx quest-n-click ids --lines --write
   ```

   Sans `--write`, c’est un essai à blanc. `--lines=all` transforme d’abord chaque réplique écrite comme simple chaîne
   en `{ say: ['hero', text], id }`, pour un jeu qui double chaque réplique.

<!-- step: export -->
2. **Exporter la table pour les comédiens**, langue par langue (CSV, ou `--json`) :

   ```sh
   # dans le dépôt du moteur
   npm run voices -- export --lang fr > voices-fr.csv
   ```

   `npm run voices -- status` donne les comptes par langue : les clips nécessaires, leurs statuts (`draft`, `record`,
   `recorded`, `approved`), combien ont un fichier, et les clips qu’aucune réplique ne réclame.

<!-- step: file-clips -->
3. **Ranger les clips.** Mettez chaque fichier dans le dossier des voix, et nommez-le sous son id (ou sa clé) dans
   `audio.voices`, ou dans `audio.voicesByLang.<lang>` pour une traduction. Puis encodez-les :

   ```sh
   # dans le dépôt du moteur
   npm run assets
   ```

<!-- step: import -->
4. **Ramener les statuts** : le CSV (ou le JSON) rempli par les comédiens, avec statuts, comédiens et notes.

   ```sh
   # dans le dépôt du moteur
   npm run voices -- import voices-fr.csv --lang fr
   ```

   La commande refuse une ligne dont la réplique n’existe pas dans le jeu, ou un statut inconnu, et n’écrit rien alors.

<!-- step: check -->
5. **Contrôler les fichiers.**

   ```sh
   # dans le dépôt du moteur
   npm run voices -- check
   ```

   La commande mesure chaque clip encodé avec ffmpeg : le codec (mp3, ogg vorbis ou opus, aac, wav, flac), au moins
   22 050 Hz, au moins 300 ms et au plus trois fois le temps de lecture de la réplique, un volume entre −23 et
   −12 LUFS (la parole est vers −16), une crête sous −1 dBFS. `--release` fait de « approved without a clip » une
   erreur au lieu d’un avertissement ; `npx quest-n-click release` lance `voices check --release`.

<a name="expected-result"></a>

### Résultat attendu, et comment le vérifier

`npm run voices -- check` finit par `✔  [<id>] voices: 0 error(s), …` ; dans le jeu, la réplique joue son clip et reste
à l’écran jusqu’à la fin du clip.

<a name="common-errors"></a>

### Erreurs fréquentes

| Symptôme | Cause | Correction |
|---|---|---|
| Une réplique manque dans la table | Elle n’a pas d’id stable | `ids --lines --write` |
| `<id>: approved without a clip` | Approuvée dans `voices.json`, aucun fichier dans la table | Ranger le clip, ou changer son statut |
| `<id>: the clip cannot be read` | Le fichier n’est pas encore dans `public/assets/audio/voices/` | `npm run assets`, puis contrôler à nouveau |
| `<id>: a clip no line claims` | Une clé qu’aucune réplique de cette langue n’a (un id renommé, un aiguillage abandonné) | Renommer la clé, ou la retirer |
| `✖ no line "<id>" in the game` (import) | Une ligne venue d’une autre version du jeu | Exporter la table à nouveau |
| Un joueur français n’entend rien | `voicesByLang.fr` existe mais n’a pas cette réplique | L’enregistrer (voir [Par langue](#per-language)) |
| Les répliques doublées défilent sans son | Sons coupés, volume des voix à 0, ou fichier du clip absent | Vérifier le menu pause et Réglages ; `npm run assets` |

<a name="files-changed"></a>

### Fichiers ou données modifiés

`games/<id>/voices.json`, `games/<id>/audio/voice/`, `game.ts` (`audio.voices`, `audio.voicesByLang`), les sources
(`ids --write` ajoute des ids), `public/assets/audio/voices/` et `assets.gen.json` (les clips d’une traduction sous
`<lang>:<id>`).

<a name="recovery"></a>

### Revenir en arrière

`voices.json`, les tables et les sources sont dans Git : `git diff` montre ce qu’ont changé `ids --write` et `import`,
et `git checkout -- <fichier>` l’annule. `npm run voices -- status` et `export` n’écrivent rien.

<a name="references"></a>

## Références

- [`src/engine/core/voice-key.ts`](../../src/engine/core/voice-key.ts), [`src/engine/tools/voices.ts`](../../src/engine/tools/voices.ts), [`tools/voices.ts`](../../tools/voices.ts), [`src/engine/tools/validate/voices.ts`](../../src/engine/tools/validate/voices.ts)
- [`src/engine/dom/audio.ts`](../../src/engine/dom/audio.ts) (le premier geste), [`src/engine/dom/offline.ts`](../../src/engine/dom/offline.ts)
- ADR 0022 (les voix par valeur), [Traductions](create.translations.md), [Héros](create.heroes.md)
