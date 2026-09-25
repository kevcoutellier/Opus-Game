# Opus Stadium — remake web de Pokémon Stadium (N64)

Remake fan, non officiel, de **Pokémon Stadium** dans le navigateur, en **Three.js**. On y trouve les
151 Pokémon de la Gen 1 en 3D, la location de Pokémon, le choix de 3 Pokémon sur 6, des combats
cinématiques avec commentateur, les **4 coupes du Stadium** et le **Château des Champions**.

## Fonctionnalités

- **Stade 3D procédural** : terrain avec emblème Poké Ball, gradins elliptiques et environ 2 700 spectateurs
  animés (instancing + shader), pylônes d'éclairage, écrans géants avec le score, ciel jour, crépuscule ou nuit.
- **151 modèles 3D** (GLB, Draco + WebP), normalisés selon la taille réelle de chaque Pokémon. Certains
  flottent, comme dans Stadium. Les clips d'animation sont joués quand le modèle en a (Onix, Mewtwo, Bulbizarre…) ;
  sinon l'animation est procédurale (respiration, charge, recul, K.O.).
- **Mise en scène** : lancer de Poké Ball par le dresseur, caméra « réalisateur » (plans d'attaque,
  gros plans, secousses) et effets par capacité : Lance-Flammes, Tonnerre (éclair venu du ciel),
  Ultralaser, Surf, Éboulement, Séisme, Explosion, poudres, notes de Berceuse, murs Protection/Mur Lumière…
- **Moteur de combat Gen 1 fidèle à Stadium** (`src/engine/`), sans DOM et testé :
  - formule de dégâts Gen 1 (débordement des stats > 255, STAB, efficacité appliquée type par type, facteur 217-255) ;
  - critiques façon Stadium (`((VitBase + 76) >> 2) << 1`, Puissance x4 +160, taux critique élevé x4) ;
  - pas de raté à 1/256, sommeil de 1 à 3 tours, Ultralaser recharge même après un K.O. ;
  - le Clone bloque les altérations et le drainage, stats recalculées (plus de cumul PAR/BRU) ;
  - bugs Gen 1 conservés : Spectre → Psy = 0, Morsure et Tornade de type Normal, Spécial unique ;
  - capacités spéciales : Métamorph (le modèle 3D change !), Mimique, Métronome, Riposte, Patience, Entrave,
    Ligotage/Étreinte, Vampigraine, Toxik, Brume, Buée Noire, Repos, Clone, Explosion, Vol/Tunnel (semi-invulnérables)…
  - Clause Sommeil et Clause Gel, comme dans les coupes de Stadium.
- **IA à 3 niveaux** : estimation déterministe des dégâts, valeur des capacités de statut, changements de Pokémon.
- **Modes** :
  - **Stadium** : les 4 coupes et leurs règles. Chacune se joue en 4 difficultés (Poké Ball, Super Ball,
    Hyper Ball, Master Ball) ; une difficulté se débloque en remportant la précédente. Un tournoi compte
    6 dresseurs à la suite, et l'IA comme la force des équipes adverses augmentent à chaque tour.

    | Coupe | Niveaux | Total des 3 | Restrictions |
    | --- | --- | --- | --- |
    | Petit | 25–30 | ≤ 80 | non évolués, 2 m et 20 kg max., Mew/Mewtwo interdits |
    | Pika | 15–20 | ≤ 50 | Mew/Mewtwo interdits |
    | Poké | 50–55 | ≤ 155 | Mew/Mewtwo interdits |
    | Prime | 100 | — | aucune |

    Comme dans Stadium, on ajuste le niveau de ses 3 Pokémon avant chaque combat, dans la limite du total.
    Simplification : un Pokémon de location garde le même set de capacités quel que soit son niveau.
  - **Château des Champions** : les 8 arènes de Kanto (un disciple puis le Champion : Pierre, Ondine,
    Major Bob, Érika, Koga, Morgane, Auguste, Giovanni), puis le Conseil 4 (Olga, Aldo, Agatha, Peter)
    et le rival Blue d'affilée, avec les règles de la Coupe Poké. Les équipes des Champions sont construites
    autour de leur type avec des Pokémon de la Gen 1 ; ce ne sont pas les équipes exactes du jeu N64.
  - **Combat Libre** : niveau 50, 100 ou « niveaux équilibrés » (niveaux des sets aléatoires de Showdown), 3 difficultés ;
  - **Pokédex 3D** : les 151 modèles en rotation, avec stats, cri et animations disponibles ;
  - **Salle des Trophées** : 16 trophées, 8 badges, Conseil 4 et Panthéon des équipes gagnantes (sauvegarde locale).
- **Interface en français** : noms officiels FR (Dracaufeu, Tonnerre, Ultralaser…), textes de combat,
  commentateur écrit et **vocal** (Web Speech API, voix FR).
- **Audio** : cris Gen 1 (PokeAPI), bruitages et musiques chiptune originales synthétisées en WebAudio.
- Clavier, souris et **manette** (API Gamepad), interface responsive.

## Démarrage

Le jeu vit dans le dossier `pokemon-stadium/` du dépôt ; toutes les commandes se lancent depuis ce dossier.

