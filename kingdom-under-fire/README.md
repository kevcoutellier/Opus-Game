# Kingdom Under Fire : La Guerre des Héros

Remake web, en 3D dans le navigateur, de **Kingdom Under Fire: A War of Heroes** (Phantagram, 2001), écrit en
**TypeScript strict + Three.js + Vite**. Le jeu reprend son univers : le continent de Bersia, la Seconde Guerre
des Héros, l'**Alliance Humaine** du roi Gernot contre la **Légion Noire** de Rick Blood, avec Curian, Likuku,
Richter Rosenheim, Moonlight et les autres. Il vise des batailles de masse : grandes armées, formations,
combat et moral, héros en contrôle direct, magie, bases, puis siège et campagne au fil des jalons.

Les portraits et illustrations officiels, ainsi que vos propres musiques et sons (par exemple ceux de votre copie
du jeu), s'installent avec `npm run assets` et ne sont jamais versionnés (voir [Assets officiels](#assets-officiels)).

## État : deuxième prototype (jalon 2) ✅

Le deuxième jalon ajoute six unités par faction, la cavalerie, les archers, les flancs, les héros et leurs
capacités, les ressources et les bâtiments. Deux batailles se choisissent sur l'écran de briefing :

- **Le camp de Likuku** (par défaut) : le donjon de Hironeiden au nord, la forteresse de Likuku au sud. On bâtit,
  on recrute, on défend son quartier général et on abat celui de l'ennemi, qui attaque par vagues.
- **Les plaines de Hironeiden** (`#field`) : bataille rangée, les deux armées au complet autour de leurs héros.

Ce que le jalon 2 apporte :

- **Six unités par faction**. Alliance Humaine : fantassin, lancier, archer, chevalier, templier et Curian.
  Légion Noire : guerrier orc, lancier orc, archer elfe noir, cavalier elfe noir, ogre et Likuku. Les
  montures ont leur propre squelette (galop, cavalier assis) ; l'arc a son animation (bander, viser, lâcher).
- **Archers et projectiles en pool** (2048, sans allocation en bataille) : tir en cloche avec anticipation de la
  cible et dispersion selon la précision. Le coup se résout à l'atterrissage, donc un bloc serré prend les
  flèches destinées à ses voisins. Pas de tir ami. Les flèches perdues restent plantées dans le sol.
- **Flancs** : un coup de côté fait ×1,25 dégâts et ×1,6 choc moral, dans le dos ×1,5 et ×2,5. Les boucliers
  n'arrêtent que les flèches de face. L'encerclement érode le moral.
- **Charge de cavalerie** en sept états (prêt, préparation, accélération, charge, impact, dégagement,
  récupération) : dégâts selon l'élan, piétinement, recul, fantassins renversés, terreur alentour. Les lanciers
  qui l'attendent de face se raidissent : le cavalier est empalé et stoppé net. Ogres et Likuku frappent en
  balayage (plusieurs ennemis par coup).
- **Héros** : mana, quatre capacités chacun (Déplacement, Gel, Salve d'énergie, Serment de la garde ; Séisme,
  Rage sanguinaire, Cri de guerre, Rocher), expérience et niveaux, aura de moral. La chute d'un héros ébranle
  son armée. L'IA lance les sorts du sien là où ils touchent le plus de monde.
- **Contrôle direct** (Tab) : caméra à la troisième personne avec transition fluide, WASD relatif à la caméra,
  souris pour regarder, coups libres en arc (clic) ou puissants (clic droit), esquive (Espace), capacités 1–4
  au viseur. Tout passe par des commandes sérialisables, comme les ordres aux troupes.
- **Ressources** (or, bois, vivres, pierre, mana) avec `canAfford` / `spend` / `refund`, et **bâtiments** en
  entités : placement validé (territoire, terrain, pente, place libre, prérequis, coût), construction, revenus,
  files de production avec point de ralliement, destruction. Leur emprise bloque la navigation, et les flow
  fields en cache sont alors invalidés. Soldats, archers et sorts attaquent les murs.
- **IA stratégique** : ordre de construction autour de sa base, recrutement vers une composition interarmes,
  vagues d'attaque de plus en plus nombreuses, garnison qui défend la base.

