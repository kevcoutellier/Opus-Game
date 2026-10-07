# Kingdom Under Fire : The Crusaders — clone web

Clone en 3D dans le navigateur de **Kingdom Under Fire: The Crusaders** (Phantagram / Blueside, Xbox 2004,
réédité sur PC en 2020), écrit en **TypeScript strict + Three.js + Vite**. Le but est de refaire le jeu
original : mêmes règles, mêmes troupes, mêmes missions, puis la même interface. Le gameplay passe d'abord.
Les modèles, textures et interfaces sont recréés pour ce projet ; aucun fichier du jeu n'est repris.

Ce que l'on sait de l'original (avec un niveau de confiance pour chaque point) est rassemblé dans
[`docs/CRUSADERS.md`](docs/CRUSADERS.md). Les portraits et illustrations officiels, ainsi que vos propres musiques
et sons, s'installent avec `npm run assets` et ne sont jamais versionnés (voir [Assets officiels](#assets-officiels)).

## État : étape 4 sur 5, les deux premières missions de Gerald ✅

L'étape 4 ouvre la campagne de Gerald avec ses deux premières missions, rejouées d'après les guides
(enchaînements confirmés, carte et répliques reconstituées ; voir `docs/CRUSADERS.md`). Le jeu démarre sur
Greyhampton ; le briefing liste les missions et l'escarmouche, et « Mission suivante » enchaîne après une victoire.

- **Greyhampton** : la patrouille de Gerald (sa garde, Rupert, Ellen et des archers) rejoint deux points verts ;
  le ballon des nains passe au-dessus d'elle. Au second point, une scène coupée montre le village en flammes,
  puis surgissent les elfes noirs de Rithrin : brève escarmouche, Rithrin s'enfuit, Gerald rentre faire
  son rapport.
- **Ravenmeadow** : la première grande bataille. Les sapeurs, seuls au pied du mur, tombent avant que Gerald
  arrive (comme dans l'original, quoi qu'on fasse). Il faut ensuite briser l'infanterie et les archers de
  Rithrin en rangs serrés (les bois atténuent les flèches), secourir à l'est des archers alliés qui rejoignent alors
  Gerald, tenir la cavalerie avec les lanciers, puis briser les défenseurs de la porte.
- **Missions en données** : troupes (du joueur, alliées ou ennemies, en réserve), objectifs et script
  « quand → faire » validés par Zod, joués par un système de la simulation (`MissionDirector`) : lieux
  atteints, troupes brisées ou repérées, délais ; répliques, objectifs, renforts, ralliements, feu, scènes
  coupées, victoire ou défaite.
- **Alliés** : troupes du camp du joueur menées par l'IA jusqu'à ce qu'elles le rejoignent.
- **Décor** : maisons, huttes, murs, tours, tentes et palissades que les troupes contournent et que le feu
  dévore ; ballon dirigeable des nains.
- **Interface** : répliques avec portrait (clic ou Entrée pour passer), objectifs en haut à droite (◆ en cours,
  ✓ remplis, ✗ ratés), points verts sur le terrain et la minicarte, alliés en turquoise, scènes coupées en
  bandes noires. Le jeu passe seul en mode action quand la troupe du héros, choisie, engage le combat.

### Étape 3 : les troupes et leurs contres

L'étape 3 remplace les armées provisoires par celles de *The Crusaders*, d'après le guide officiel du jeu
(rôles, points de vie, vitesses, visions et compétences ; voir `docs/CRUSADERS.md`) :

- **Hironeiden (Gerald)** : infanterie, infanterie lourde, chevaliers à pied (épée à deux mains), lanciers,
  archers, archers longs, cavalerie, cavalerie lourde, sapeurs, mortiers, paladins, cavaliers de l'orage.
- **Vellond (Lucretia)** : infanterie, archers, cavalerie et archers montés elfes noirs.
- **Héros et officiers** : Gerald (épée, ni sorts ni magie : les héros n'ont que la mêlée et l'éclairage) avec
  Rupert (marteau) et Ellen (arc) ; Lucretia (deux cimeterres, Arbre de soin, Boost élémentaire) avec Morene et
  Cirith. Leurs jauges de SP montent à 1000 (la magie coûte 750 SP).
