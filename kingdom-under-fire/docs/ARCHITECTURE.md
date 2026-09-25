# Architecture — Kingdom Under Fire : La Guerre des Héros

Remake web de Kingdom Under Fire: A War of Heroes, TypeScript strict + Three.js + Vite. Ce document décrit
l'architecture réellement en place et le journal des phases.

## Principes

1. **Simulation et rendu séparés.** `src/core/World.ts` contient tout l'état de jeu et aucun objet Three.js.
   La simulation tourne à l'identique dans le navigateur, dans Node (tests, benchmarks) et, plus tard, dans
   un worker ou sur un serveur.
2. **ECS-like en structure de tableaux.** Une entité est un entier. Chaque champ de composant est un tableau
   typé indexé par l'entité (`src/entities/Components.ts`) ; `EntityManager.mask` indique quels composants
   une entité possède. Les systèmes (`System.update(world, dt)`) parcourent une liste dense d'entités
   vivantes ; aucune unité ne porte sa propre logique.
3. **Pas fixe.** `GameLoop` exécute la simulation à 30 Hz quel que soit le FPS ; le rendu
   (`requestAnimationFrame`) interpole entre les deux derniers états (`prevX/prevZ/prevRot`).
4. **Commandes sérialisables.** Joueur et IA n'écrivent jamais dans l'état : ils poussent des commandes
   (`core/GameCommands.ts`) appliquées au début d'un tick. Avec le RNG déterministe (`core/Random.ts`), une
   partie se rejoue à l'identique : c'est la base d'un futur multijoueur lockstep ou de replays.
5. **Données validées.** Unités et factions sont des définitions de données (`src/data/`) validées par Zod
   au chargement (`units/UnitStats.ts`, `factions/Faction.ts`).
6. **Mesurer avant d'optimiser.** `debug/PerformanceMonitor.ts` chronomètre chaque système.

## Dépendances

| Paquet | Pourquoi |
| --- | --- |
| `three` | rendu WebGL (instancing, ombres, shaders) |
| `zod` | validation des données d'unités, de factions et d'histoire |
| `typescript`, `vite` | typage strict, serveur de dev, build |
| `vitest` | tests unitaires et benchmarks de la simulation |
| `@playwright/test` (1.56, aligné sur le Chromium préinstallé) | tests navigateur |
| `@types/three`, `@types/node` | types |

Non ajoutés pour l'instant : `pathfinding` (A* seul, alors que le mouvement de masse repose sur des flow
fields maison), `howler` (l'audio arrive en phase 14), `stats.js` et `lil-gui` (le panneau F1 maison
suffit).

## Journal des phases