### Socle (jalon 1)

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
| `npm test` | 102 tests Vitest : cœur, terrain, caméra, sélection, unités, mouvement, formations, combat, équilibre, archers, flancs, charges, héros, bâtiments, IA tactique et stratégique, histoire, assets, script d'assets contre un faux wiki |
| `npm run test:e2e` | 6 tests navigateur Playwright : démarrage des deux batailles sans erreur ; sélection → front tracé → marche ; visée d'une capacité et contrôle direct ; ferme posée et fantassin recruté ; assets installés utilisés |
| `npm run assets` | installe les portraits et illustrations officiels, votre musique et vos sons |
| `npm run bench` | coût CPU d'un tick de simulation de 100 à 1000 unités, armées interarmes |
| `npm run typecheck` | TypeScript strict (jeu, tests, configurations) |
| `npm run build` | vérification des types puis build statique dans `dist/` (chemins relatifs) |

URL : `#field` pour la bataille rangée ; `#perf=N` pour déployer directement N soldats et mesurer (par exemple
`#perf=50` ou `#perf=1000`) ; `#showcase` pour voir les douze modèles côte à côte.

## Contrôles

| Action | Commande |
| --- | --- |
| Sélectionner | clic, rectangle ; Maj = ajouter, Ctrl = retirer, double-clic = même type visible |
| Déplacer / attaquer | clic droit (sur un ennemi : attaquer) |
| Tracer le front | clic droit glissé (largeur = nombre de files, sens = orientation) |
| Marche offensive | Ctrl + clic droit, ou T puis clic |
| Formation | F (Maj+F : précédente) ou boutons du panneau · H : tenir la position |
| Groupes | Ctrl + 1–9 pour créer, 1–9 pour rappeler, double appui pour centrer la caméra |
| Caméra | WASD (ZQSD en AZERTY) ou bords de l'écran · Q/E (A/E en AZERTY) ou clic molette : rotation · molette : zoom · PgUp/PgDn : inclinaison · L : caméra libre · Origine : recentrer |
| Héros | Z X C V (W X C V en AZERTY) ou barre du héros : capacités ; une capacité visée montre sa zone, clic pour lancer, clic droit ou Échap pour annuler |
| Contrôle direct | Tab : prendre ou rendre la main · WASD : marcher · souris : regarder (cliquer pour la capturer) · clic : frapper · clic droit : coup puissant · Espace : esquive · 1–4 : capacités au viseur |
| Base | menu « Bâtir » : poser un bâtiment près des vôtres (R : tourner, Maj : en poser plusieurs, clic droit : annuler) · clic sur un bâtiment : recruter, annuler une recrue (remboursée) · clic droit au sol : point de ralliement |
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
| Sons de tir, de combat, de mort, de cor, de marche, d'ordres | vos fichiers `.wav`/`.ogg`/`.mp3`, classés d'après leur nom (`bow`, `arrow`, `sword`, `hit`, `die`, `horn`, `march`, `yes`…) | `npm run assets -- --sounds=<dossier>` |

Options : `--no-wiki`, `--no-steam`, `--force` (tout retélécharger). La liste des articles et les règles de
classement des sons sont dans [`src/assets/sources.json`](src/assets/sources.json). Si les fichiers audio de votre
copie du jeu sont dans une archive propriétaire, il faut d'abord les extraire en `.wav` ou `.ogg`.

Le script est testé contre un faux serveur qui imite l'API MediaWiki et l'API Steam
(`tests/node/fetch-assets.test.ts`). Le conteneur de développement n'avait pas accès au wiki ni à Steam : le
téléchargement réel n'a donc pas pu y être vérifié.

## Performances mesurées

**CPU de la simulation** (`npm run bench`, Node 22, deux armées interarmes sur le vrai terrain : infanterie,
lanciers, archers, cavalerie sur les ailes ; moyenne sur 20 s de bataille établie) :

