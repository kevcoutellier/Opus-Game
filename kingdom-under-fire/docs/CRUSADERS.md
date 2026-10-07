# Référence : Kingdom Under Fire: The Crusaders

Ce document rassemble ce que l'on sait du jeu original (Phantagram / Blueside, Xbox 2004, réédité sur PC en
2020), afin de le cloner fidèlement. Chaque point porte un niveau de confiance :

- **confirmé** : plusieurs sources concordent ;
- **à vérifier** : une seule source, ou un résumé de source ;
- **inconnu** : rien trouvé, il faudra une source avant de l'implémenter.

Limite actuelle : la politique réseau de l'environnement de développement bloque la lecture des pages qui
détaillent le jeu (Kingdom Under Fire Wiki, GameFAQs, guides Steam, GamersTemple, site officiel
kuftc.blueside.net). Seule la recherche web passe ; elle ne renvoie que des extraits résumés. Autoriser ces
domaines permettrait de compléter et de corriger ce document.

## 1. Structure du jeu

| Élément | Contenu | Confiance |
| --- | --- | --- |
| Campagnes | Quatre héros : **Gerald** (Hironeiden), **Lucretia** (elfes noirs de Vellond), **Kendal** (Ecclesia), **Regnier** (Hexter). Gerald et Lucretia sont ouverts dès le début ; finir Lucretia ouvre Kendal et Regnier. | confirmé |
| Difficulté | Gerald sert de long tutoriel (missions faciles) ; Lucretia correspond à la difficulté normale. | confirmé |
| Boucle | Mission (briefing, choix des troupes) → bataille → or et expérience → caserne (équipement, mercenaires, promotions) → mission suivante. | confirmé |
| Pas de base | On ne construit rien : l'armée se gère entre les missions. | confirmé |

### Missions de Gerald

1. Greyhampton : rejoindre deux points verts sur la carte ; une scène au village ; combat contre les elfes
   noirs (confirmé). Le raid sur Greyhampton est le fait des humains (à vérifier).
2. Ravenmeadow : première grande bataille. L'ordre est de rejoindre le mur pour sauver les sapeurs, mais Gerald
   arrive toujours trop tard. Il faut affronter une troupe d'infanterie et une troupe d'archers ennemies, en
   formation serrée. Pas de sort de soin avant la fin de cette bataille ; il faut chercher et tuer vite les
   chefs ennemis (à vérifier).
3. Greywood · 4. Glaucus (la vanne du barrage sur la rivière Glaucus ; le général Hugh, figure paternelle de
   Gerald et de Rupert, est attaqué par Lucretia) · 5. Woodenshade · 6. Rose Rain · 7. Halmoral ·
   8. Stormdeen · 9. Outer Hironeiden · 10. Posterus Green · 11. Nymphbarren (à vérifier).

### Missions de Lucretia

1. Dryglade · 2. Wicktow · 3. Valley of Lichen · 4. Glaucus · 5. Aten · 6. Defense Wall, Esse · 7. Halmoral ·
8. Hironeiden · 9. Posterus Green · 10. Holy Ground (à vérifier). Elle rencontre Rithrin ; avec Regnier, elle
prend la rivière Glaucus et Esse, puis envahit Hironeiden (à vérifier).

### Kendal et Regnier

Listes incomplètes et contradictoires dans les résultats (Greyhampton, Holy Ground, Colonock, Nymphbarren,
Woodenshade, Funero pour Kendal ; Brimstone Forest, Cremium, Funero pour Regnier) : **inconnu**.

## 2. La bataille

