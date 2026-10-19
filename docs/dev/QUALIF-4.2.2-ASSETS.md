# Qualification 4.2.2 : les assets sur l'application de traitement

> **Date** : 19 octobre 2026.
> **Plan** : `docs/dev/PLAN-4.2.2-ATELIER-JOUABLE.md`, §2.6 (PR 6) : qualification d'abord, sur le runtime Node.js
> natif de Clever Cloud ; jamais Docker.
> **Où** : l'application `web-scumm-spike-worker` du spike S (organisation de test du mainteneur, région `par`),
> gardée pour la passe #149. Rien n'y a été déployé ni changé : une session SSH, un dossier dans `/tmp` (tmpfs),
> supprimé à la fin.
> Chaque chiffre ci-dessous est une mesure, ou dit qu'il n'en est pas une.

## 1. La machine

Mesuré par `uname`, `ldd --version`, `nproc`, `free`, `df` dans la session :

| Question | Résultat |
|---|---|
| Architecture, glibc | x86_64, **glibc 2.44** |
| Python, pip | **3.13.16**, pip 26.2.1 |
| ffmpeg | **9.0.2** |
| Processeur, mémoire | 1 vCPU, ≈ 1 Go (1 076 Mo) |
| `/tmp` | tmpfs de 539 Mo |

## 2. L'installation, hashes vérifiés

Le lock `ops/studio/worker-requirements.lock` donne les versions de `requirements.txt` (Pillow 12.3.0, NumPy 2.4.6,
SciPy 1.18.1), chacune avec le sha256 de sa roue `manylinux_2_28_x86_64` pour CPython 3.13 (téléchargées et
hachées sur la machine du mainteneur).

Commande : `python3 -m pip install --target <dossier> --require-hashes --only-binary=:all: -r requirements.lock`.

- **7,0 s**, une exécution, cache de pip vide.
- **226 Mo** installés.
- Aucune compilation : roues seulement (`--only-binary`), chaque hash vérifié (`--require-hashes`).

## 3. Un `prepare` complet

Le jeu d'exemple (`games/demo` : son `art/`, son `audio/`), `tools/assets.py`, et le `refs.json` que `tools/refs.ts`
produit (calculé sur la machine du mainteneur : l'application du spike n'a pas `tsx`), envoyés dans la session.

Commande : `GAME=demo PYTHONPATH=<dossier> python3 tools/assets.py`.

- **4,1 s** : 194 images traitées, 24 sons encodés (ffmpeg), 7,0 Mo d'assets préparés. Une exécution.
- Relancé aussitôt : 0 image, 0 son retraités (l'incrémental tient).
- Mémoire après : ≈ 400 Mo encore disponibles.
- **Non mesuré** :
  - la découpe de planches (`tools/cut-sheet.py`) ; un jeu plus gros ; la mémoire au plus haut pendant le `prepare`
    (seulement après) ;
  - la vidéo (libx264) et l'encodage `.ogg` (libvorbis) : le jeu d'exemple n'a ni vidéo ni son à réencoder en `.ogg` ;
  - le hook lui-même pendant un build Clever (rien n'a été déployé) et l'installation sur le disque de l'app (mesurée
    dans un tmpfs) : qu'il rejoue à chaque déploiement est attendu, pas mesuré, jusqu'au premier déploiement de la PR 6b
    ou la passe `studio-assets-hosted`.

## 4. Conclusion

**La qualification réussit** : sur le runtime natif, les dépendances s'installent, vérifiées, en quelques secondes, et
un `prepare` complet tient en quelques secondes sur 1 vCPU et ≈ 1 Go (la plus petite taille, d'après le spike S §1).

- Le hook de l'application de traitement : `CC_POST_BUILD_HOOK=python3 -m pip install --target .python
  --require-hashes --only-binary=:all: -r ops/studio/worker-requirements.lock`. `--target .python` plutôt que le
  `--user` du plan : un dossier de l'application, à côté du code qui s'en sert, plutôt que `$HOME`. Le job qui lance
  `tools/assets.py` met lui-même `PYTHONPATH=<dossier de l'application>/.python` (l'enfant du worker part d'un
  environnement vide).
- Le lock vaut pour CPython 3.13, Linux x86_64 : si le runtime passe à un autre Python ou une autre architecture, le
  hook refuse d'installer (aucun hash ne correspond) ; on refait alors le lock.
- La suite (D43, choix de l'assistant, écart au §2.6 qui mettait les deux en PR 6) : `prepare` devient un job du worker
  en 4.2.2 (PR 6b), sous le bail exclusif `*`, ses sorties gardées par le Studio ; la découpe de planches et les
  uploads de l'onglet Assets hébergé vont en 4.2.3.