| Unités | Tick moyen | p95 | Combat | Mouvement | Moral | Projectiles | Charges | Héros |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | 0,20 ms | 0,33 ms | 0,04 ms | 0,03 ms | 0,02 ms | < 0,01 ms | < 0,01 ms | < 0,01 ms |
| 200 | 0,34 ms | 0,74 ms | 0,06 ms | 0,07 ms | 0,04 ms | < 0,01 ms | 0,01 ms | 0,01 ms |
| 300 | 0,57 ms | 0,82 ms | 0,14 ms | 0,16 ms | 0,06 ms | < 0,01 ms | 0,01 ms | 0,01 ms |
| 500 | 1,30 ms | 2,47 ms | 0,26 ms | 0,34 ms | 0,16 ms | < 0,01 ms | 0,01 ms | 0,01 ms |
| 1000 | 3,02 ms | 3,70 ms | 0,90 ms | 0,85 ms | 0,40 ms | 0,01 ms | 0,03 ms | 0,02 ms |

À 30 Hz, 1000 soldats (dont 200 archers qui tirent environ 80 flèches par seconde, avec jusqu'à 140 flèches en
vol) consomment environ 9 % du budget d'un tick. La simulation n'est pas le facteur limitant et ne justifie pas
encore de Web Workers. Une partie complète IA contre IA avec bases (15 minutes, plus de 70 recrues par camp)
se simule en quelques secondes. Le rendu des unités reste instancié : un draw call par modèle, ombres
comprises ; flèches, orbes et rochers en ajoutent trois au plus.

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
  combat/      CombatSystem (mêlée, tir, balayage), DamageSystem (flancs, boucliers), MoraleSystem,
               Projectiles (pool + système), ChargeSystem (7 états)
  heroes/      Ability (schéma des capacités), HeroSystem (mana, sorts, niveaux, statuts, contrôle direct)
  economy/     Resources (ResourceManager : canAfford / spend / refund)
  buildings/   Building (schéma), BuildingSystem (placement, construction, revenus, production)
  ai/          AIKnowledge (vision), TacticalAI, HeroAI (choix des sorts), StrategicAI (économie, vagues),
               AIController
  maps/        Terrain (heightmap, forêts, rochers, clairières des bases), Noise
  renderer/    Renderer, SceneManager, Lighting, TerrainRenderer, UnitMeshes, UnitRenderer (instancing +
               animation GPU), BuildingMeshes, BuildingRenderer, ProjectileRenderer, OverlayRenderer
               (anneaux, barres de vie, aperçus, visée), EffectsRenderer, picking
  camera/      RTSCamera, HeroCamera (troisième personne)
  input/       KeyboardInput, MouseInput, InputManager, OrderInput, HeroInput, BuildingInput
  selection/   SelectionManager (logique pure), SelectionInput
  ui/          HUD, SelectionPanel, SelectionBox, BriefingScreen, HeroBar, ResourceBar, BuildMenu,
               ProductionPanel
scripts/fetch-assets.mjs  npm run assets
  debug/       PerformanceMonitor, DebugManager (F1), GpuTimer
  scenes/      BattleScene (bataille rangée, bataille avec bases), BattleOutcome, PerformanceTestScene (F2),
               ShowcaseScene
```

Principes, dépendances justifiées et journal détaillé des phases : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Feuille de route

1. **Bataille de masse** : carte 250 contre 250, LOD des soldats (maillages simplifiés au loin, imposteurs),
   mesures sur GPU réel, puis Web Workers si la mesure les justifie.
2. Brouillard de guerre (texture de visibilité) et minimap.
3. Arbre technologique, équipement des héros, ouvriers et gisements, IA opérationnelle (flancs, contre-unités,
   retraite).
4. Autres héros de Kingdom Under Fire (Russelaunt, Rick Blood, Lauriana…), siège, campagnes de l'Alliance
   Humaine et de la Légion Noire (Haven, forêt d'Essex, Hall des Pierres, Autel de Destruction…), sauvegarde
   (IndexedDB), menus et escarmouche.
5. Autres peuples de Bersia : elfes d'Essex, nains, vampires de Vellond, morts-vivants.

## Mentions légales

Projet de fan non commercial, sans lien avec Blueside, Phantagram ou Gathering of Developers. Kingdom Under Fire,
ses personnages et ses lieux sont la propriété de leurs détenteurs respectifs. L'histoire est résumée avec nos
propres mots. Le code, les modèles 3D procéduraux, le terrain, les effets et l'interface sont écrits pour ce
projet. Les assets officiels ne sont pas redistribués : `npm run assets` les installe uniquement sur votre machine.
