# Galactic Protocol : Le Nouvel Ordre

Grande stratégie galactique dans le navigateur, qui reprend les systèmes de **Global Protocol: New World Order**
(Dorlion Interactive, 2026) dans l’univers **Star Wars**. On y dirige une faction de la galaxie en temps réel
pausable : économie, armées, diplomatie, Sénat (l’ONU du jeu d’origine), espionnage, stabilité intérieure et
niveau d’alerte façon DEFCON, avec l’Étoile de la Mort, la Base Starkiller et le bombardement Base Delta Zéro.

## Correspondance avec Global Protocol: New World Order

| Global Protocol | Galactic Protocol |
| --- | --- |
| 261 pays, 5 étoiles de difficulté | 12 à 17 factions par époque (Empire, Alliance Rebelle, Hutts, Chiss, Premier Ordre…), 5 étoiles de difficulté |
| Plus de 3 600 provinces | 131 systèmes stellaires canoniques, placés d’après la grille galactique officielle et reliés par des hyperroutes (Couloir Corellien, Voie Hydienne, Route Perlemienne…) |
| Données réelles de 2026 | 4 époques : 19 BBY (Avènement de l’Empire), 0 BBY (Un Nouvel Espoir), 4 ABY (L’Empire en ruines), 34 ABY (Le Premier Ordre) |
| Budget, fiscalité, bâtiments, commerce de ressources | Impôts et budget (recherche, renseignement, social, infrastructures), 28 bâtiments en 8 catégories, 5 ressources stratégiques (durasteel, tibanna, kyber, bacta, épice) et marché galactique |
| Infanterie, blindés, artillerie, chasseurs, bombardiers, hélicoptères, destroyers, sous-marins, porte-avions | Infanterie, blindés, artillerie, chasseurs, bombardiers, transports d’assaut, frégates, corsaires furtifs, vaisseaux capitaux, super-cuirassés et stations de combat, nommés selon la faction (TIE, X-wing, AT-AT, Destroyers stellaires, croiseurs Mon Calamari, droïdes B1…) |
| Diplomatie, alliances, ONU | Accords commerciaux, pactes de non-agression, droits de passage, alliances, vassalités, score de guerre, traités de paix ; Sénat Galactique avec résolutions (sanctions, condamnation, aide, force de paix, interdiction des superarmes, pouvoirs d’urgence), votes et veto |
| 47 technologies | 47 technologies en 7 branches, moins chères quand d’autres factions les maîtrisent |
| CIA, MI6, FSB, Mossad | Renseignement impérial & ISB, réseau d’espions bothan, Soleil Noir, Aube Écarlate, Renseignement de la Flotte d’expansion chiss… : 11 opérations (reconnaissance, vol de technologie, sabotage, déstabilisation, soulèvements, corruption du Sénat, assassinat, vol des plans d’une superarme, ingérence électorale…) |
| DEFCON et armes nucléaires | Niveau d’alerte galactique 5 → 1 : Base Delta Zéro au niveau 3, superlasers au niveau 2 ; la tension monte avec les guerres, les mobilisations et les tirs |
| Stabilité, élections, crises intérieures | Stabilité par système (impôts, distance à la capitale, occupation, bâtiments), sympathie insurgée, soulèvements et États sécessionnistes, élections dans les républiques, 18 crises intérieures et des événements scénarisés (Rogue One, dissolution du Sénat, Alderaan, Ordre 66, système Hosnian, Jakku) |
| IA | IA économique, militaire, diplomatique, d’espionnage et de superarmes pour chaque faction |

Victoire : accomplir l’objectif de sa faction (par exemple « Libérer Coruscant » pour l’Alliance) ou dominer
l’économie galactique. Défaite : l’anéantissement.

## Démarrage

```bash
cd galactic-protocol
npm install
npm run assets   # facultatif : télécharge les visuels et les sons officiels dans public/assets/
npm run dev      # http://localhost:5173
```

Autres commandes :

| Commande | Rôle |
| --- | --- |
| `npm test` | tests du moteur (galaxie, scénarios, économie, combat, paix, Sénat, superarmes, sauvegarde, IA sur un an) |
| `npm run build` | build statique dans `dist/` (chemins relatifs) |
| `npm run assets -- --no-wookieepedia` | uniquement les sources GitHub |
| `npm run assets -- --theme=chemin/theme.mp3` | ajoute votre enregistrement du thème principal |