- **SP des troupes et compétences** : chaque troupe gagne des SP en combattant et les dépense en compétences
  (touches 1 à 4) : Flèche de feu (archers, 20 SP), Piège et Incendie (sapeurs), Curatio et Fureur divine
  (paladins), Honneur (chevaliers), Arbre de soin et Boost élémentaire (+50 % de dégâts, elfes noirs).
- **Feu** : les forêts brûlent. L'incendie gagne les arbres voisins, s'éteint, blesse et effraie ceux qui sont
  pris dedans ; les arbres rougeoient puis restent calcinés.
- **Pièges** : cachés à l'ennemi, ils explosent sous le premier qui passe, étourdissent et embrasent les bois.
- **Contres** : les volants ne sont atteints que par les archers, la magie et d'autres volants (jamais par les
  lames ni les mortiers) ; les mortiers éclatent sur plusieurs soldats et frappent fort les troupes lourdes ;
  les archers montés tirent au galop, toujours sur leur gauche ; les lanciers immobilisent ceux qu'ils
  frappent ; les elfes guérissent en forêt et encaissent mieux la magie.
- **Escarmouche** hors campagne (`#skirmish`) : six troupes de Gerald contre cinq de Lucretia ; `#showcase` montre tous
  les modèles des deux royaumes.

### Étape 2 : le combat du héros

L'étape 2 donne au héros le combat de l'original, tel que le décrivent les guides (voir `docs/CRUSADERS.md`) :

- **Combos** : combo faible (clic ×5, X X X X X sur la manette), combo fort (clic puis clic droit ×4,
  X A A A A, stick au neutre) dont le dernier coup frappe tout autour, estoc (clic droit en marchant vers
  l'ennemi : le héros se fend en avant). Un bouton pressé pendant un coup est gardé et enchaîne au bon moment.
- **Attaque spéciale et Smash** : R (Y) frappe en tourbillon ; R R (Y Y) déclenche le Smash pour 180 SP,
  une onde de choc qui projette et étourdit tout autour.
- **B (Espace)**, selon le moment : contre-attaque si un ennemi est en train de frapper le héros (le coup est
  paré, l'attaquant reçoit la riposte et reste étourdi), repousser s'il vient d'être touché (les ennemis
  sont projetés), sinon esquive.
- **SP** : ils ne se régénèrent pas, ils se gagnent en frappant et en tuant (davantage pour un chef ou un
  héros). Capacités, Smash et assistances les dépensent.
- **Officiers** : la troupe du héros compte deux officiers, les seuls de l'armée. Pour 200 SP, X + A (clic
  gauche + droit) appelle l'assaut du lieutenant à travers les ennemis devant le héros, B + Y (Espace + R) le
  sort Curatio du paladin, qui soigne les blessés de la troupe. En mode tactique, les boutons de la barre
  du héros font de même. Curian, héros des prototypes, garde ces officiers génériques ; Gerald a Rupert et Ellen (étape 3).
- **Interface** : jauge de SP, officiers et coût de leurs assistances, compteur de coups et nom du coup
  spécial en mode action, barres de vie plus discrètes de près.

Durées, dégâts et fenêtres de timing ne sont documentés nulle part : ils sont réglés par nous et rassemblés
dans [`src/heroes/Moves.ts`](src/heroes/Moves.ts).

### Étape 1 : le cœur de la bataille

La construction de base et l'économie du prototype précédent ont été retirées : The Crusaders n'en a pas,
l'armée se gère entre les missions. La bataille se joue désormais comme dans l'original :

- **Troupes** : on commande des régiments entiers, jamais des soldats isolés. Chaque troupe marche et combat en
  une seule formation autour de son **chef**, un capitaine plus robuste qui se tient devant ses hommes.
- **Chef de troupe** : c'est le seul soldat dont la barre de vie est rouge quand on le frappe. S'il tombe, sa
  troupe se débande : ses soldats fuient sans jamais se rallier, puis quittent le champ de bataille. (La règle
  exacte de l'original n'est pas documentée ; celle-ci est une reconstruction, voir `docs/CRUSADERS.md`.)