| Mécanique | Description | Confiance |
| --- | --- | --- |
| Deux modes | **Mode action** : on dirige le héros au corps à corps, façon Dynasty Warriors. **Mode tactique** : caméra en hauteur, on commande les troupes. On passe de l'un à l'autre sans coupure, par un zoom de la caméra. | confirmé |
| Troupes | On commande des **troupes** (régiments) entières, jamais des soldats isolés. Jusqu'à 450 soldats à l'écran. | confirmé |
| Troupe du héros | Le héros mène sa propre troupe, la seule qui a des officiers. | confirmé |
| Sélection | Les gâchettes / L-R font défiler les troupes ; la caméra se place derrière la troupe choisie. | confirmé |
| Ordres | Ordres de déplacement et d'attaque en temps réel, sur la minicarte ou à l'écran. Points de passage sur la minicarte (maintenir L, appuyer sur A) ; Y déplace toutes les troupes. | confirmé |
| Formations | Changement de formation de la troupe (LB / RB). | à vérifier |
| Chef de troupe | Chaque troupe a un chef, le seul soldat dont la barre de vie est rouge quand on le frappe. La tactique de base est de le trouver et de le tuer vite. | confirmé (effet exact de sa mort : **inconnu**) |
| Héros | Combo faible : X X X X X. Combo fort : X puis A A A A, stick au neutre. Estoc : A avec le stick vers l'ennemi. Contre-attaque : B au moment où l'ennemi frappe. Repousser : B quand on vient d'être touché. Attaque spéciale : Y ; Smash : Y Y, 180 SP. Capacités sur la croix directionnelle. | confirmé (guide Steam) ; durées et dégâts : **inconnu** |
| Officiers | Chaque commandant a deux lieutenants dans sa troupe. Ils combattent, et le héros peut appeler leur attaque d'assistance (200 SP) par B+Y ou X+A selon l'officier. Gerald a pour officiers Rupert et Ellen. Un officier paladin doté de la compétence Holy soigne par B+Y les soldats blessés de la troupe (sort Curatio) ; les paladins sont les seuls soigneurs. | confirmé (guide Steam, discussions Steam) ; liste des assistances par officier : **inconnu** |
| SP | Les capacités, le Smash et les assistances coûtent des SP, gagnés en tuant des ennemis (aucun gain tant que la jauge est pleine). Exemple : Flèche de feu, 20 SP, met le feu à une forêt ou à une structure. | confirmé ; gains par coup et jauge maximale : **inconnu** |
| Terrain | Les forêts brûlent (flèches de feu, sapeurs). | confirmé |

### Types de troupes

| Type | Rôle | Confiance |
| --- | --- | --- |
| Infanterie | Fait 80 % du combat. Durabilité selon la race : elfe < humain < orc. | confirmé |
| Archers | Tir à distance, seule défense anti-aérienne de base. | confirmé |
| Cavalerie | Ne reste pas au contact : elle charge à travers les rangs, désorganise et inflige de lourdes pertes. Les compétences Équitation (vitesse de rotation) et frontale (dégâts) la règlent. | confirmé |
| Lanciers | Contre la cavalerie, immobilisent les troupes devant eux. | confirmé |
| Sapeurs | Posent des pièges qui infligent de lourds dégâts et mettent le feu aux forêts ; peuvent servir d'infanterie. | confirmé |
| Mortiers | Comme des archers, sans pouvoir viser les troupes volantes ; abattent les murailles. | confirmé |
| Catapultes, balistes | Siège (côté humain). | à vérifier |
| Volants | Storm Riders (aigles, efficaces contre tout sauf les archers), Bomber Wing (bombardiers, dégâts explosifs), wyvernes. Seuls les archers, des balistes spéciales et la magie les atteignent. | confirmé |
| Monstres | Scorpions géants (engins de siège vivants, insensibles aux flèches), mammouths des marais. | confirmé |
| Spéciales | Paladins (permettent à leur chef de lancer *Curio*), goules (résistantes à tout sauf aux explosifs et au sacré). | à vérifier |

## 3. Entre les missions

