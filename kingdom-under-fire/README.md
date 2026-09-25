# Kingdom Under Fire : La Guerre des Héros

Remake web, en 3D dans le navigateur, de **Kingdom Under Fire: A War of Heroes** (Phantagram, 2001), écrit en
**TypeScript strict + Three.js + Vite**. Le jeu reprend son univers : le continent de Bersia, la Seconde Guerre
des Héros, l'**Alliance Humaine** du roi Gernot contre la **Légion Noire** de Rick Blood, avec Curian, Likuku,
Richter Rosenheim, Moonlight et les autres. Il vise des batailles de masse : grandes armées, formations,
combat de mêlée et moral, puis héros, magie, bases, siège et campagne au fil des jalons.

Les portraits et illustrations officiels, ainsi que vos propres musiques et sons (par exemple ceux de votre copie
du jeu), s'installent avec `npm run assets` et ne sont jamais versionnés (voir [Assets officiels](#assets-officiels)).

## État : premier prototype (jalon 1) ✅

Le premier jalon est atteint : sélectionner 20 soldats, en faire une formation, leur donner un ordre, attaquer
20 ennemis et observer le combat. La bataille prototype, **Les plaines de Hironeiden**, oppose une compagnie de
Hironeiden à l'avant-garde orque de Likuku, qui marche sur la capitale.

- Univers de Kingdom Under Fire : écran de briefing (récit, objectif, commandants des deux camps), chroniques de
  Bersia (Nibel et Encablossa, Première et Seconde Guerre des Héros) et 12 personnages.

- Champ de bataille de 256 m généré (plaine centrale, collines, forêts, rochers, crête de montagnes), ombres,
  ciel, brouillard.
- Caméra RTS amortie : WASD/ZQSD, bords d'écran, zoom avec inclinaison automatique, rotation, inclinaison,
  limites, focus, caméra libre.
- Alliance Humaine (fantassins et lanciers d'Hironeiden) contre Légion Noire (guerriers et lanciers orcs de
  Hexter, modèles à part : peau verte, défenses, casques à cornes, haches). Les orcs frappent plus fort et
  encaissent davantage, mais sont moins armurés et moins disciplinés. Les données sont validées par Zod, et
  l'équilibre a été réglé par balayage de paramètres : 17 victoires humaines sur 40 batailles.
