# Blender MCP (modèles 3D du clone)

Claude Code pilote Blender par le serveur MCP [`blender-mcp`](https://pypi.org/project/blender-mcp/) :
exécuter du Python dans Blender (`execute_blender_code`), lire la scène (`get_scene_info`), etc. Le but est de
modéliser, gréer et animer nos propres modèles d'unités et de héros, puis de les exporter en glTF pour le jeu.

## Fonctionnement

- `.mcp.json` (racine du dépôt) déclare le serveur `blender`, approuvé par `.claude/settings.json`.
- `blender-mcp.sh` est lancé par Claude Code. Si un Blender est déjà ouvert avec l'addon MCP sur le port 9876
  (sur votre machine), il est utilisé tel quel. Sinon, le script démarre `host.py` : Blender sans fenêtre
  (le module Python `bpy`), dont l'addon du MCP écoute sur le port 9876. Si ce Blender s'arrête, il redémarre.
- `setup.sh` installe `bpy` 4.5 LTS et `blender-mcp` depuis PyPI dans `~/.cache/kuf-blender` (Python 3.11,
  environ 400 Mo). Le lanceur l'exécute de lui-même au premier démarrage s'il manque.
- La télémétrie de `blender-mcp` est désactivée par le lanceur.

## Environnement cloud de Claude Code

Pour éviter l'installation au premier appel (et un éventuel délai de connexion dépassé), ajoutez cette ligne au
script de configuration de l'environnement (menu de l'environnement dans la barre de titre de la session,
puis Modifier) :

```bash
bash kingdom-under-fire/tools/blender/setup.sh
```

download.blender.org est bloqué par la politique réseau du conteneur : Blender vient donc de PyPI (`bpy`).

## Limites sans GPU

- Pas de fenêtre ni de capture de la vue 3D : l'outil `look` échoue.
- Workbench et EEVEE demandent un GPU (libEGL) et font tomber Blender : pour voir un modèle, faire un rendu
  **Cycles** sur le CPU (`scene.render.engine = 'CYCLES'`, `scene.cycles.device = 'CPU'`), puis lire l'image.
- Les recherches et imports de Poly Haven, Sketchfab ou Poly Pizza et la génération 3D dépendent de services
  externes et de clés : ils ne servent pas ici (nos modèles sont faits main, aucun asset tiers n'est versionné).

## Modèles des unités (`models/`)

```bash
npm run models                                   # tous les modèles -> public/models/<modèle>.glb
npm run models -- hero_gerald --preview /tmp/vu  # un modèle, avec des aperçus (face, dos, attaque)
```

- `kuf.py` : pièces (boîtes, sphères, cônes, tubes à sections elliptiques, plaques, voiles courbes) décrites
  en coordonnées du moteur (m, y en haut, l'unité regarde +z, main de l'arme en +x), squelette du moteur
  (`Body`, `LeftLeg`, `RightLeg`, `WeaponArm`, `ShieldArm`, `Weapon`, têtes d'os sur les pivots du shader),
  un os par sommet, export glTF.
- `humans.py` : Gerald et le fantassin d'Hironeiden. Le matériau `Team` prend la couleur de faction en jeu.
- `build.py` : construit, vérifie le budget de triangles (Gerald 6 000, fantassin 1 000 : les soldats sont
  dessinés par centaines, deux fois par image), exporte, rend les aperçus (Cycles, CPU) en posant le squelette
  comme le shader.
- Le jeu les charge par `src/renderer/UnitModelLoader.ts` ; `tests/unit/unitModels.test.ts` vérifie les
  fichiers exportés (os, taille, budget, couleur de faction).

