# Jack cherche un taf: storyboard

Generated from `storyboard.json` by `npm run page:storyboard -- --md` (or the Studio's Export Markdown). Do not edit: edit the JSON.

Legend: ACTION = what the player does; STAGE = stage direction; otherwise NAME: line.

Jack, squelette à tête de citrouille, faisait peur aux visiteurs du Manoir Frissonnant. Trop bien : le Comte Radinoff le licencie trois jours avant Halloween. Épisode 1 : le manoir, la place du village, la fête foraine, jusqu'au dossier de Pôle Frousse. Épisode 2 : la période d'essai au train fantôme, et la revanche sur le Comte. On ne meurt jamais, on ne reste jamais bloqué. Les indices viennent de Mireille, la petite araignée qui habite dans la tête de Jack : il suffit de lui parler (elle est dans l'inventaire).

## 1. Le Manoir Frissonnant
*Room: Le Manoir Frissonnant (`manoir`)*

**Goal:** Se faire virer (c'est fait), vider son casier, sortir dans la rue.

**On arrival:**
- STAGE: Le bureau du Comte. Toiles d'araignée, coffre-fort, une seule bougie (les bougies coûtent cher).

### manoir-1 · Le licenciement
- COMTE RADINOFF: Jack, mon petit. Asseyez-vous. Ah non, pas sur la chaise, elle est neuve.
- COMTE RADINOFF: Hier, vous avez fait peur à un car entier de touristes.
- JACK: Merci patron ! C'est mon métier.
- COMTE RADINOFF: Ils sont partis en courant. SANS PAYER. Vous êtes viré.
- JACK: Viré ? À trois jours d'Halloween ?
- COMTE RADINOFF: Videz votre casier. Et rendez la lanterne, elle appartient au manoir.
- SFX: thunder

### manoir-2 · Tuto : regarder
- ACTION: Regarder le casier (deux fois)
- JACK: Mon casier. Douze ans de bons et loyaux frissons.
- JACK: Il est coincé. Comme toujours. Il faut un bon coup.

### manoir-3 · Tuto : parler
- ACTION: Parler au Comte : « La lanterne, c'est la mienne. »
- COMTE RADINOFF: Avec VOS sous ? Que je vous ai versés ? Donc ce sont MES sous.
- JACK: C'est moi qui l'ai achetée. Avec mes sous.
- COMTE RADINOFF: Bon. Gardez-la. Mais je retiens la bougie sur votre dernier salaire.

### manoir-4 · Tuto : utiliser
- ACTION: Utiliser le casier (un coup de pied osseux)
- STAGE: BLONG. Le casier s'ouvre. Une avalanche d'objets.
- JACK: Ma lanterne, mon badge d'employé du mois…
- JACK: …et une chaussette. Je n'ai pas de pieds en tissu. Mystère.
- COMTE RADINOFF: Et n'oubliez pas : la lanterne appartient au manoir !
- SFX: locker_open

### manoir-4b · La porte refuse
- ACTION: Utiliser la porte sans avoir parlé de la lanterne
- COMTE RADINOFF: Une minute, Jack ! Et la lanterne ? Elle appartient au manoir !
- JACK: Il faut que je lui parle de cette lanterne.

### manoir-5 · Le conseil du Comte
- ACTION: Parler au Comte : « Un conseil pour trouver du travail ? »
- COMTE RADINOFF: Allez à Pôle Frousse, sur la place. Ils trouvent du travail à tout le monde.
- COMTE RADINOFF: Même aux loups-garous végétariens.

### manoir-6 · Sortie
- ACTION: Utiliser la porte
- JACK: Adieu, manoir. Adieu, toiles d'araignée. Je ne vous oublierai jamais.
- COMTE RADINOFF: Fermez la porte ! On chauffe pas la rue !
- SFX: creak

**Talk topics:**
- *Comte Radinoff*
  - "Pourquoi moi ?"
    - COMTE RADINOFF: Un bon fantôme fait peur, Jack. Pas TROP peur.
    - COMTE RADINOFF: Les clients qui s'évanouissent n'achètent pas de souvenirs.
  - "Et mon indemnité ?"
    - COMTE RADINOFF: Votre quoi ? Je ne connais pas ce mot. Il n'existe pas en transylvanien.
  - "La lanterne, c'est la mienne."
    - STAGE: Voir manoir-3.
  - "Un conseil pour trouver du travail ?"
    - STAGE: Voir manoir-5.

**Optional reactions:**
- Regarder le coffre-fort
  - JACK: Le coffre du Comte. Il dort dedans, paraît-il. Avec ses pièces.
- Regarder le coffre-fort (4e fois)
  - JACK: Je crois qu'il vient de me compter les côtes à travers la porte.
- Prendre la bougie
  - COMTE RADINOFF: TOUCHEZ PAS À LA BOUGIE. Elle a coûté douze centimes.
- Regarder la chaussette
  - JACK: Une chaussette verte, toute gluante. Ça ne vient pas de chez moi.
- Regarder le casier ouvert
  - JACK: Vide. Il reste une odeur de citrouille. C'est moi.
- Tirer le casier (fermé)
  - JACK: Coincé. Il faudrait plutôt un bon coup de pied osseux.
- Utiliser le casier vide
  - JACK: Il est vide. J'ai tout pris. Douze ans dans trois poches.
- Ouvrir le coffre-fort
  - COMTE RADINOFF: Pas touche ! Il y a toutes mes économies. Et mon lit.
- Donner la lanterne au Comte (autre solution)
  - JACK: Tenez, votre lanterne.
  - COMTE RADINOFF: Hmm. Finalement, gardez-la. Elle consomme trop de bougie.
- Donner le badge au Comte
  - COMTE RADINOFF: Gardez-le. Il est en plastique, il ne vaut rien.
- Donner la chaussette au Comte
  - COMTE RADINOFF: Ce n'est pas à moi. Je dors en chaussettes noires. Dans un coffre.

**Hints (vague to precise):**
1. Tes affaires sont dans ton casier, Jack.
2. Il est coincé. UTILISE-le, un bon coup de pied osseux.
3. Le Comte veut la lanterne. Parle-lui-en.
4. PARLER au Comte : « La lanterne, c'est la mienne. »
5. La porte, à gauche. Pôle Frousse t'attend sur la place.

**Exit:** Par la porte d'entrée, vers la place du village.

---

## 2. La place du village
*Room: La place du village (`place`)*

**Goal:** Monter un dossier pour Pôle Frousse : une photo d'identité et une lettre de recommandation du Maire.

**On arrival:**
- STAGE: Une place pavée, des citrouilles partout. Pôle Frousse, la Mairie, un photomaton. Au fond, la route de la fête foraine, gardée par un policier sans tête.
- JACK: La place du village. Pôle Frousse, c'est à gauche.
- JACK: Mireille, ma petite araignée, me souffle les indices si je lui parle.

### place-1 · Pôle Frousse
- ACTION: Parler à Mme Bandelette : « Je cherche du travail. »
- MME BANDELETTE: Bienveeenue à Pôle Frouuusse. Numéroooo ?
- JACK: Il n'y a personne d'autre.
- MME BANDELETTE: Ça n'empêche paaas. Prenez un numérooo.
- JACK: Je prends le ticket numéro 1.
- STAGE: Un long silence.
- MME BANDELETTE: Numérooo… uuun.
- JACK: C'est moi.
- MME BANDELETTE: Pour un dossier, il me faut une photo d'identitééé et une lettre de recommandatiooon.
- MME BANDELETTE: Les lettres, c'est le Maiiire qui les signe.

### place-2 · Le photomaton (raté)
- ACTION: Utiliser le photomaton (sans nez de clown)
- JACK: Clic. Flash. Hmm. La machine tremble.
- JACK: Elle tousse de la fumée… et crache une photo.
- JACK: Elle est réussie, non ?
- MME BANDELETTE: D'iciii, je vous le dis : refusééée. On ne recrute pas les gens qui font peur aux photos.
- JACK: Il me faudrait une tête plus… sympa. Une tête de fête.
- SFX: flash

### place-3 · Le Maire
- ACTION: Parler au Maire : « Monsieur le Maire, votre tête… »
- M. LE MAIRE: Bonjour, citoyen ! Franck Enstein, maire de la commune. Votez pour moi.
- STAGE: Sa tête penche dangereusement sur le côté.
- M. LE MAIRE: Ma tête ? J'ai perdu un boulon. Celui du cou. Gloubi l'a avalé ce matin en nettoyant.
- M. LE MAIRE: Rendez-moi mon boulon, et je vous écris la plus belle lettre de recommandation du pays.

### place-4 · Gloubi l'éboueur
- ACTION: Parler à Gloubi : « Bonjour ! Tu fais quoi ? »
- GLOUBI: Blorp ! Moi, Gloubi. Moi nettoyer. Moi avaler tout.
- ACTION: Parler à Gloubi : « Tu n'aurais pas avalé un boulon ? » (après avoir parlé au Maire)
- GLOUBI: Gloubi jamais rendre. Ce qui rentre dans Gloubi reste dans Gloubi.
- GLOUBI: Sauf si Gloubi trop content. Quand Gloubi content, Gloubi fait un rot.
- JACK: Et qu'est-ce qui te rend content ?
- GLOUBI: Barbe à papa. Gloubi rêve barbe à papa.
- GLOUBI: Mais fête foraine, interdite aux éboueurs. Bloorp.

### place-5 · Le Brigadier Sans-Tête
- ACTION: Parler au Brigadier : « Je peux passer ? »
- BRIGADIER SANS-TÊTE: HALTE ! Personne ne passe sans que je le voie !
- JACK: Mais… vous n'avez pas de tête.
- BRIGADIER SANS-TÊTE: Exactement. Donc je ne vois personne. Donc personne ne passe. C'est le règlement.
- BRIGADIER SANS-TÊTE: Ça fait trois cents ans que la route est bien gardée.

### place-6 · Une tête pour le Brigadier
- ACTION: Donner la lanterne au Brigadier
- JACK: Il pose la lanterne sur son col. Elle s'allume.
- BRIGADIER SANS-TÊTE: Oh ! OH ! Je vois ! Il y a un ciel ! Il est ORANGE ?
- JACK: Non, ça c'est la lanterne. Le ciel est violet.
- BRIGADIER SANS-TÊTE: Je vous vois, citoyen. Vous pouvez passer. Bonne fête foraine !
- STAGE: Bandeau : « Nouveau sur la carte : la fête foraine ».
- JACK: Je peux y aller par la route, à droite, ou avec la carte, en bas à gauche.
- SFX: light_on

### place-7 · Le rot de Gloubi
- ACTION: Donner la barbe à papa à Gloubi
- GLOUBI: BARBE À PAPA ! Gloubi heureux ! Gloubi trèèès heureux !
- GLOUBI: BUUUUURP.
- JACK: Un parapluie, un vélo d'enfant, un dentier… et un boulon !
- GLOUBI: Pardon. Gloubi poli d'habitude.
- JACK: Je prends juste le boulon. Le dentier, je te le laisse.
- SFX: burp

### place-8 · La lettre du Maire
- ACTION: Donner le boulon au Maire
- M. LE MAIRE: Mon boulon !
- JACK: Il le visse. Sa tête se redresse. Il a grandi de dix centimètres.
- M. LE MAIRE: Ah ! Je vois de nouveau mes électeurs dans les yeux !
- M. LE MAIRE: Tenez, Jack. « Jack est honnête, travailleur, et il a rendu un boulon. » Signé : le Maire.

### place-8b · Le Maire, après
- ACTION: Parler au Maire (boulon remis) : « Ça va mieux, la tête ? »
- M. LE MAIRE: Comme un charme ! Je vois enfin les deux côtés de chaque problème.
- M. LE MAIRE: Avant, je ne voyais que le gauche. On m'a accusé de faire de la politique.
- JACK: Et moi, je ne vois que le travail que je n'ai pas.
- M. LE MAIRE: Courage, citoyen ! Avec ma lettre, Mme Bandelette vous trouvera quelque chose.

### place-9 · Le photomaton (réussi)
- ACTION: Utiliser le photomaton avec le nez de clown (ou le nez de clown avec le photomaton)
- JACK: Nez rouge en place. Sourire en place. Enfin, sourire de citrouille.
- JACK: FLASH. La machine hésite… puis elle rigole. Une jolie photo sort.
- JACK: J'ai l'air d'un comptable qui aime les ballons. Parfait.
- SFX: flash

### place-10 · Le dossier
- ACTION: Donner la photo et la lettre à Mme Bandelette
- MME BANDELETTE: Photooo, ok. Lettre du Maiiire, ok. Dossier compleeet.
- MME BANDELETTE: Bon. Alors, pour un squelette qui fait très peur, j'ai…
- STAGE: Un long silence. Elle tape au clavier. Lentement.
- MME BANDELETTE: …une seule offre. Mais elle est bizarre. Même pour ici.
- JACK: Bizarre, c'est mon deuxième prénom.
- MME BANDELETTE: « Train fantôme cherche employé effrayant. Période d'essai : la nuit d'Halloween. » Chez M. Wolfgang.
- STAGE: Jack reçoit la fiche de poste.
- STAGE: Bandeau : « FIN DE L'ÉPISODE 1 : Jack a un dossier. Épisode 2 : la période d'essai ! »
- JACK: Le train fantôme ! À la fête foraine. Wolfgang m'attend.

### place-11 · Les bandelettes
- ACTION: Parler à Mme Bandelette : « Vous auriez des bandelettes en trop ? » (après avoir parlé à Ginette)
- MME BANDELETTE: Des bandelettes ? Pour des fantômes ? Quelle idéeee.
- MME BANDELETTE: Bon. J'en ai trois kilomètres en réserve. On ne sait jamais, avec l'âge.
- JACK: Elle se déroule un peu, et me tend un gros rouleau.
- JACK: Du lin d'Égypte. Ginette va adorer.

### place-12 · La chaîne de vélo
- ACTION: Prendre le tas d'objets (après avoir parlé à Ginette)
- JACK: Le vélo d'enfant que Gloubi a recraché. Sa chaîne est toute légère.
- STAGE: Jack récupère la chaîne.
- GLOUBI: Gloubi pas besoin vélo. Gloubi roule tout seul. Blorp.

### place-13 · Une nouvelle photo ratée
- ACTION: Utiliser le photomaton sans nez de clown (si Jack n'a plus de photo effrayante)
- JACK: Sans le nez, cette fois. Pour la science.
- JACK: FLASH. La machine hurle et crache une photo terrifiante.
- JACK: Parfait. Enfin, parfaitement horrible.
- SFX: flash

**Talk topics:**
- *Mme Bandelette*
  - "Vous êtes là depuis longtemps ?"
    - MME BANDELETTE: Quatre mille aaans. Je suis en période d'essaaai.
  - "Il vous faut quoi, déjà ?"
    - MME BANDELETTE: Une photooo. Une lettre du Maiiire. Et de la patieeence.
- *M. le Maire*
  - "Vous êtes fait de quoi ?"
    - M. LE MAIRE: De plusieurs anciens maires. C'est ça, la continuité.
  - "Vous avez un travail pour moi ?"
    - M. LE MAIRE: Demandez à Pôle Frousse. Moi, je ne fais que serrer des mains. Parfois elles se détachent.
- *Gloubi*
  - "Tu as mangé quoi aujourd'hui ?"
    - GLOUBI: Deux poubelles, un banc, un pigeon. Pigeon ressorti. Pigeon vexé.
- *Brigadier Sans-Tête*
  - "Où est votre tête ?"
    - BRIGADIER SANS-TÊTE: Si je le savais, je ne serais pas brigadier. Je serais détective.
  - "Il se passe quoi à la fête foraine ?"
    - BRIGADIER SANS-TÊTE: On y embauche, paraît-il. Pour Halloween. Mais je n'ai rien vu. Forcément.
  - "Alors, cette vue ? (lanterne donnée)"
    - BRIGADIER SANS-TÊTE: Magnifique. Je vois des choses que je n'aurais jamais voulu voir. Comme le Maire en pyjama.

**Optional reactions:**
- Donner la chaussette à Gloubi
  - GLOUBI: Blorp ! Chaussette perdue ! Gloubi cherchait depuis Pâques. Merci ami.
  - GLOUBI: Gloubi ému. Mais pas assez pour roter. Barbe à papa, oui.
- Regarder le photomaton (2e, 3e et 4e fois)
  - JACK: Il me regarde de travers.
  - JACK: Il a encore un peu de fumée qui sort.
  - JACK: Je crois qu'il a peur que je revienne.
- Utiliser le photomaton une 2e fois, sans nez de clown
  - JACK: Il affiche : « EN PAUSE CAFÉ. REVENEZ AVEC UNE AUTRE TÊTE. »
- Donner la lanterne au Maire
  - M. LE MAIRE: Merci, mais j'ai déjà un éclairage public. Il s'appelle « la foudre ».
- Regarder le Maire (boulon remis)
  - JACK: Le Maire, tête bien droite. Il serre des mains deux fois plus vite.
  - JACK: Il a l'air plus grand. Et plus content. Surtout plus grand.
- Utiliser le photomaton (photo déjà faite)
  - JACK: J'ai déjà ma photo. Je ne vais pas abuser.
- Donner seulement la photo à Mme Bandelette
  - MME BANDELETTE: Jolie photooo. Il me manque encore la lettre du Maiiire.
- Donner seulement la lettre à Mme Bandelette
  - MME BANDELETTE: Belle lettre. Il me manque encore une photooo.
- Donner la photo ratée à Mme Bandelette
  - MME BANDELETTE: Aaaah !
  - MME BANDELETTE: Pardon. Refusééée. Il me faut une photo qui ne fait pas peur.
- Donner la lanterne à Gloubi
  - GLOUBI: Gloubi pas manger lumière. Après, ventre qui brille la nuit.
- Prendre la route de la fête foraine (lanterne pas donnée)
  - BRIGADIER SANS-TÊTE: HALTE ! Personne ne passe sans que je le voie !
  - JACK: Il ne voit personne. Donc personne ne passe. Logique de brigadier.
- Prendre une citrouille
  - JACK: Prendre une citrouille ? C'est comme prendre un cousin. Non.
- Prendre le tas d'objets
  - JACK: Le dentier ? Non merci. J'ai déjà toutes mes dents. Elles sont en citrouille.

**Hints (vague to precise):**
1. Pôle Frousse, à gauche. Parle à la momie du guichet.
2. Il te faut une lettre du Maire. Va lui parler.
3. Le boulon du Maire est dans le ventre de Gloubi. Parle à Gloubi.
4. La barbe à papa, c'est à la fête foraine. Mais le Brigadier ne voit personne passer.
5. Il lui faudrait une tête qui éclaire… Ta lanterne ?
6. DONNE la lanterne au Brigadier.
7. Mémé Guimauve, à la fête foraine, paie en barbe à papa.
8. DONNE la barbe à papa à Gloubi.
9. DONNE le boulon au Maire.
10. Pour la photo, il te faut une tête de fête.
11. Un nez de clown, peut-être ? À la fête foraine, le petit dragon du manège.
12. Avec le nez de clown, UTILISE le photomaton.
13. DONNE la photo et la lettre à Mme Bandelette.
14. Wolfgang t'attend à la fête foraine. Donne-lui la fiche de poste.
15. Il se passe des choses dans le train fantôme. Va voir à la fête foraine.
16. Des draps neufs pour les fantômes… Mme Bandelette a sûrement des bandelettes en trop.
17. PARLE à Mme Bandelette.
18. Des chaînes légères… Le tas d'objets que Gloubi a recraché, il y a un vélo.
19. PRENDS le tas d'objets : la chaîne du vélo.
20. Pour l'affiche, il te faut une photo qui fait vraiment peur.
21. UTILISE le photomaton, sans le nez de clown.
22. Tout se passe à la fête foraine, maintenant.

**Exit:** Par la route du fond vers la fête foraine (une fois la lanterne donnée).

---

## 3. La fête foraine
*Room: La fête foraine (`foire`)*

**Goal:** Essayer des petits boulots pour gagner une barbe à papa et un nez de clown.

**On arrival:**
- STAGE: Un stand de barbe à papa, un manège avec un petit dragon, un train fantôme.
- JACK: Guirlandes, musique d'orgue, odeur de sucre.
- JACK: Ça sent le travail. Et la guimauve.

### foire-1 · Mémé Guimauve
- ACTION: Parler à Mémé Guimauve : « Vous embauchez ? »
- MÉMÉ GUIMAUVE: Un vendeur ! Enfin ! Mon dos de sorcière n'en peut plus.
- MÉMÉ GUIMAUVE: Les clients demandent une couleur, tu sers la bonne. Facile, mon chou.
- JACK: Facile. Je suis né pour ça. Enfin, mort pour ça.

### foire-2 · Mini-jeu : la barbe à papa
- ACTION: Mini-jeu « pick » : servir la bonne couleur (rose, bleue, verte…) trois fois de suite
- STAGE: Écoute bien ce que veut le client, Jack.
- STAGE: Un petit fantôme voudrait une barbe à papa ROSE.
- STAGE: Une sorcière veut la VERTE. Comme son nez.
- STAGE: Un vampire demande la BLEUE. « Pas la rouge, je suis au régime. »
- STAGE: Mauvaise couleur : « Pas celle-là ! Le client fait une drôle de tête. »
- STAGE: Piège : « Barbe à papa à la toile d'araignée ! Le client s'enfuit en hurlant… puis revient, il n'a pas payé. »
- STAGE: Trois clients servis !

### foire-3 · Licencié (encore)
- ACTION: Gagner le mini-jeu
- MÉMÉ GUIMAUVE: Tu sers très bien, mon chou. Mais les enfants ont peur de ta tête. Ils mangent en tremblant.
- MÉMÉ GUIMAUVE: Tiens, ta paie : une barbe à papa. Et bonne chance pour la suite !
- JACK: Deuxième licenciement de la journée. Je progresse.
- SFX: success

### foire-4 · Pépite le dragon
- ACTION: Parler à M. Carrousel : « Votre manège ne tourne pas ? »
- M. CARROUSEL: Mon manège est en panne ! Pépite, mon petit dragon, a peur des enfants. Il ne veut plus tourner.
- JACK: Un dragon qui a peur ? Je connais un peu le sujet. Dans l'autre sens.
- M. CARROUSEL: Si tu le calmes, le poste de dompteur est à toi. Il faut le caresser, tout doucement.

### foire-5 · Mini-jeu : caresser Pépite
- ACTION: Mini-jeu « stroke » : utiliser Pépite et le caresser doucement
- STAGE: Doucement, Jack. Tout doucement.
- STAGE: Trop vite : « Trop vite ! Il crache une petite flamme. »
- STAGE: Il ronronne !

### foire-6 · Le nez de clown
- ACTION: Gagner le mini-jeu
- JACK: Pépite se calme… et éternue. Quelque chose vole jusqu'à moi.
- M. CARROUSEL: Un nez de clown ! Il l'avait avalé l'an dernier ! Garde-le, ça te va bien.
- M. CARROUSEL: Par contre, le poste de dompteur… Pépite est calme. Il n'a plus besoin de dompteur. Désolé !
- JACK: Troisième licenciement de la journée. Record personnel.
- SFX: success

### foire-7 · Le train fantôme
- ACTION: Parler à Wolfgang : « Vous embauchez au train fantôme ? »
- WOLFGANG: Ouaf. Désolé, mon train fantôme est fermé. Mes fantômes sont en grève.
- JACK: Je fais peur. Très peur. Trop peur, même. Engagez-moi !
- WOLFGANG: Faut un dossier de Pôle Frousse. C'est la loi. Reviens avec, on verra.

### foire-8 · L'embauche à l'essai
- ACTION: Donner la fiche de poste à Wolfgang (ou lui dire « J'ai mon dossier de Pôle Frousse ! »)
- WOLFGANG: Un dossier de Pôle Frousse ! En règle ! Ouaf !
- WOLFGANG: Bon. Tu es pris à l'essai. Ce soir, c'est Halloween : si le train rouvre et que les clients ressortent contents…
- WOLFGANG: …ET en payant. Surtout en payant. Alors le poste est à toi.
- JACK: Et qu'est-ce qui ne va pas, dans le train ?
- WOLFGANG: Tout. Les fantômes sont en grève, le courant est coupé, et personne ne sait qu'on rouvre.
- WOLFGANG: Monte dans le wagon, le tunnel est derrière.
- STAGE: Le wagon devient une entrée : on peut monter dans le train fantôme.
- SFX: paper

### foire-9 · L'affiche
- ACTION: Utiliser la photo ratée avec le panneau du train fantôme
- JACK: Ma photo ratée. Celle qui a fait peur au photomaton.
- STAGE: Jack la colle sur le panneau.
- WOLFGANG: Ouaf ! Rien qu'en la regardant, j'ai perdu des poils. Je l'agrandis en poster géant. C'est PARFAIT.
- JACK: Des passants s'arrêtent, frissonnent… et font la queue.
- SFX: paper

### foire-10 · Tout est prêt
- ACTION: Parler à Wolfgang : « Tout est prêt ! » (grève finie, courant rétabli, affiche posée)
- WOLFGANG: Les fantômes travaillent, le train roule, il y a une queue. Je n'en reviens pas.
- WOLFGANG: Place à la répétition générale. Les premiers clients arrivent ! File te cacher dans le train !
- STAGE: Jack file dans le train fantôme. Le Brigadier (tête-lanterne), le Maire et Gloubi montent dans le wagon.

**Talk topics:**
- *Mémé Guimauve*
  - "Vous êtes une vraie sorcière ?"
    - MÉMÉ GUIMAUVE: À la retraite. Maintenant, je fais du sucre. C'est de la magie qui colle.
  - "Je peux retravailler ? (après le mini-jeu)"
    - MÉMÉ GUIMAUVE: Non, mon chou. Les enfants tremblent encore. Regarde, il y en a un qui fait des glaçons.
- *M. Carrousel*
  - "Pourquoi Pépite a peur ?"
    - M. CARROUSEL: Un enfant lui a dit qu'il ressemblait à un lézard. Il ne s'en est jamais remis.
- *Wolfgang*
  - "Pourquoi vos fantômes font grève ?"
    - WOLFGANG: Ils veulent des draps neufs. Et des chaînes moins lourdes. Je les comprends.
  - "Vous êtes un loup-garou ?"
    - WOLFGANG: Seulement les soirs de pleine lune. Le reste du temps, je suis comptable.
  - "C'est quoi, le travail ?"
    - WOLFGANG: Tu te caches dans le noir, et quand le wagon passe, BOUH. Mais pas trop fort. Il faut qu'ils paient à la sortie.
  - "Où on en est ? (pendant l'essai)"
    - STAGE: Wolfgang fait le point, une phrase par tâche :
    - WOLFGANG: Les fantômes ont repris le travail. Bravo.
    - STAGE: ou
    - WOLFGANG: Les fantômes font toujours grève. Va voir Ginette, dans le train.
    - WOLFGANG: Le courant marche.
    - STAGE: ou
    - WOLFGANG: Toujours pas de courant. Le tableau électrique est au fond du tunnel.
    - WOLFGANG: L'affiche fait un malheur.
    - STAGE: ou
    - WOLFGANG: Et personne ne sait qu'on rouvre. Il faudrait une affiche qui fait peur, sur le panneau.

**Optional reactions:**
- Regarder le train fantôme (4e fois)
  - JACK: Un wagon vient de me faire un clin d'œil. Je crois. Ou c'est la rouille.
- Donner la chaussette à Pépite
  - JACK: Pépite souffle dessus. Pfffff.
  - JACK: La chaussette prend feu, puis s'éteint. Trop gluante pour brûler.
- Caresser Pépite avant de parler au patron du manège
  - JACK: Pépite crache une flammèche. Ouille.
  - JACK: Je devrais d'abord demander au patron du manège.
- Caresser Pépite une fois calme
  - JACK: Il ronronne. Prrrt. Prrrrrrt.
- Prendre au stand de barbe à papa
  - MÉMÉ GUIMAUVE: Pas touche, mon chou ! Ici, la barbe à papa, ça se mérite.
- Utiliser le train fantôme avant l'embauche
  - WOLFGANG: Ouaf. C'est fermé. Mes fantômes sont en grève.
- Utiliser la photo ratée avec le panneau avant l'embauche
  - JACK: Coller ma photo ici ? Je ne travaille pas encore pour le train fantôme.
- Donner la photo ratée à Wolfgang
  - WOLFGANG: Brr. Colle-la plutôt sur le panneau, devant le train. Qu'elle fasse peur aux passants, pas à moi.
- Regarder le panneau (affiche posée)
  - JACK: Mon affiche. Les passants frissonnent. Les plus courageux font la queue.

**Hints (vague to precise):**
1. Ici, on embauche. Mémé Guimauve cherche un vendeur.
2. PARLE à Mémé Guimauve. Elle paie en barbe à papa.
3. Le patron du manège a l'air embêté. Parle-lui.
4. Pépite a peur. Il faut le caresser, tout doucement.
5. UTILISE Pépite pour le caresser.
6. Tu as ce qu'il faut. Retourne sur la place, Jack.
7. Wolfgang voulait un dossier de Pôle Frousse. DONNE-lui la fiche de poste.
8. Le train fantôme est derrière le wagon. Va voir ce qui s'y passe.
9. L'affiche : il faut une image qui fait vraiment peur. Ta photo ratée du photomaton ?
10. Tu ne l'as plus ? Le photomaton, sur la place, sans le nez de clown.
11. UTILISE la photo ratée avec le panneau, devant le train.
12. Il reste du travail dans le train fantôme.
13. Tout est prêt ? Dis-le à Wolfgang.

**Exit:** Retour à la place par la route.

---

## 4. Dans le train fantôme
*Room: Le train fantôme (`train`)*

**Goal:** Finir la grève des fantômes et rétablir le courant (la troisième tâche, l'affiche, se fait dehors).

**On arrival:**
- STAGE: Un tunnel sombre. Des rails, des toiles d'araignée, des cercueils en carton. Trois fantômes tiennent une banderole « GRÈVE ».
- JACK: Il fait noir comme dans une citrouille. Heureusement, ma tête éclaire.

### train-1 · La grève
- ACTION: Parler à Ginette
- GINETTE: Des draps propres, pas des draps sales ! Des chaînes légères, pas des chaînes de galère !
- JACK: Bonjour. Je suis le nouveau. À l'essai.
- GINETTE: Un jaune ! Euh, un orange. Un briseur de grève à tête de citrouille !
- JACK: Non, non. Je suis de votre côté. Qu'est-ce qu'il vous faut ?
- GINETTE: Des draps neufs, les nôtres ont des trous. Et des chaînes légères : on a des bleus aux chevilles.
- GINETTE: Tant qu'on n'a pas les deux, on ne hante personne. Solidarité !

### train-2 · Les draps neufs
- ACTION: Donner les bandelettes à Ginette
- GINETTE: Du lin d'Égypte ! Trois kilomètres ! On va pouvoir se faire des draps… et des rideaux.
- JACK: Les fantômes s'enroulent dedans. Ils ressemblent à des momies. Ils adorent.

### train-3 · Les chaînes légères
- ACTION: Donner la chaîne de vélo à Ginette
- GINETTE: Une chaîne de vélo ! Si légère ! Écoutez-moi ce petit cliquetis…
- JACK: Gaston la fait tinter. Bouh se met à pédaler dans le vide.
- SFX: chains

### train-4 · Fin de la grève
- ACTION: (quand les deux sont donnés)
- GINETTE: Camarades, nos revendications sont satisfaites. On reprend le travail !
- STAGE: Les fantômes se remettent au travail.
- GINETTE: Merci, la citrouille. Tu es un bon collègue. Pour un employé à l'essai.
- BOUH: Bouh !
- STAGE: Bandeau : « La grève est finie ! »
- SFX: bouh

### train-5 · Le tableau électrique
- ACTION: Utiliser le tableau électrique
- JACK: Le tableau électrique. On dirait un plat de spaghettis.
- STAGE: Mini-jeu « câbles » : « Suis chaque fil dans le nœud, Jack, et branche-le sur la prise de sa couleur. »
- STAGE: Mauvais branchement : un gag, jamais un échec. Le squelette du décor se met à danser, ou un écran affiche : « Le train fantôme a rencontré un problème et doit hanter de nouveau. Bouh. »
- STAGE: La lumière revient !
- SFX: zap

### train-6 · Le courant revient
- ACTION: Gagner le mini-jeu
- JACK: Les lampes s'allument, l'orgue démarre, les yeux des tableaux s'allument.
- JACK: Ça marche ! Je suis électricien, maintenant. Ça fait deux métiers en une soirée.
- SFX: light_on

### train-7 · La répétition générale
- ACTION: (après « Tout est prêt » avec Wolfgang)
- JACK: Le wagon entre. Le Brigadier, le Maire et Gloubi. Vite, une cachette !
- MIREILLE: Cache-toi bien, Jack. Et surgis au bon endroit. Pas trop fort !
- STAGE: Mini-jeu « cache-cache » : « Où te cacher pour surgir au bon moment ? » Le cercueil, le lustre, l'armoire ou le tonneau.
- STAGE: Le lustre : « Jack se suspend au lustre… qui se décroche. Bouh dit « bouh ». Personne n'a peur. »
- STAGE: L'armoire : « L'armoire est déjà occupée : Gaston y range ses chaînes. »
- STAGE: Le tonneau : « Jack sort du tonneau trop tôt. Gloubi croit que c'est l'apéritif. »
- STAGE: La bonne cachette : le cercueil. « BOUH ! Juste ce qu'il faut. »

### train-8 · Juste ce qu'il faut
- ACTION: Gagner le mini-jeu
- BRIGADIER SANS-TÊTE: AAAH ! Enfin, je vois des choses qui font peur ! C'est merveilleux !
- M. LE MAIRE: Mes boulons ont tremblé ! Je vote pour ! Je revote !
- GLOUBI: Gloubi a eu peur ! Gloubi n'a même pas avalé le wagon ! Encore !
- JACK: Ils sortent en riant… et ils paient. Tous les trois. Deux fois.
- SFX: creak

**Talk topics:**
- *Ginette*
  - "Où en sont vos revendications ? (pendant la grève)"
    - GINETTE: Les draps : obtenus !
    - STAGE: ou
    - GINETTE: Des draps neufs : toujours rien !
    - GINETTE: Les chaînes : obtenues !
    - STAGE: ou
    - GINETTE: Des chaînes légères : toujours rien !
  - "Pourquoi vous faites grève ?"
    - GINETTE: Trois cents ans à hanter dans des draps troués, avec des chaînes de bagnard. Ça suffit !
  - "Qui sont les deux autres ?"
    - GINETTE: Gaston, il fait les bruits de chaînes. Et le petit Bouh, c'est un stagiaire. Il ne dit que « bouh ».
- *Bouh*
  - "Bonjour, petit fantôme."
    - BOUH: Bouh.
    - JACK: Bouh à toi aussi.
  - "Un conseil pour faire peur ?"
    - BOUH: Bouh…
    - BOUH: …BOUH !
    - JACK: Je vois. Tout est dans la nuance.

**Optional reactions:**
- Regarder les cercueils (4e fois)
  - JACK: En carton. Le Comte Radinoff aurait trouvé ça trop cher.
- Donner la chaussette à Ginette
  - GINETTE: Une chaussette ? On n'a pas de pieds. Mais merci pour l'intention.
- Ouvrir un cercueil
  - JACK: Vide. Le locataire est parti en vacances. Il a laissé un mot : « Bouh. »
- Tirer le lustre
  - JACK: Si je tire dessus, il me tombe sur la citrouille. Non merci.
- Regarder les fantômes (grève finie)
  - JACK: Gaston, enroulé dans des bandelettes neuves. Sa chaîne de vélo fait un joli cliquetis.
- Regarder le tableau électrique (courant rétabli)
  - JACK: Le tableau électrique. Tout est branché. Je suis électricien, maintenant.
- Utiliser le tableau électrique (courant rétabli)
  - JACK: Tout marche. Je ne touche plus à rien.

**Hints (vague to precise):**
1. Ginette mène la grève. Parle-lui.
2. Des draps neufs : Mme Bandelette, sur la place, a sûrement des bandelettes en trop.
3. DONNE les bandelettes à Ginette.
4. Des chaînes légères : le vélo que Gloubi a recraché sur la place a une chaîne.
5. DONNE la chaîne de vélo à Ginette.
6. Le tableau électrique, au fond. UTILISE-le.
7. Il manque l'affiche, dehors, sur le panneau devant le train.
8. Tout est prêt ! Va le dire à Wolfgang.

**Exit:** Par le wagon, vers la fête foraine.

---

## 5. La revanche du Comte
*Room: La fête foraine (`foire`)*

**Goal:** Être engagé, et dire non au Comte.

### final-1 · Engagé !
- WOLFGANG: Ils ont payé. TOUS. Deux fois. Ouaf !
- WOLFGANG: Jack, tu n'es plus à l'essai. Tu es la vedette du train fantôme.
- JACK: Engagé. Pour faire peur. Juste ce qu'il faut.
- MIREILLE: Bravo, Jack ! Je savais que tu trouverais.

### final-2 · Le Comte arrive
- STAGE: Le Comte Radinoff apparaît dans la foule.
- COMTE RADINOFF: Jack ! Mon petit Jack ! Mon manoir est vide. Les touristes n'ont plus peur. Ils pique-niquent dans la crypte !
- COMTE RADINOFF: Revenez. Je vous réembauche. Au double du salaire !
- JACK: Le double de quoi ?
- COMTE RADINOFF: …Le double de l'ancien. Moins la bougie.

### final-3 · La réponse de Jack (choix)
- ACTION: Choisir une réponse
- ACTION: Choix : « Non merci, j'ai trouvé un patron qui paie en vrais euros. »
- ACTION: Ou : « Ça dépend. Je peux garder la chaise neuve ? »
- COMTE RADINOFF: Jamais !
- JACK: Alors non.
- ACTION: Ou : « Oui ! »
- COMTE RADINOFF: Vraiment ?!
- JACK: …Non, je plaisante.
- COMTE RADINOFF: Vous refusez ? Moi qui étais prêt à vous offrir… un ticket de bus. Usagé.

### final-4 · Le Comte paie
- WOLFGANG: Monsieur le Comte, un tour de train fantôme ? Deux euros.
- COMTE RADINOFF: Deux euros ?! …Bon. Pour voir ce qu'il a de si spécial.
- STAGE: Le Comte disparaît dans le train fantôme.
- COMTE RADINOFF: AAAAAAAAH !
- STAGE: Il ressort, tout blanc. Encore plus que d'habitude.
- COMTE RADINOFF: C'était… TERRIFIANT. J'en reprends un. Tenez, quatre euros.
- JACK: Le Comte Radinoff qui paie. Deux fois. Ça, c'est le vrai miracle d'Halloween.
- STAGE: FIN. Carte de fin, crédits.
- SFX: coins

---