- Rendu instancié : un `InstancedMesh` par modèle, animation par os dans le vertex shader (marche, frappe, estoc,
  bouclier, chute, cadavre qui s'enfonce), ombres comprises. 1000 soldats = 12 draw calls pour toute la scène.
- Sélection : clic, rectangle, Maj/Ctrl, double-clic, filtres par type, groupes Ctrl+1–9 (double appui : caméra).
- Formations : ligne, colonne, carré, coin, cercle, dispersée. Le clic droit glissé trace le front (largeur et
  orientation) avec un aperçu, et l'affectation des slots se fait sans croisement.
- Déplacement de masse : un flow field par destination (jamais un A* par soldat), steering local
  (séparation, alignement, cohésion, évitement d'obstacles), grille spatiale. Forêts et pentes ralentissent.
- Combat de mêlée : acquisition des cibles, cycle armement → impact → récupération, 8 types de dégâts ×
  5 armures, critiques, recul, impacts simultanés, mort et cadavres.
- Moral : états normal, ébranlé, paniqué, en déroute et se ralliant, selon le rapport de force local, les pertes,
  les morts voisines et la contagion de la déroute. Les fuyards fuient puis se rallient.
- IA sans omniscience : elle ne voit que ce que voient ses soldats, se souvient des dernières positions,
  part en reconnaissance puis attaque.
- Barres de vie, particules d'impact, marqueurs d'ordre, bannière de victoire ou de défaite.
- Portraits, illustrations et emblèmes officiels, musique et sons de combat quand ils sont installés
  (blasons héraldiques et silence sinon).
- Outils : panneau développeur F1, test de performance F2, benchmark CPU, tests unitaires et navigateur.

## Démarrage

```bash
cd kingdom-under-fire
npm install
npm run assets     # facultatif : portraits et illustrations officiels (voir plus bas)
npm run dev        # http://localhost:5173
```

| Commande | Rôle |
| --- | --- |
| `npm test` | 65 tests Vitest (cœur, terrain, caméra, sélection, unités, mouvement, formations, combat, équilibre, IA, histoire, assets, script d'assets contre un faux wiki) |
| `npm run test:e2e` | 3 tests navigateur Playwright (briefing puis démarrage sans erreur ; sélection → front tracé → marche ; assets installés utilisés) |
| `npm run assets` | installe les portraits et illustrations officiels, votre musique et vos sons |
| `npm run bench` | coût CPU d'un tick de simulation de 100 à 1000 unités en mêlée |
| `npm run typecheck` | TypeScript strict (jeu, tests, configurations) |
| `npm run build` | vérification des types puis build statique dans `dist/` (chemins relatifs) |

URL `#perf=N` : déploie directement N soldats pour une mesure (par exemple `#perf=50` ou `#perf=1000`).

## Contrôles

| Action | Commande |
| --- | --- |
| Sélectionner | clic, rectangle ; Maj = ajouter, Ctrl = retirer, double-clic = même type visible |
| Déplacer / attaquer | clic droit (sur un ennemi : attaquer) |
| Tracer le front | clic droit glissé (largeur = nombre de files, sens = orientation) |
| Marche offensive | Ctrl + clic droit, ou T puis clic |
| Formation | F (Maj+F : précédente) ou boutons du panneau · H : tenir la position |
| Groupes | Ctrl + 1–9 pour créer, 1–9 pour rappeler, double appui pour centrer la caméra |
| Caméra | WASD (ZQSD en AZERTY) ou bords de l'écran · Q/E (A/E en AZERTY) ou clic molette : rotation · molette : zoom · PgUp/PgDn : inclinaison · C : caméra libre · Origine : recentrer |
| Divers | Entrée : commencer la bataille · P : pause · M : couper le son · F1 : panneau développeur · F2 : test de performance (100 → 200 → 300 → 500 → 1000 unités) |

## Assets officiels

Les assets officiels ne sont **pas versionnés** (`public/assets/` est dans `.gitignore`) : ils restent la
propriété de Blueside / Phantagram et de leurs auteurs. `npm run assets` les télécharge ou les copie sur votre
machine et écrit `public/assets/manifest.json`. Sans eux, le jeu reste complet, avec des blasons à la place
des portraits et sans son.

| Asset | Source | Commande |
| --- | --- | --- |
| Portraits de Curian, Russelaunt, Gernot, Moonlight, Lord Demetrich, Rick Blood, Likuku, Lauriana, Richter Rosenheim, Lily, Amaruak, Regnier | image principale de leur article du [Kingdom Under Fire Wiki](https://kingdomunderfire.fandom.com) (API MediaWiki) | `npm run assets` |
| Emblèmes de l'Alliance Humaine et de la Légion Noire | articles « Human Alliance » et « Dark Legion » du wiki | `npm run assets` |
| Illustration de fond, jaquette, captures d'écran | page Steam de *Kingdom Under Fire: A War of Heroes (GOLD Edition)* (app 2183600) | `npm run assets` |
| Musique | vos fichiers (par exemple la bande-son de votre copie du jeu) | `npm run assets -- --music=<fichier ou dossier>` |
| Sons de combat, de mort, de cor, de marche, d'ordres | vos fichiers `.wav`/`.ogg`/`.mp3`, classés d'après leur nom (`sword`, `hit`, `die`, `horn`, `march`, `yes`…) | `npm run assets -- --sounds=<dossier>` |

Options : `--no-wiki`, `--no-steam`, `--force` (tout retélécharger). La liste des articles et les règles de
classement des sons sont dans [`src/assets/sources.json`](src/assets/sources.json). Si les fichiers audio de votre
copie du jeu sont dans une archive propriétaire, il faut d'abord les extraire en `.wav` ou `.ogg`.

Le script est testé contre un faux serveur qui imite l'API MediaWiki et l'API Steam
(`tests/node/fetch-assets.test.ts`). Le conteneur de développement n'avait pas accès au wiki ni à Steam : le
téléchargement réel n'a donc pas pu y être vérifié.

## Performances mesurées

**CPU de la simulation** (`npm run bench`, Node 22, mêlée établie sur le vrai terrain, moyenne sur 20 s de
bataille) :

| Unités | Tick moyen | p95 | Mouvement | Combat | Moral |
| --- | --- | --- | --- | --- | --- |
| 100 | 0,20 ms | 0,32 ms | 0,04 ms | 0,02 ms | 0,02 ms |
| 200 | 0,36 ms | 0,74 ms | 0,07 ms | 0,03 ms | 0,05 ms |
| 300 | 0,53 ms | 0,82 ms | 0,13 ms | 0,06 ms | 0,07 ms |
| 500 | 1,03 ms | 1,50 ms | 0,30 ms | 0,09 ms | 0,15 ms |
| 1000 | 3,14 ms | 4,06 ms | 1,05 ms | 1,11 ms | 0,47 ms |

À 30 Hz, 1000 soldats en mêlée (500 d'Hironeiden contre 500 orcs) consomment environ 10 % du budget d'un tick. La simulation n'est pas le facteur
limitant et ne justifie pas encore de Web Workers. Le rendu de 1000 unités tient en **12 draw calls** (unités,
ombres, terrain, forêts, rochers, décors).

**GPU / FPS** : ils n'ont **pas** pu être mesurés de façon représentative ici. Le conteneur de développement
n'a pas de GPU et Chromium y rend en logiciel (SwiftShader, 1 à 4 FPS quel que soit le nombre d'unités).
Sur une vraie machine, lancer `npm run dev`, appuyer sur F1 puis F2 cinq fois : le panneau affiche FPS,
temps de frame, temps GPU (si le navigateur expose `EXT_disjoint_timer_query_webgl2`), draw calls et
triangles pour chaque palier. Le premier goulet attendu est le **nombre de sommets** : un soldat compte
350 à 420 triangles, dessinés deux fois avec la passe d'ombre, soit 0,85 à 1 million de triangles par frame à
1000 unités (mesuré par F2). C'est la raison d'être des LOD prévus au prochain jalon.

## Architecture

```
src/
  core/        Game (orchestration navigateur), GameLoop (pas fixe 30 Hz), World (état), Simulation,
               SimulationFactory (ordre des systèmes), commandes sérialisables, EventBus, Random, Time
  entities/    EntityManager (ids, liste dense), Components (structure de tableaux typés)
  data/        unités, factions, histoire (lore, personnages, bataille) validées par Zod
  assets/      AssetManager (manifeste des assets officiels), sources.json (wiki, Steam, sons)
  audio/       AudioManager (musique et sons installés)
  units/       UnitFactory, UnitManager, MovementSystem (steering), LifecycleSystem, UnitStats (schémas)
  formations/  Formation, FormationSolver (6 dispositions, affectation), FormationManager (système)
  navigation/  NavGrid, FlowField, Pathfinding (cache), SpatialHashGrid, SpatialSystem
  combat/      CombatSystem, DamageSystem, MoraleSystem
  ai/          AIKnowledge (vision), TacticalAI, AIController
  maps/        Terrain (heightmap, forêts, rochers), Noise
  renderer/    Renderer, SceneManager, Lighting, TerrainRenderer, UnitMeshes, UnitRenderer (instancing +
               animation GPU), OverlayRenderer (anneaux, barres de vie, aperçus), EffectsRenderer, picking
  camera/      RTSCamera
  input/       KeyboardInput, MouseInput, InputManager, OrderInput
  selection/   SelectionManager (logique pure), SelectionInput
  ui/          HUD, SelectionPanel, SelectionBox, BriefingScreen
scripts/fetch-assets.mjs  npm run assets
  debug/       PerformanceMonitor, DebugManager (F1), GpuTimer
  scenes/      BattleScene, BattleOutcome, PerformanceTestScene (F2)
```

Principes, dépendances justifiées et journal détaillé des phases : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Feuille de route

1. **Deuxième prototype** : 6 unités, archers et projectiles en pool, cavalerie avec charge en 7 étapes, flancs
   (face, côté, dos), héros et capacités, ressources (`canAfford`/`spend`/`refund`), premiers bâtiments.
2. **Bataille de masse** : carte 250 contre 250, LOD des soldats (maillages simplifiés au loin, imposteurs),
   mesures sur GPU réel, puis Web Workers si la mesure les justifie.
3. Brouillard de guerre (texture de visibilité) et minimap.
4. Économie, bâtiments, arbre technologique, IA stratégique et opérationnelle.
5. Héros de Kingdom Under Fire en contrôle direct (Curian, Russelaunt, Rick Blood, Likuku…, caméra à la
   troisième personne), magie, siège, campagnes de l'Alliance Humaine et de la Légion Noire (Haven, forêt
   d'Essex, Hall des Pierres, Autel de Destruction…), sauvegarde (IndexedDB), menus et escarmouche.
6. Autres peuples de Bersia : elfes d'Essex, nains, vampires de Vellond, elfes noirs, morts-vivants, ogres.

## Mentions légales

Projet de fan non commercial, sans lien avec Blueside, Phantagram ou Gathering of Developers. Kingdom Under Fire,
ses personnages et ses lieux sont la propriété de leurs détenteurs respectifs. L'histoire est résumée avec nos
propres mots. Le code, les modèles 3D procéduraux, le terrain, les effets et l'interface sont écrits pour ce
projet. Les assets officiels ne sont pas redistribués : `npm run assets` les installe uniquement sur votre machine.
