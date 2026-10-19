# Fabriquer un jeu avec un assistant IA : la méthode

Voici la méthode qui a produit le premier jeu construit avec ce moteur (une aventure familiale de 9 lieux et
15 personnages, écrite et livrée en une seule journée par une seule personne travaillant avec Claude Code).
Chaque étape a un outil dans ce dépôt, et chaque étape se termine par quelque chose que l'auteur peut valider sur
un téléphone avant que la suivante ne commence.

## 1. L'histoire d'abord, sous forme de données
Écrire l'histoire comme un **storyboard** : des tableaux (un par lieu), des cases (une par moment), des répliques
(qui dit quoi), l'action du joueur qui déclenche chaque moment, les sons, et les indices donnés par la voix d'aide
quand le joueur est bloqué. Fichier : `games/<id>/storyboard.json`. Compétence : `/storyboard`. Le storyboard est
la source de vérité pour chaque texte du jeu ; le code en découle, jamais l'inverse.
Avant d'écrire, lire [DESIGN.md](DESIGN.md) : ce qui fait un bon lieu, une bonne énigme, une bonne chaîne d'indices et de bonnes réponses de repli avec ce moteur.

## 2. Valider le storyboard sur une page
`npm run page:storyboard` affiche le storyboard comme une page HTML illustrée, chaque case composée à partir des
vrais décors et sprites (une fois qu'ils existent), des répliques, des sons jouables, et d'un espace de notes sous
chaque case. On la publie comme un artefact claude.ai : l'auteur annote depuis son téléphone, l'IA relit les notes
(`ArtifactData`) et réécrit le storyboard. On recommence jusqu'à ce que l'auteur dise « v finale ».

## 3. Générer les assets
`docs/fr/PROMPTS.md` contient les prompts qui produisent des planches cohérentes : décors (1536 × 960, bande de
sol vide, sans personnage), planches d'objets (grille 6 × 4 de cases de 256 px sur fond uni, `#2B2E45` par
défaut, ou transparent), planches de personnages (portraits, marche, poses SCUMM), poses spéciales, et le kit de
bouches pour la parole. Une planche par prompt, toujours avec la planche de référence jointe pour le style.
Dans le Studio, l'onglet **Assets** montre le prompt de chaque planche à côté de ses cases, avec un bouton Copy.

## 4. Découper, détourer et relire
`python3 tools/cut-sheet.py <sheet.png> <sheet-id>` découpe une planche en `games/<id>/art/<sheet-id>/r<ligne>c<colonne>.png`,
le fond étant détouré. `npm run page:review` construit la **page de relecture** : chaque case de chaque planche
avec une décision garder / refaire / inutilisé et une note, enregistrées dans l'artefact. L'IA lit les décisions
et dresse la liste de ce qu'il faut régénérer.
L'onglet **Assets** du Studio découpe aussi (Upload generated sheet, Replace d'une case, sans jamais redécouper une
case existante sans demander) et lance `npm run assets`.

## 5. Écrire les lieux
Un fichier par lieu dans `games/<id>/rooms/`, pure donnée : accessoires et leurs états, personnages, zones
cliquables, répliques de regard, réactions (`verbe` + cible + condition + commandes), sujets de conversation,
indices, points de sauvegarde. Voir `CONTENT_GUIDE.md`. Compétence : `/new-room`. `npm run validate` repère les
identifiants cassés, les répliques de regard manquantes, les drapeaux inutilisés. `npm run solve` prouve que le
jeu peut être terminé.

## 6. Placer les éléments
La géométrie vit à part de la logique, dans `games/<id>/layout/<lieu>.json`, et n'est jamais tapée à la main :
- dans le navigateur : `npm run dev` puis `?edit=<lieu>` permet de déplacer les zones, les pieds, les hauteurs,
  les points d'approche, le polygone marchable ;
- ou sur un téléphone : `npm run page:placement` publie une page de glisser-déposer ; `npm run import-layout <fichier>`
  rapporte le résultat.

## 7. Prouver que ça se joue
`npm test` lance les tests du moteur et la traversée du jeu (une partie complète scriptée sur le vrai moteur).
`npm run e2e` joue tout le jeu au toucher dans un Chromium à la taille d'un téléphone et enregistre une capture
d'écran de chaque étape : l'IA les regarde pour repérer ce que le solveur ne peut pas voir (un personnage debout
sur une table, une réplique coupée par le bord de l'écran).

## 8. Livrer
`npm run build` vérifie les types, lance les tests, assemble et audite le résultat. On déploie `dist/` n'importe
où en statique (GitHub Pages via le workflow CI, Clever Cloud, Netlify…). Le service worker met en cache l'application
et chaque ressource utilisée ou préchargée dans les lieux voisins ; ces lieux peuvent ensuite être repris hors ligne.
Les lieux jamais visités ne sont volontairement pas tous téléchargés dès le départ.

## Travailler avec des sous-agents
Pour un jeu de plusieurs lieux, on découpe le travail en lots qu'un orchestrateur confie à des sous-agents :
changements du moteur, contenu par groupe de lieux, assets, mini-jeux, QA. `docs/fr/PRODUCTION.template.md` est
le plan utilisé ; la compétence `/production-plan` le remplit à partir du storyboard. Chaque lot se termine par
validate + solve + tests + captures d'écran.