```bash
cd pokemon-stadium
npm install
npm run assets   # télécharge les assets tiers dans public/assets/
npm run dev      # http://localhost:5173
```

`npm run assets` est facultatif : un fichier absent de `public/assets/` est chargé directement depuis GitHub
(`raw.githubusercontent.com` renvoie les en-têtes CORS).

Autres commandes :

| Commande | Rôle |
| --- | --- |
| `npm test` | tests du moteur, des règles de coupe et de la progression (`node --test`) |
| `npm run build` | build statique dans `dist/` (chemins relatifs, compatible GitHub Pages) |
| `npm run data` | régénère `src/data/gen1.json` depuis Showdown et PokeAPI |
| `npm run assets -- --only=models --from=1 --to=9` | téléchargement partiel |

Raccourcis d'URL : `#dex/150` ouvre le Pokédex sur un Pokémon, `#battle` lance un combat rapide et
`#battle/6,25,150` un combat avec l'équipe de son choix.

### Contrôles

| Action | Clavier | Manette | Souris |
| --- | --- | --- | --- |
| Naviguer (menus et combat) | Flèches | Croix / stick | survol |
| Valider | Entrée | A / Start | clic |
| Retour | Échap | B | bouton « Retour » |
| Choisir une capacité | `1`–`4` ou flèches + Entrée | croix + A | clic |
| Changer de Pokémon | `S`, puis `1`–`3` | X | bouton « Changer » |
| Passer un message | Entrée / Espace | A | clic |
| Location aléatoire | `R` | Y | bouton « Aléatoire » |

## Assets : sources

Les assets ne sont **pas versionnés** (`public/assets/` est dans `.gitignore`) : ils restent la propriété
de Nintendo / Creatures / Game Freak, et le script les télécharge à la demande.

| Asset | Source |
| --- | --- |
| Modèles 3D `.glb` (151) | [Pokemon-3D-api/assets](https://github.com/Pokemon-3D-api/assets) |
| Cris Gen 1 `.ogg` | [PokeAPI/cries](https://github.com/PokeAPI/cries) (dossier `legacy`) |
| Icônes et sprites Rouge/Bleu | [PokeAPI/sprites](https://github.com/PokeAPI/sprites) |
| Stats, capacités, learnsets, sets de location | [pokemon-showdown](https://github.com/smogon/pokemon-showdown), mod `gen1stadium` (MIT) |
| Noms français | [PokeAPI data](https://github.com/PokeAPI/pokeapi) (CSV) |

### Utiliser les vrais modèles de Pokémon Stadium

Aucun dépôt public ne distribue les modèles N64 extraits de Stadium : il faut les extraire de sa propre
cartouche, avec [MeltyTool](https://github.com/MeltyPlayer/MeltyTool) ou l'importeur documenté dans
[PokemonStadium2Unity](https://github.com/Manurocker95/PokemonStadium2Unity). Les rips disponibles sur
The Models Resource ou Bulbagarden Archives conviennent aussi. On convertit ensuite chaque modèle en
`.glb` (Blender : *File › Export › glTF 2.0*) et on le dépose ici :

```
public/assets/stadium/<numéro>.glb     ex. public/assets/stadium/25.glb
```

Relancer ensuite `npm run assets`, qui régénère le manifeste : les modèles Stadium passent alors en priorité
(le Pokédex 3D indique la source de chaque modèle). La mise à l'échelle automatique fonctionne avec n'importe
quel GLB ; le modèle doit regarder vers +Z (convention glTF).

## Architecture

```
src/
  engine/        moteur de combat pur (aucune dépendance au DOM), testé dans test/
    battle.js    tours, dégâts, statuts, capacités spéciales → flux d'événements
    pokemon.js   stats Gen 1, recalcul Stadium
    ai.js        IA de l'adversaire
  render/        Three.js
    arena.js     stade procédural (terrain, gradins, foule instanciée, pylônes, écrans)
    actor.js     chargement GLB/Draco, normalisation, animations procédurales et clips
    battleScene.js  chorégraphie des capacités, Poké Balls, dresseurs
    effects.js   particules, rayons, éclairs, ondes de choc, rochers
    director.js  caméra cinématique
  game/          règles des coupes, tournois, Château des Champions, runs, sauvegarde
  ui/            écrans (titre, menu, Stadium, Château, location, choix 3/6, combat, résultats,
                 Pokédex, trophées) et manette
  audio/         cris, bruitages et musiques synthétisés, commentateur vocal
  data/gen1.json données générées par scripts/build-data.mjs
scripts/
  build-data.mjs    Showdown + PokeAPI → gen1.json
  fetch-assets.mjs  téléchargement des assets + manifeste
```

Le moteur produit des événements (`move`, `damage`, `status`, `faint`…) que `ui/battleScreen.js` rejoue
un par un : texte, animation 3D, barre de PV, son et commentaire.

## Mentions légales

Projet de fan non commercial, sans lien avec Nintendo, Creatures Inc., Game Freak ou The Pokémon Company.
Pokémon et les noms associés sont des marques de leurs propriétaires respectifs. Le code du projet
(moteur, rendu, interface, musiques synthétisées) est original.
