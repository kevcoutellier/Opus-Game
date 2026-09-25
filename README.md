# Opus Game

Collection de jeux web. Chaque jeu vit dans son propre dossier, avec ses dépendances, ses scripts et
son README.

| Jeu | Dossier | Description |
| --- | --- | --- |
| Opus Stadium | [`pokemon-stadium/`](pokemon-stadium/) | Remake web de Pokémon Stadium (N64) en Three.js : combats Gen 1 en 3D, coupes du Stadium, Château des Champions, Pokédex 3D |
| Kingdom Under Fire | [`kingdom-under-fire/`](kingdom-under-fire/) | Remake 3D de Kingdom Under Fire: A War of Heroes en TypeScript + Three.js : l’Alliance Humaine contre la Légion Noire à Bersia, grandes armées instanciées, 6 formations, combat de mêlée, moral, IA à vision limitée (premier prototype) |
| Galactic Protocol | [`galactic-protocol/`](galactic-protocol/) | Grande stratégie Star Wars inspirée de Global Protocol: New World Order : 131 systèmes, 4 époques, économie, armées, diplomatie, Sénat, espionnage, niveau d’alerte et superarmes |

## Lancer un jeu

```bash
cd pokemon-stadium        # ou galactic-protocol, kingdom-under-fire
npm install
npm run assets   # facultatif : télécharge les assets tiers
npm run dev
```
