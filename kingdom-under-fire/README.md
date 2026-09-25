# Bannières de Cendre

RTS médiéval-fantastique en 3D dans le navigateur (**TypeScript strict + Three.js + Vite**) : grandes armées,
formations, combat de mêlée, moral, IA, puis héros, magie, bases, siège et campagne au fil des jalons.

Le dossier s'appelle `kingdom-under-fire/` à la demande initiale, mais le jeu est une **production originale**.
Il ne reprend ni personnages, ni factions, ni noms, ni assets d'une œuvre existante. Les factions (Royaume de
Valdrenne, Clans de Vhorsk…), les modèles, le terrain et les effets sont générés par le code du projet.

## État : premier prototype (jalon 1) ✅

Le premier jalon demandé est atteint : sélectionner 20 soldats, en faire une formation, leur donner un ordre,
attaquer 20 ennemis et observer le combat.

- Champ de bataille de 256 m généré (plaine centrale, collines, forêts, rochers, crête de montagnes), ombres,
  ciel, brouillard.
- Caméra RTS amortie : WASD/ZQSD, bords d'écran, zoom avec inclinaison automatique, rotation, inclinaison,
  limites, focus, caméra libre.
- 2 types d'unités (épéiste, lancier) × 2 factions, définis en données validées par Zod.
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
- Outils : panneau développeur F1, test de performance F2, benchmark CPU, tests unitaires et navigateur.

## Démarrage

```bash
cd kingdom-under-fire
npm install
npm run dev        # http://localhost:5173
```

| Commande | Rôle |
| --- | --- |
| `npm test` | 57 tests unitaires Vitest (cœur, terrain, caméra, sélection, unités, mouvement, formations, combat, IA) |
| `npm run test:e2e` | tests navigateur Playwright (démarrage sans erreur ; sélection → front tracé → marche) |
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
| Divers | P : pause · F1 : panneau développeur · F2 : test de performance (100 → 200 → 300 → 500 → 1000 unités) |

## Performances mesurées

**CPU de la simulation** (`npm run bench`, Node 22, mêlée établie sur le vrai terrain, moyenne sur 20 s de
bataille) :

| Unités | Tick moyen | p95 | Mouvement | Combat | Moral |
| --- | --- | --- | --- | --- | --- |
| 100 | 0,19 ms | 0,33 ms | 0,04 ms | 0,02 ms | 0,02 ms |
| 200 | 0,35 ms | 0,59 ms | 0,09 ms | 0,03 ms | 0,04 ms |
| 300 | 0,60 ms | 0,97 ms | 0,17 ms | 0,05 ms | 0,07 ms |
| 500 | 1,21 ms | 2,15 ms | 0,39 ms | 0,16 ms | 0,18 ms |
| 1000 | 2,96 ms | 3,59 ms | 1,01 ms | 0,54 ms | 0,47 ms |

À 30 Hz, 1000 soldats en mêlée consomment environ 9 % du budget d'un tick. La simulation n'est pas le facteur
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
  data/        unités et factions (données validées par Zod)
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
  ui/          HUD, SelectionPanel, SelectionBox
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
5. Héros en contrôle direct (caméra à la troisième personne), magie, siège, campagne, audio, sauvegarde (IndexedDB),
   menus et escarmouche.

## Mentions

Projet original. Le code, les modèles 3D procéduraux, le terrain, les effets et l'interface sont écrits pour
ce projet, sans asset tiers.