| Mécanique | Description | Confiance |
| --- | --- | --- |
| Récompenses | Or et expérience ; tuer les ennemis non obligatoires en rapporte davantage. | confirmé |
| Niveaux | Troupes jusqu'au niveau 99 ; les PV cessent d'augmenter au-delà. | confirmé |
| Compétences | Compétences physiques (mêlée, tir…) jusqu'à 50, magiques jusqu'à 25. *Scouting* est la compétence par défaut des troupes de base. La défense de l'infanterie vient de la compétence de mêlée et des résistances de l'équipement. | confirmé |
| Promotions | Infanterie → chevaliers ; archers → archers longs ; cavalerie → cavalerie lourde ; sapeurs → mortiers → Bomber Wing ; un mercenaire qui a Équitation peut devenir Storm Rider. | confirmé |
| Caserne | Équipement généré au hasard (sauvegarder puis recharger le régénère). Niveau d'équipement plafonné à 30. Bonus d'expérience ou de SP sur les armes. | confirmé |
| Mercenaires | Recrutés avec des compétences données, puis promus. | confirmé |
| Officiers | Leur équipement donne des compétences et des résistances qui s'appliquent à leur troupe. | confirmé |

## 4. Contrôles (Xbox ; la version PC permet de tout réassigner)

| Mode | Commande | Action |
| --- | --- | --- |
| Action | stick gauche | se déplacer |
| Action | A ou X | attaque normale |
| Action | Y | attaque spéciale |
| Action | B | contre-attaque ou esquive |
| Action | croix directionnelle | capacités |
| Action / tactique | L, R | changer de troupe |
| Tactique | stick droit | caméra |
| Tactique | stick gauche | déplacer le curseur |
| Tactique | maintenir L + A | point de passage sur la minicarte |
| Tactique | Y | déplacer toutes les troupes |

Sur PC, la souris joue le rôle de l'un ou l'autre stick selon qu'on maintient Alt ; la touche à gauche de 1
affiche la correspondance clavier (confirmé). Les touches par défaut : **inconnu**.

## 5. Inconnues bloquantes pour un clone exact

- Statistiques des troupes et des héros, formules de dégâts, contres chiffrés.
- Effet exact de la mort d'un chef de troupe ; présence d'un moral.
- Cartes, déploiements, scripts et objectifs des missions au-delà des deux premières de Gerald.
- Liste des officiers et de leurs assistances, capacités des troupes ; SP gagnés par coup et par victime.
- Durées, dégâts et fenêtres de timing des coups du héros (combos, contre, Smash).
- Disposition exacte de l'interface (HUD de bataille, minicarte, écrans de caserne et de briefing).

## Sources (extraits de recherche)

- [GameSpot — critique de The Crusaders](https://www.gamespot.com/reviews/kingdom-under-fire-the-crusaders-review/1900-6110734/)
- [Guide Steam — Kingdom Under Fire: The Crusaders Guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2243680956) (combos, Smash, assistances)
- [Discussion Steam — officier paladin et Curatio](https://steamcommunity.com/app/1121420/discussions/0/1746772308311625309/)
- [GameSpot — présentation des personnages](https://www.gamespot.com/articles/kingdom-under-fire-the-crusaders-character-spotlight/1100-6101787/)
- [Guide Steam — Gerald's Campaign](https://steamcommunity.com/sharedfiles/filedetails/?id=2964223278)
- [Speedrun.com — niveaux](https://www.speedrun.com/kingdom_under_fire_the_crusaders/levels)
- [Kingdom Under Fire Wiki — The Crusaders](https://kingdomunderfire.fandom.com/wiki/Kingdom_Under_Fire:_The_Crusaders)
- [Kingdom Under Fire Wiki — Gerald](https://kingdomunderfire.fandom.com/wiki/Gerald), [Lucretia](https://kingdomunderfire.fandom.com/wiki/Lucretia)
- [TV Tropes — personnages](https://tvtropes.org/pmwiki/pmwiki.php/Characters/KingdomUnderFireTheCrusaders)
- [Guide de GamersTemple](https://www.gamerstemple.com/vg/games6/000890/000890g110.asp)
- [Contrôles Xbox One — Magic Game World](https://www.magicgameworld.com/xbox-one-controls-for-kingdom-under-fire-the-crusaders/)
- [Contrôles clavier — Magic Game World](https://guides.magicgameworld.com/kingdom-under-fire-the-crusaders-pc-keyboard-controls-guide/)
- [Steam — page du jeu](https://store.steampowered.com/app/1121420/Kingdom_Under_Fire_The_Crusaders/)
- Discussions Steam sur les troupes, la caserne et l'équipement des officiers (app 1121420).