- **Troupe du héros** : Curian mène sa propre garde. Quand le joueur le dirige, sa troupe l'escorte, puis le
  reprend dans ses rangs quand il rend la main.
- **Mode action et mode tactique**, sans coupure : zoomer à fond sur la troupe du héros fait passer la caméra
  derrière son épaule (combat au corps à corps) ; dézoomer à fond rend la vue du champ de bataille. Tab fait
  la même chose.
- **Choix des troupes** : Q / E (les gâchettes de la manette) passent d'une troupe à l'autre et placent la
  caméra derrière elle, qui la suit ensuite ; un clic sur un soldat choisit sa troupe.
- **Ordres** : marche, attaque d'une troupe ennemie, points de passage (Maj), déplacement de toute l'armée côte à
  côte (Ctrl, le bouton Y de l'original), formation, tenir la position. Tout passe par des commandes
  sérialisables.
- **Minicarte** : relief, troupes du joueur, ennemis vus par ses soldats (et, estompés, ceux qu'ils ont perdus de
  vue), route de la troupe choisie, vue de la caméra. Clic : regarder ; clic droit : ordre de marche ;
  Maj + clic droit : point de passage (maintenir L et appuyer sur A dans l'original).
- **Panneau des troupes** : effectif restant, santé du chef, ce que fait chaque troupe, formations.
- **IA par troupes** : elle ne voit que ce que voient ses soldats ; chaque troupe attaque la troupe ennemie la
  plus proche qu'elle connaît, sinon tient sa position ou marche sur un objectif après un délai. Ses héros
  lancent leurs sorts là où ils touchent le plus de monde.
- **Fin de bataille** : défaite si le héros du joueur tombe ou si toutes ses troupes sont brisées ; victoire
  quand toutes les troupes ennemies le sont.

(À l'étape 1, la bataille de démonstration opposait encore Curian et Likuku ; l'étape 3 l'a remplacée.)

### Socle hérité des prototypes

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
- Formations : ligne, colonne, carré, coin, cercle, dispersée, avec une affectation des places sans croisement.
- Six unités par faction (fantassin, lancier, archer, chevalier, templier, Curian ; guerrier orc, lancier orc,
  archer elfe noir, cavalier elfe noir, ogre, Likuku), montures à squelette propre, animation de l'arc.
- Archers et projectiles en pool (tir en cloche, dispersion, coups résolus à l'atterrissage), flancs et dos,
  boucliers de face, charge de cavalerie en sept états, lanciers qui empalent les cavaliers.
- Héros : mana, quatre capacités chacun, expérience et niveaux, aura de moral ; contrôle à la troisième
  personne (coups libres, coups puissants, esquive, capacités au viseur).
- Déplacement de masse : un flow field par destination (jamais un A* par soldat), steering local
  (séparation, alignement, cohésion, évitement d'obstacles), grille spatiale. Forêts et pentes ralentissent.
- Combat de mêlée : acquisition des cibles, cycle armement → impact → récupération, 8 types de dégâts ×
  5 armures, critiques, recul, impacts simultanés, mort et cadavres.
- Moral : états normal, ébranlé, paniqué, en déroute et se ralliant, selon le rapport de force local, les pertes,
  les morts voisines et la contagion de la déroute. Les fuyards fuient puis se rallient.
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
| `npm test` | 119 tests Vitest : cœur, terrain, caméra, unités, mouvement, formations, combat, équilibre, archers, flancs, charges, héros, coups du héros, officiers et assistances, troupes (chef, points de passage, armée entière, escorte, IA, fin de bataille), compétences et SP des troupes, feu de forêt, pièges, volants, mortiers, archers montés, lanciers, elfes, missions (données, Greyhampton et Ravenmeadow jouées de bout en bout), histoire, assets, script d'assets contre un faux wiki |
| `npm run test:e2e` | 5 tests navigateur Playwright : démarrage sans erreur ; choix des troupes (Q / E, clic), marche, point de passage sur la minicarte, Flèche de feu visée ; officiers, mode action par Tab et par le zoom, attaque spéciale ; Greyhampton (briefing, points verts, scène coupée du village en flammes, répliques, objectifs) ; assets installés utilisés |
| `npm run assets` | installe les portraits et illustrations officiels, votre musique et vos sons |
| `npm run bench` | coût CPU d'un tick de simulation de 100 à 1000 unités, armées interarmes |
| `npm run typecheck` | TypeScript strict (jeu, tests, configurations) |
| `npm run build` | vérification des types puis build statique dans `dist/` (chemins relatifs) |

URL : `#mission=greyhampton` ou `#mission=ravenmeadow` pour choisir la mission (Greyhampton par défaut),
`#skirmish` pour l'escarmouche ; `#perf=N` pour déployer directement N soldats et mesurer (par exemple `#perf=50` ou `#perf=1000`) ;
`#showcase` pour voir les douze modèles côte à côte.

## Contrôles

Les touches de la version PC de l'original ne sont pas documentées (voir `docs/CRUSADERS.md`) : celles-ci
reprennent la disposition de la manette.

| Mode | Commande | Action |
| --- | --- | --- |
| Les deux | Tab, ou zoomer à fond sur la troupe du héros / dézoomer à fond | mode action ⇄ mode tactique |
| Les deux | Q / E (A / E en AZERTY) | troupe précédente / suivante (L / R) ; la caméra se place derrière elle |
| Tactique | clic sur un de vos soldats | choisir sa troupe |
| Tactique | clic droit | la troupe marche là ; sur un ennemi, elle attaque sa troupe |
| Tactique | Maj + clic droit | ajouter un point de passage |
| Tactique | Ctrl + clic droit | toute l'armée marche là, troupes côte à côte (Y) |
| Tactique | minicarte | clic : regarder · clic droit : marcher · Maj + clic droit : point de passage · Ctrl : toute l'armée |
| Tactique | F (Maj + F) / H | formation suivante (précédente) / tenir la position |
| Tactique | 1–4 | compétences de la troupe choisie (SP) : clic pour viser, clic droit ou Échap pour annuler |
| Tactique | WASD (ZQSD) ou bords · clic molette glissé · molette · PgUp/PgDn | caméra (la déplacer cesse de suivre la troupe) · rotation · zoom · inclinaison · L : caméra libre · Origine : revenir derrière la troupe |
| Tactique | Z X C V (W X C V en AZERTY) | capacités du héros : clic pour viser, clic droit ou Échap pour annuler |
| Tactique | boutons des officiers (barre du héros) | assistance d'un officier (200 SP) |
| Action | WASD · souris (cliquer pour la capturer) | marcher · regarder |
| Action | clic (X) ×5 | combo faible |
| Action | clic puis clic droit ×4 (X A A A A) | combo fort ; clic droit seul : coup puissant ; clic droit en marchant vers l'ennemi : estoc |
| Action | R (Y) · R R (Y Y) | attaque spéciale · Smash (180 SP) |
| Action | Espace (B) | contre-attaque quand l'ennemi frappe, repousser quand il vient de vous toucher, sinon esquive |
| Action | clic G + D (X + A) · Espace + R (B + Y) | assistance du premier / second officier (200 SP) |
| Action | 1–4 | capacités au viseur (SP) |
| Divers | Entrée · P · M · F1 · F2 | commencer la bataille (puis passer une réplique) · pause · son · panneau développeur · test de performance |

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
encore de Web Workers. Le rendu des unités reste instancié : un draw call par modèle, ombres
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
  core/        Game (orchestration navigateur, modes action et tactique), GameLoop (pas fixe 30 Hz), World
               (état), Simulation, SimulationFactory (ordre des systèmes), commandes sérialisables, EventBus,
               Random, Time
  entities/    EntityManager (ids, liste dense), Components (structure de tableaux typés, troupe et chef)
  data/        unités (dont celles de The Crusaders), capacités et compétences, officiers, factions, histoire
               (lore, personnages, escarmouche), missions de Gerald, validées par Zod
  missions/    Mission (schéma : troupes, déclencheurs, actions), MissionDirector (système qui joue le script),
               startMission (terrain, bâtiments, IA ennemie et alliée, déploiement)
  assets/      AssetManager (manifeste des assets officiels), sources.json (wiki, Steam, sons)
  audio/       AudioManager (musique et sons installés)
  units/       UnitFactory, UnitManager, MovementSystem (steering), LifecycleSystem, UnitStats (schémas)
  troops/      TroopSystem (troupes, chefs, ordres, points de passage, armée entière, escorte du héros, déroute,
               SP et compétences)
  formations/  Formation, FormationSolver (6 dispositions, affectation), FormationManager (système)
  navigation/  NavGrid, FlowField, Pathfinding (cache), SpatialHashGrid, SpatialSystem
  combat/      CombatSystem (mêlée, tir, tir au galop, volants, lances), DamageSystem (flancs, boucliers,
               résistance à la magie), MoraleSystem, Projectiles (pool + système, éclats), ChargeSystem (7 états),
               FireSystem (feu de forêt), TrapSystem (pièges)
  heroes/      Ability (schéma des capacités), Moves (coups du mode action), Officer (officiers, assistances),
               HeroSystem (SP, sorts, coups et combos, contre, assistances, niveaux, statuts)
  ai/          AIKnowledge (vision), TroopAI (IA par troupes), HeroAI (choix des sorts), TacticalAI et
               AIController (IA d'une armée en bloc, tests et banc d'essai)
  maps/        Terrain (heightmap, forêts, rochers, clairières), Props (bâtiments : emprise, combustible), Noise
  renderer/    Renderer, SceneManager, Lighting, TerrainRenderer, UnitMeshes, UnitRenderer (instancing +
               animation GPU), ProjectileRenderer, OverlayRenderer (anneaux, barres de vie dont celle du chef,
               points de passage, visée, points verts), EffectsRenderer, PropRenderer (bâtiments, ballon), picking
  camera/      RTSCamera (mode tactique), HeroCamera (mode action)
  input/       KeyboardInput, MouseInput, InputManager, TroopInput (ordres aux troupes), HeroInput
  ui/          HUD, TroopPanel, Minimap, HeroBar, BriefingScreen, DialogueBox (répliques), ObjectivePanel
  debug/       PerformanceMonitor, DebugManager (F1), GpuTimer
  scenes/      BattleScene (bataille par troupes), BattleOutcome, PerformanceTestScene (F2), ShowcaseScene
scripts/fetch-assets.mjs  npm run assets
```

Principes, dépendances justifiées et journal détaillé des phases : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Feuille de route du clone

1. ✅ **Cœur de la bataille** : troupes et chefs, troupe du héros, modes action et tactique, choix des troupes,
   minicarte et points de passage, IA par troupes.
2. ✅ **Combat du héros** : combos faible et fort, estoc, attaque spéciale et Smash, contre-attaque, repousser
   et esquive, SP gagnés en combattant, officiers de la troupe du héros et leurs assistances.
3. ✅ **Troupes et contres** : les armées de Hironeiden (Gerald) et de Vellond (Lucretia), SP et compétences
   des troupes, sapeurs et pièges, mortiers, volants, forêts qui brûlent.
4. ✅ **Missions 1 et 2 de Gerald** : Greyhampton et Ravenmeadow, objectifs, scripts, alliés, décor, répliques
   et scènes coupées.
5. **Campagne** : choix de la campagne, briefing et choix des troupes, résultats (or, expérience), caserne
   (équipement, mercenaires, promotions), sauvegarde (IndexedDB).

La fidélité des étapes 3 à 5 dépend des sources : les pages qui détaillent le jeu (Kingdom Under Fire Wiki,
GameFAQs, guides Steam) étaient inaccessibles depuis l'environnement de développement.

## Mentions légales

Projet de fan non commercial, sans lien avec Blueside, Phantagram ou Microsoft. Kingdom Under Fire,
ses personnages et ses lieux sont la propriété de leurs détenteurs respectifs. L'histoire est résumée avec nos
propres mots. Le code, les modèles 3D procéduraux, le terrain, les effets et l'interface sont écrits pour ce
projet. Les assets officiels ne sont pas redistribués : `npm run assets` les installe uniquement sur votre machine.