| Phase | Contenu | État |
| --- | --- | --- |
| 1. Architecture | boucle à pas fixe, ECS, bus d'événements, commandes, RNG, données Zod, tests | ✅ |
| 2. Rendu | renderer WebGL (ACES, ombres PCF, budget de pixels 4K), ciel dégradé, brouillard, terrain heightmap 256 m à couleurs de sommets + grain tuilé, forêts et rochers en `InstancedMesh` (3 draw calls) | ✅ |
| 3. Caméra | `RTSCamera` : WASD/flèches (touches physiques, donc ZQSD en AZERTY), bords d'écran, molette, rotation Q/E ou clic molette, inclinaison PgUp/PgDn, inclinaison automatique selon le zoom, limites de carte, sol jamais traversé, `focus()`, caméra libre (C), mouvements amortis | ✅ |
| 4. Sélection | `SelectionManager` en logique pure (clic, rectangle, Maj = ajouter, Ctrl = retirer, double-clic = même type visible, filtres, groupes Ctrl+1–9, double appui = focus caméra), rectangle en calque HTML, projection écran | ✅ |
| 5. Unités | `UnitFactory` (entités depuis les données), `UnitManager` (requêtes), modèles low-poly procéduraux, `UnitRenderer` : un `InstancedMesh` par modèle, animation GPU par os (jambes, bras, poignet, bouclier, chute, enfoncement du cadavre) y compris dans la passe d'ombre, culling par unité sur CPU ; anneaux de sélection instanciés, panneau de sélection | ✅ |
| 6. Mouvement | `NavGrid` (falaises, rochers et bords bloquants ; forêt et pente ralentissent), `FlowField` (Dijkstra 8 voisins sans couper les coins, partagé par destination, cache LRU de 32), `SpatialHashGrid` (grille uniforme reconstruite en O(n) par tri comptage), `MovementSystem` (attraction vers le slot ou flow field hors ligne de vue, séparation pondérée par la masse, alignement, cohésion, sondes d'obstacles, glissement le long des murs, inertie, rotation limitée), picking du sol par ray-marching du heightmap, marqueurs d'ordre | ✅ |
| 7. Formations | `FormationSolver` : 6 types (LINE, COLUMN, SQUARE aux rangs extérieurs tournés vers l'extérieur, WEDGE pointe en avant, CIRCLE tourné vers l'extérieur, SCATTERED), affectation sans croisement (balayage rang par rang, mêlée devant) ; `FormationManager` : un flow field et une résolution de slots par ordre, ancre qui avance au pas des plus lents et attend les retardataires, rangs qui se referment 1,5 s après les premières pertes ; clic droit glissé = largeur + orientation du front avec aperçu fantôme, F / boutons = type, H = tenir | ✅ |
| 8. Combat | `CombatSystem` (acquisition par grille spatiale, attaquants répartis le long de la ligne, cycle armement → impact → récupération, tenue de position), `DamageSystem` (attaque = attacker/target/damage/damageType/timestamp/position/ability/criticalChance ; 8 types de dégâts × 5 armures, défense à rendement décroissant, critiques, recul), impacts simultanés en fin de tick, mort (chute, cadavre 22 s puis entité libérée), `MoraleSystem` (NORMAL/SHAKEN/PANICKED/ROUTING/RECOVERING avec hystérésis ; rapport de force local, blessures, morts voisines, victoires, pertes de la formation, contagion de la déroute, discipline ; fuite puis ralliement), formations qui s'arrêtent pour combattre et poursuivent une cible, barres de vie en billboards instanciés, particules en pool, bannière victoire/défaite | ✅ |
| 9. IA | `AIKnowledge` (grille de visibilité grossière rastérisée depuis la vue de ses soldats, dernière position connue, oubli après 45 s ou quand l'endroit est revu vide : l'IA ne lit jamais les positions ennemies), `TacticalAI` (engager le groupe ennemi connu le plus proche, sinon reconnaissance vers la zone de déploiement adverse, sinon tenir), `AIController` (réflexion 1×/s, mêmes commandes que le joueur). Couches stratégique et opérationnelle prévues au-dessus | ✅ |
| Mesure | `DebugManager` (F1 : FPS, frame, GPU via `EXT_disjoint_timer_query_webgl2`, draw calls, triangles, entités, unités visibles, animations, temps par système, pathfinding, IA, formations, mémoire), `PerformanceTestScene` (F2 : 100 → 1000 unités, moyenne sur 8 s après 2 s de chauffe), benchmark CPU `npm run bench`, tests Playwright du parcours joueur | ✅ |
| Univers KUF | factions Alliance Humaine / Légion Noire, 4 unités (orcs modélisés à part, échelle par type), équilibre réglé par balayage de paramètres (17/40), lore et 12 personnages validés par Zod, bataille « Les plaines de Hironeiden » avec écran de briefing | ✅ |
| Assets officiels | `scripts/fetch-assets.mjs` (Kingdom Under Fire Wiki via API MediaWiki, page Steam, musique et sons de l'utilisateur classés par nom ; `public/assets/` jamais versionné), `AssetManager` (manifeste, repli à null), `AudioManager` (playlist, sons de combat atténués par la distance), testés contre un faux serveur | ✅ |

### Équité de la simulation

Une première version donnait l'avantage à l'armée traitée en second (≈ 90 % de victoires en bataille miroir) :
les positions étaient mises à jour en place, et les unités traitées plus tard « voyaient » déjà les nouvelles
positions, ce qui les faisait pousser davantage. Deux corrections ont été apportées. Le mouvement se fait
désormais en deux temps : calcul depuis l'état du début du tick, puis application. Les coups d'un même tick
sont collectés puis appliqués ensemble. Résultat mesuré : 32 victoires sur 64 batailles miroir, sur 16 graines,
avec ordre de création et côté de la carte inversés. Un test de non-régression le vérifie
(`tests/unit/combat.test.ts`).

## Mesures et goulets

- **Simulation** (`npm run bench`) : 1000 unités en mêlée (humains contre orcs) = 3,1 ms/tick en moyenne
  (p95 4,1 ms), dont mouvement 1,05 ms, combat 1,1 ms et moral 0,5 ms. Le coût croît un peu plus vite que linéairement (densité
  des voisins dans une mêlée compacte), mais reste à ~10 % du budget à 30 Hz. **Les Web Workers ne sont pas
  justifiés à ce stade** : ils le deviendront avec le pathfinding de nombreuses formations et l'IA
  stratégique. Les flow fields coûtent ~1–3 ms chacun, calculés une fois par ordre et mis en cache.
- **Rendu** : 12 draw calls pour toute la scène, quel que soit le nombre de soldats. Un soldat compte 350 à
  420 triangles, dessinés deux fois avec la passe d'ombre : à 1000 unités, F2 mesure 0,85 à 1 million de
  triangles par frame.
  **Prochain goulet attendu : le débit de sommets**, d'où les LOD (maillage simplifié au-delà de ~60 m,
  imposteurs au-delà de ~150 m, ombres coupées au loin).
- **GPU** : non mesurable dans le conteneur de développement (pas de GPU, rendu logiciel SwiftShader). À
  mesurer sur machine réelle avec F1/F2 avant d'optimiser le rendu.

## Architecture cible (non encore implémentée)

- Couches d'IA : `StrategicAI` (économie, production, expansion) → `OperationalAI` (attaque, défense,
  renforts) → `TacticalAI` (existante : engagement ; à venir : flancs, contre-unités, retraite) → UnitAI
  (acquisition de cibles, dans `CombatSystem`).
- Workers (`pathfinding.worker.ts`, `ai.worker.ts`, `formation.worker.ts`) avec objets transférables, dès
  qu'une mesure le justifie. La simulation n'accède à aucune API du DOM, elle peut donc déjà y être déplacée.
- Multijoueur : lockstep sur la file de commandes existante. Il faudra remplacer `Math.sin/cos/atan2` dans
  la simulation par des versions déterministes entre navigateurs.
