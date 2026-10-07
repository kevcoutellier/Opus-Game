# Architecture — Kingdom Under Fire : The Crusaders (clone web)

Clone web de Kingdom Under Fire: The Crusaders, TypeScript strict + Three.js + Vite. Ce document décrit
l'architecture réellement en place et le journal des phases. Les deux premiers prototypes visaient A War of
Heroes ; leur moteur (simulation, formations, combat, héros) sert de socle au clone, leur sélection d'unités
et leur construction de base ont été retirées.

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
fields maison), `howler` (l'`AudioManager` maison sur Web Audio suffit), `stats.js` et `lil-gui` (le panneau
F1 maison suffit).

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
| P2.1 Unités | 6 unités par faction (archers, cavalerie, templiers, ogres, héros) ; schéma enrichi (`scale`, `cleave`, `shield`, `brace`, `ranged`, `charge`, `hero`) ; squelette de monture (5 os de plus, cavaliers marqués par sommet), animation d'arc, galop, chute montée ; scène `#showcase` | ✅ |
| P2.2 Projectiles | `ProjectilePool` (structure de tableaux, liste libre, 2048) sur le `World`, `ProjectileSystem` (parabole, résolution à l'atterrissage, impacts simultanés), tir avec anticipation et dispersion, `SpatialHashGrid.nearest` (recherche par anneaux pour la portée de 45 m), `ProjectileRenderer` (flèches orientées, flèches plantées, orbes, rochers) | ✅ |
| P2.3 Flancs et moral | `flankOf` (face ±60°, côté, dos) : dégâts ×1 / ×1,25 / ×1,5, choc moral ×1 / ×1,6 / ×2,5 ; boucliers contre les flèches de face ; encerclement ; aura des héros ; chute d'un héros | ✅ |
| P2.4 Charge | `ChargeSystem` : READY → PREPARE → ACCELERATE → CHARGE → IMPACT → DISENGAGE → RECOVER, `speedBoost` lu par le mouvement, élan, piétinement, renversement, terreur ; lances en arrêt (`brace`) ; balayage des ogres | ✅ |
| P2.5 Héros | `HeroSystem` (mana, temps d'incantation, recharges, interruption, buffs, gel et étourdissement, expérience et niveaux), 8 capacités en données Zod (dégâts de zone, ruée, projectiles magiques, buffs, moral), `HeroAI`, barre du héros, visée au sol | ✅ |
| P2.6 Contrôle direct | commandes `heroControl` / `heroSteer` / `heroStrike` / `heroDodge`, ordre `Direct` (ni slot ni combat automatique), coups libres en arc, esquive invulnérable, `HeroCamera` (troisième personne, transitions), `HeroInput` (pointer lock, 1–4 au viseur) | ✅ |
| P2.7 Ressources | `ResourceManager` (or, bois, vivres, pierre, mana ; `canAfford` / `spend` / `refund`, revenus), barre de ressources | ✅ |
| P2.8 Bâtiments | 7 bâtiments par faction en données Zod, `BuildingSystem` (règles de placement, construction, revenus, files de production, ralliement, destruction), emprise bloquant la `NavGrid` et invalidant les flow fields, cibles pour la mêlée, les flèches et les sorts (`Footprint`), modèles procéduraux humains et orcs, menu « Bâtir », panneau de production | ✅ |
| P2.9 Scénario et IA | `StrategicAI` (ordre de construction, recrutement interarmes, vagues), IA en deux groupes (vague et garnison), bataille avec bases (clairières aplanies, victoire à la chute du QG), choix de la bataille au briefing ; caméra qui s'élève au-dessus des crêtes | ✅ puis retiré |
| C1 Référence | `docs/CRUSADERS.md` : ce que l'on sait de The Crusaders, avec un niveau de confiance par point | ✅ |
| C2 Cœur de la bataille | Retrait de la base et de l'économie (P2.7–P2.9) et de la sélection d'unités (P4) ; `TroopSystem` (troupes autour d'un chef, ordres `troopMove` / `troopAttack` / `troopHold` / `troopFormation` / `troopsMoveAll`, points de passage, déroute à la mort du chef, escorte du héros dirigé), `TroopAI`, `BattleOutcome` par troupes (chute du héros), modes action et tactique par le zoom, `TroopInput`, `TroopPanel`, `Minimap`, barre rouge du chef | ✅ |
| C3 Combat du héros | `Moves` (15 coups en données Zod : combos faible et fort, estoc, coup puissant, spécial, Smash, contre, repousser), machine à états des coups dans `HeroSystem` (commande `heroButton`, mémoire du bouton suivant, fente, impact, enchaînement), B contextuel (contre, repousser, esquive), SP gagnés par coups et victimes, officiers (`Officer`, `officerAssist`, effet `heal`), accords X + A et B + Y dans `HeroInput`, styles d'animation des coups (estoc, tourbillon), jauge de SP, officiers et compteur de coups | ✅ |

### Équité de la simulation

Une première version donnait l'avantage à l'armée traitée en second (≈ 90 % de victoires en bataille miroir) :
les positions étaient mises à jour en place, et les unités traitées plus tard « voyaient » déjà les nouvelles
positions, ce qui les faisait pousser davantage. Deux corrections ont été apportées. Le mouvement se fait
désormais en deux temps : calcul depuis l'état du début du tick, puis application. Les coups d'un même tick
sont collectés puis appliqués ensemble. Résultat mesuré : 32 victoires sur 64 batailles miroir, sur 16 graines,
avec ordre de création et côté de la carte inversés. Un test de non-régression le vérifie
(`tests/unit/combat.test.ts`).

### Choix du deuxième prototype

- **Projectiles hors ECS.** Les flèches vivent dans un pool à part (`ProjectilePool`), pas dans l'`EntityManager` :
  elles n'ont ni moral ni formation, naissent et meurent par centaines, et le renderer les lit directement. Un
  coup se résout à l'atterrissage contre le corps le plus proche du point d'impact : la précision et la
  densité de la cible décident ensemble du taux de touche (≈ 85 % contre un bloc serré, moins contre des
  tirailleurs).
- **Invalidation des chemins.** La `NavGrid` porte un numéro de version, incrémenté quand un obstacle bloque ou
  libère des cellules ; `Pathfinding` vide son cache quand la version change. Les flow fields sont recalculés
  à la demande, un par destination.
- **Le héros est une unité.** Curian et Likuku sont des entités ordinaires avec quelques composants en plus
  (aura, mana dans `HeroSystem`). En contrôle direct, leur ordre devient `Direct` : la formation, le combat
  automatique et la charge les ignorent, et le joueur les dirige par des commandes. Un replay rejoue aussi le
  contrôle direct.

### Choix du clone (The Crusaders)

- **Les coups du héros sont des données.** `src/heroes/Moves.ts` décrit chaque coup (durée, instant de
  l'impact, moment où il peut s'enchaîner, dégâts, portée, arc, cibles, recul, étourdissement, fente, coût en
  SP, invulnérabilité) et ses suites par bouton. `HeroSystem` déroule le coup en cours tick par tick : le
  joueur envoie des boutons (`heroButton`), jamais des coups, ce qui garde les combos déterministes et
  rejouables. Un bouton pressé pendant un coup est gardé jusqu'à sa fenêtre d'enchaînement ; le schéma
  refuse un coup qui pourrait s'enchaîner avant de frapper.
- **B est résolu par la simulation.** Le même bouton contre, repousse ou esquive selon l'état du combat :
  un ennemi dont le coup visant le héros tombe dans les 0,45 s, un coup reçu il y a moins de 0,6 s, ou rien.
  La décision ne dépend que de l'état du monde au tick où la commande s'applique.
- **Les accords se lisent dans l'entrée.** `HeroInput` retient un bouton 70 ms : si son partenaire (X / A,
  B / Y) arrive entre-temps, ou s'il est déjà tenu, c'est l'assistance d'un officier ; sinon le bouton part
  seul. La simulation ne voit que des commandes `heroButton` et `officerAssist`.
- **Les SP viennent des événements.** `HeroSystem` écoute `unitHit` : un coup porté par un héros (hors sort)
  et chaque victime lui rapportent des SP, ses coups automatiques en mode tactique compris.

- **La troupe est une couche au-dessus des formations.** `TroopSystem` ne déplace aucun soldat : il traduit
  les ordres de troupe en ordres de formation (`FormationManager.orderMove`, `orderAttack`, `orderHold`) et
  garde ce que la formation ignore : le chef, les points de passage, l'état (en position, en marche, au combat,
  en déroute, anéantie). Chaque soldat porte l'id de sa troupe (`c.troop`) et le chef un drapeau (`c.leader`),
  pour que le rendu, la minicarte et l'IA les retrouvent sans parcourir les troupes.
- **La mort du chef est une règle reconstruite.** Aucune source ne dit ce qu'elle fait exactement dans
  l'original. Ici, la troupe se débande : moral et discipline à zéro, plus de ralliement, et les fuyards
  quittent le champ de bataille dès qu'aucun ennemi n'est à moins de 16 m depuis 6 s. La règle est isolée
  dans `TroopSystem.rout` / `flee` pour être corrigée quand une source le permettra.
- **Le héros reste une unité de sa troupe.** Quand le joueur le dirige (ordre `Direct`), il sort de la
  formation et la troupe suit un point 3,5 m derrière lui ; quand il rend la main, la troupe se reforme
  autour de lui (`heroControl` émis par `HeroSystem`).
- **Une seule caméra, deux poses.** `RTSCamera` (tactique) et `HeroCamera` (action) pilotent la même
  `PerspectiveCamera` ; le passage de l'une à l'autre est un fondu de 0,7 s de la position et de
  l'orientation. Zoomer au-delà de la distance minimale sur la troupe du héros, ou dézoomer au-delà de la
  distance maximale de la vue du héros, déclenche le passage.
- **IA par troupes.** `TroopAI` donne à chaque troupe son ordre (attaquer la troupe de l'ennemi connu le plus
  proche, sinon tenir ou marcher sur un objectif après un délai) avec les commandes du joueur. Elle ne lit
  que ce que voient ses soldats (`AIKnowledge`) ; la minicarte du joueur utilise la même connaissance, si bien
  qu'il ne voit que les ennemis que voient ses soldats.

## Mesures et goulets

- **Simulation** (`npm run bench`, armées interarmes) : 1000 unités = 3,0 ms/tick en moyenne (p95 3,7 ms),
  dont combat 0,9 ms, mouvement 0,85 ms et moral 0,4 ms. Projectiles (≈ 80 tirs/s), charges et héros coûtent
  moins de 0,05 ms ensemble. Le coût croît un peu plus vite que linéairement (densité des voisins dans une
  mêlée compacte), mais reste à ~9 % du budget à 30 Hz. **Les Web Workers ne sont pas
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

- IA de mission au-dessus de `TroopAI` : scripts des missions, attaques de flanc, contre-unités (lanciers
  contre cavalerie, cavalerie contre archers), retraite et renforts.
- Workers (`pathfinding.worker.ts`, `ai.worker.ts`, `formation.worker.ts`) avec objets transférables, dès
  qu'une mesure le justifie. La simulation n'accède à aucune API du DOM, elle peut donc déjà y être déplacée.
- Multijoueur : lockstep sur la file de commandes existante. Il faudra remplacer `Math.sin/cos/atan2` dans
  la simulation par des versions déterministes entre navigateurs.
