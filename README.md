# Opus Game

Collection de jeux web. Chaque jeu vit dans son propre dossier, avec ses dépendances, ses scripts et
son README.

| Jeu | Dossier | Description |
| --- | --- | --- |
| Opus Stadium | [`pokemon-stadium/`](pokemon-stadium/) | Remake web de Pokémon Stadium (N64) en Three.js : combats Gen 1 en 3D, coupes du Stadium, Château des Champions, Pokédex 3D |
| Kingdom Under Fire | [`kingdom-under-fire/`](kingdom-under-fire/) | Clone web de Kingdom Under Fire: The Crusaders (Xbox) en TypeScript + Three.js : troupes et chefs, modes action et tactique, combat du héros (combos, Smash, officiers), armées de Hironeiden et de Vellond, feu de forêt, missions de Gerald |
| Galactic Protocol | [`galactic-protocol/`](galactic-protocol/) | Grande stratégie Star Wars inspirée de Global Protocol: New World Order : 131 systèmes, 4 époques, économie, armées, diplomatie, Sénat, espionnage, niveau d’alerte et superarmes |

## Lancer un jeu

```bash
cd pokemon-stadium        # ou galactic-protocol, kingdom-under-fire
npm install
npm run assets   # facultatif : télécharge les assets tiers
npm run dev
```

## Blender (MCP)

Le serveur MCP `blender` (`.mcp.json`) permet à Claude Code de modéliser dans Blender, y compris sans écran
dans un environnement cloud : voir [`kingdom-under-fire/tools/blender/`](kingdom-under-fire/tools/blender/).