Raccourci d’URL : `#play/<scénario>/<faction>` (par exemple `#play/bby0/rebels` ou `#play/aby34/firstorder`)
lance directement une partie, sans menu ni texte déroulant.

### Contrôles

| Action | Clavier | Souris / tactile |
| --- | --- | --- |
| Pause, vitesse | Espace, `1`–`5` | boutons en haut à droite |
| Sélectionner | — | clic |
| Déplacer la flotte sélectionnée | — | clic droit sur un système (ou bouton « Déplacer ») |
| Zoom, déplacement | `+` `-`, flèches / ZQSD | molette, glisser, pincer |
| Panneaux | `E` économie, `F` armée, `G` diplomatie, `I` renseignement, `R` recherche, `N` Sénat, `P` politique, `L` alerte, `C` classement, `H` HoloNet | barre de gauche |
| Mode de carte | `M` | boutons en bas |

## Assets officiels

Les visuels et les sons officiels ne sont **pas versionnés** (`public/assets/` est dans `.gitignore`) : ils
restent la propriété de Lucasfilm Ltd. / Disney et de LucasArts. `npm run assets` les télécharge et écrit
`public/assets/manifest.json`. Sans ce script, les images GitHub sont chargées directement et le reste est
dessiné ou synthétisé par le jeu.

| Asset | Source |
| --- | --- |
| Photos de planètes, portraits, vaisseaux et véhicules (base de données starwars.com, indexée par SWAPI) | [breatheco-de/swapi-images](https://github.com/breatheco-de/swapi-images) |
| Emblèmes officiels (Empire, Alliance, Premier Ordre, Mandalore, Fédération du Commerce, Sénat…) | icônes « brands » de [Font Awesome](https://github.com/FortAwesome/Font-Awesome) (CC BY 4.0) |
| Planètes, emblèmes et dirigeants absents de SWAPI (Kuat, Scarif, Lothal, Hutts, Chiss, Rae Sloane, Snoke…) | [Wookieepedia](https://starwars.fandom.com) (API MediaWiki) |
| Bruitages (lasers, explosions, alarmes, interface, hyperespace) | [The Sounds Resource](https://sounds.spriters-resource.com) : Empire at War, X-Wing vs. TIE Fighter, TIE Fighter, X-Wing |
| Thème principal | votre propre fichier, copié dans `public/assets/audio/theme.mp3` |

Les sons sont triés automatiquement d’après le nom des fichiers (lasers, explosions, superlaser, alarmes,
interface, hyperespace) ; sans eux, le jeu synthétise ses bruitages et une fanfare originale en WebAudio.

## Architecture

```
src/
  data/          systèmes, factions, scénarios, unités, bâtiments, technologies, opérations, résolutions
  engine/        simulation pure (aucune dépendance au DOM), testée dans test/
    galaxy.js      positions, hyperroutes, routes commerciales, plus court chemin
    setup.js       création d’une partie à partir d’un scénario
    sim.js         boucle quotidienne, boîte de réception, victoire
    economy.js     PIB, impôts, budget, ressources, marché, construction, production
    military.js    mouvements, garnisons, soins ; combat.js : batailles, bombardement, invasion, occupation
    diplomacy.js   relations, traités, guerres, score de guerre, paix
    politics.js    stabilité, insurrection, élections, décisions ; espionage.js ; research.js ; senate.js
    superweapons.js  niveau d’alerte, Base Delta Zéro, superlasers ; events.js : crises et événements
    ai.js          IA des factions ; save.js : sauvegardes (localStorage)
  render/map.js  carte en Canvas 2D : galaxie spirale, territoires, hyperroutes, planètes, flottes, effets
  ui/            écran titre, choix de faction, texte déroulant, HUD, panneaux, fiches, fenêtres
  audio/         échantillons officiels ou sons synthétisés
scripts/fetch-assets.mjs  téléchargement des assets officiels et du manifeste
```

## Mentions légales

Projet de fan non commercial, sans lien avec Lucasfilm, Disney, LucasArts ou Dorlion Interactive. Star Wars et
les noms associés sont des marques de leurs propriétaires respectifs. Le code, la simulation, la carte et les
sons synthétisés sont originaux.
