# ECLIPSE — shooter tactique multijoueur (navigateur)

Jeu de tir tactique original, jouable dans le navigateur : agents à capacités, manches avec phase d'achat, pose et désamorçage du Noyau, skins d'armes, comptes joueurs. Serveur Node.js autoritaire (WebSocket) et rendu Three.js.

## Contenu

- **3 modes**
  - **Assaut 5v5** : les attaquants posent le Noyau sur le site A ou B, les défenseurs le désamorcent. Économie, changement de côté à la mi-temps.
  - **Duel 1v1** : sur 3 petites cartes (FOSSE, CUBE, IGLOO). Victoire à l'élimination, 9000 crédits à chaque manche. Si le temps est écoulé, la manche revient au joueur qui a le plus de PV.
  - **Mêlée** : chacun pour soi, réapparition au bout de 3 s, toutes les armes gratuites.
- **Duel rapide** : un bouton apparie automatiquement deux joueurs et lance la partie.
- **7 cartes** : DUNE, NÉON, GLACIER, TEMPLE (5v5) et FOSSE, CUBE, IGLOO (duel).
- **6 agents** avec 2 capacités et un ultime chacun : fumées, flash, incendiaire, ruée, téléportation, mur de glace, invisibilité, révélation…
- **8 armes** (pistolets, PM, pompe, fusils, sniper avec lunette) et **10 skins**.
- **Lobby** : liste des salons, équipes, choix de l'agent, chat, bots (3 difficultés).
- **Comptes** : inscription et connexion. Mots de passe hachés (scrypt), session mémorisée 30 jours. Éclats, skins et statistiques sont sauvegardés sur le serveur. Un mode invité est aussi disponible.

## Lancer sur ton PC

1. Installe **Node.js 18 ou plus** depuis https://nodejs.org (version LTS).
2. Décompresse le dossier du jeu.
3. Lance le jeu :
   - **Windows** : double-clique sur `lancer.bat`. Il te demande le port (Entrée pour garder 3000).
   - **Mac / Linux** : `./lancer.sh` dans un terminal, ou `./lancer.sh 8080` pour donner le port directement.
4. Ouvre http://localhost:3000 (ou le port choisi) dans ton navigateur.

Au premier lancement, les dépendances s'installent automatiquement. Le terminal affiche ensuite l'adresse à donner à tes amis sur le même réseau, par exemple `http://<IP-LOCALE>:8080`.

Avec npm directement, le port se passe avec `--port`, sur tous les systèmes :

```bash
npm install
```

```bash
npm start -- --port 8080
```

Tu peux aussi utiliser la variable d'environnement `PORT` et choisir le dossier des comptes avec `DATA_DIR` (`./data` par défaut). Si le port est déjà pris, le serveur te le dit : choisis-en un autre.

Sous Windows, accepte la demande du pare-feu au premier lancement, sinon tes amis ne pourront pas se connecter.

## Launcher Windows (ECLIPSE Launcher)

Le dossier `launcher/` contient une application de bureau Electron. Elle affiche l'état du serveur, le nombre de joueurs en ligne et les notes de mise à jour, et un bouton **JOUER** ouvre le jeu dans sa propre fenêtre, en plein écran ou fenêtré (F11 pour basculer). Par défaut, elle se connecte à **https://eclipse.charlesvibe.xyz** ; l'adresse se change dans ses paramètres.

Pour la tester puis créer l'installateur, depuis le dossier `launcher` :

```bash
npm install
```

```bash
npm start
```

```bash
npm run dist
```

`npm run dist` crée dans `launcher/dist/` un installateur (`ECLIPSE-Launcher-Setup-1.2.0.exe`) et une version portable sans installation. Ce sont les fichiers à envoyer à tes amis.

Les notes de mise à jour affichées par le launcher viennent de `server/news.json` sur ton serveur : modifie ce fichier puis redéploie. Le nombre de joueurs et les notes demandent la version 1.2 du serveur (adresses `/api/status` et `/api/news`).

## Lancer avec Visual Studio Code

Ouvre le dossier `eclipse` dans VS Code (Fichier > Ouvrir le dossier).

- **F5** : lance le jeu et ouvre le navigateur. VS Code te demande le port (3000 par défaut).
- **Ctrl + Maj + B** : lance le jeu sans débogueur.
- **Ctrl + Maj + P**, puis « Tâches : Exécuter la tâche » :
  - `ECLIPSE : jeu + lien public` : lance le jeu et un tunnel Cloudflare rapide. Le lien `https://….trycloudflare.com` s'affiche dans le terminal du tunnel.
  - `ECLIPSE : déployer sur mon serveur` : envoie le jeu en SSH et lance `install-serveur.sh` avec ton domaine. Les valeurs proposées par défaut sont déjà remplies : IP, utilisateur, port SSH et domaine. Tes mots de passe SSH et sudo sont demandés dans le terminal.
  - `ECLIPSE : installer cloudflared` : à faire une fois avant le tunnel (winget sur Windows, brew sur Mac).

Les dépendances s'installent toutes seules au premier lancement. Pour modifier les valeurs par défaut du déploiement, change la section `inputs` de `.vscode/tasks.json`.

## Sécurité

Le guide `SECURITE.md` détaille les protections du serveur, les variables de sécurité et la marche à suivre en cas de piratage.

## Panneau d'administration (/admin)

Ouvre `https://ton-domaine/admin` (ou `http://localhost:3000/admin` en local) et connecte-toi avec ton compte de joueur.

**Devenir propriétaire (une seule fois)** : au premier démarrage, le serveur génère un code d'installation. Tu le trouves :
- à la fin de la sortie de `install-serveur.sh` ;
- dans les logs : `journalctl -u eclipse | grep "Code d'installation"` ;
- dans le fichier : `sudo cat /var/lib/eclipse/admin-setup-code.txt` (ou `data/admin-setup-code.txt` en local).

Saisis-le sur /admin : ton compte devient propriétaire, puis le code est supprimé. Tu peux ensuite nommer des modérateurs et des administrateurs depuis Comptes → fiche du joueur → Changer le rôle.

**Rôles** : les modérateurs voient tout, expulsent, réduisent au silence, bannissent jusqu'à 7 jours et gèrent les salons. Les administrateurs gèrent en plus les comptes, les annonces, les notes, la configuration, l'équilibrage et les exports. Le propriétaire peut tout faire, y compris nommer des admins, télécharger la sauvegarde complète et redémarrer le serveur.

Les données d'administration (bans, silences, signalements, configuration, statistiques) sont dans `DATA_DIR/admin.json`, et les notes modifiées depuis le panneau dans `DATA_DIR/news.json`.

### Fonctionnalités (115)

**Tableau de bord** : 1. joueurs en ligne (et invités) · 2. joueurs en partie · 3. salons et parties en cours · 4. comptes inscrits, nouveaux du jour, taille de l'équipe · 5. pic de connexions · 6. durée de fonctionnement · 7. processeur et charge système · 8. mémoire du jeu et du système · 9. temps de calcul par tick avec alerte · 10. trafic réseau · 11. parties du jour et au total · 12. éliminations et % à la tête · 13. signalements ouverts · 14. bans et silences actifs · 15. graphique des joueurs connectés sur 1 h, 6 h ou 24 h · 16. modes les plus joués · 17. cartes les plus jouées · 18. agents les plus choisis · 19. éliminations par arme · 20. inscriptions par jour · 21. parties par jour · 22. informations du serveur · 23. compteurs dans le menu et badge de maintenance.

**Joueurs connectés** : 24. liste en direct · 25. recherche (pseudo, IP, salon) · 26. IP réelle (masquée pour les modérateurs) · 27. salon et état de chaque joueur · 28. stats en direct dans la partie · 29. message privé · 30. expulsion avec motif · 31. silence temporaire · 32. ban du compte et/ou de l'IP · 33. élimination forcée · 34. accès à la fiche du compte.

**Comptes** : 35. liste paginée · 36. recherche · 37. filtres (en ligne, staff, bannis) · 38. tri par colonne · 39. fiche détaillée (stats, skins, sessions, IP, historique des bans) · 40. Éclats (ajouter ou définir), mis à jour en direct chez le joueur · 41. offrir un skin · 42. offrir tous les skins · 43. retirer les skins · 44. remettre les stats à zéro · 45. générer un nouveau mot de passe · 46. renommer · 47. changer le rôle · 48. déconnecter de tous les appareils · 49. supprimer (confirmation par saisie du pseudo) · 50. export CSV.

**Salons et parties** : 51. liste en direct (phase, manche, score, chrono, joueurs, hôte) · 52. détail du salon avec les stats de chaque joueur · 53. salon officiel permanent · 54. lancer la partie · 55. pause et reprise · 56. annuler la manche · 57. terminer la partie avec choix du vainqueur · 58. message au salon · 59. ajouter un bot dans l'équipe de son choix · 60. retirer un bot · 61. réglages (nom, mode, carte, objectif, difficulté) · 62. fermer le salon · 63. expulser ou éliminer depuis le salon.

**Modération** : 64. liste des bans (cible, raison, auteur, expiration) · 65. ban par pseudo · 66. ban par adresse IP · 67. débannir · 68. expiration automatique des bans · 69. durée limitée à 7 jours pour les modérateurs · 70. liste des silences et levée · 71. silence par pseudo · 72. signalements des joueurs (/signaler) · 73. traiter, rouvrir ou supprimer un signalement · 74. sanction directe depuis un signalement · 75. filtre de mots du chat.

**Chat** : 76. journal du chat en direct · 77. recherche et filtre par salon · 78. messages filtrés avec le texte original · 79. sanction depuis un message · 80. vider le journal.

**Annonces** : 81. annonce globale affichée en jeu et dans les menus · 82. message du jour dans le menu JOUER · 83. message privé à un joueur.

**Notes de mise à jour** : 84. ajouter · 85. modifier · 86. supprimer · 87. réordonner · 88. publication directe dans le launcher.

**Configuration** : 89. mode maintenance avec message (le public est déconnecté) · 90. ouvrir ou fermer les inscriptions · 91. autoriser ou non les invités · 92. création de salons par les invités · 93. activer ou couper le chat · 94. nombre maximum de joueurs · 95. nombre maximum de salons · 96. multiplicateur d'Éclats (événements) · 97. Éclats offerts à l'inscription · 98. durées des manches en Assaut (achat, manche, Noyau) · 99. durées en Duel · 100. équilibrage des armes (dégâts, multiplicateur tête) avec retour aux valeurs par défaut · 101. remise à zéro des statistiques globales.

**Journaux** : 102. événements en direct · 103. filtres par type et recherche · 104. audit des actions du staff · 105. export JSON.

**Système** : 106. sauvegarde complète téléchargeable · 107. redémarrage du serveur · 108. liste de l'équipe · 109. explication des rôles.

**Sécurité** : 110. trois rôles avec permissions distinctes · 111. code d'installation pour le premier propriétaire · 112. limite des tentatives de connexion · 113. impossible d'agir sur un membre de rang égal ou supérieur · 114. vraie IP des joueurs derrière Cloudflare · 115. session admin séparée du jeu et actualisation automatique toutes les 3 secondes.

## Installer sur un serveur Linux avec un tunnel Cloudflare

Depuis ton PC, envoie l'archive sur le serveur, puis connecte-toi en SSH :

```bash
scp eclipse-jeu.zip utilisateur@mon-serveur:~
```

```bash
ssh utilisateur@mon-serveur
```

Sur le serveur :

```bash
unzip eclipse-jeu.zip && cd eclipse
```

```bash
sudo ./install-serveur.sh --hostname jeu.mondomaine.fr
```

Le script :
1. affiche les ports TCP en écoute et choisit le premier libre à partir de 3000 (`--port 4000` pour imposer le tien) ;
2. installe Node.js si besoin, puis le jeu dans `/opt/eclipse`, avec les comptes dans `/var/lib/eclipse` ;
3. crée le service systemd `eclipse`, qui écoute uniquement en local : seul le tunnel y accède ;
4. gère Cloudflare selon ce qu'il trouve :
   - **config locale existante** (`config.yml`) : il ajoute la route `jeu.mondomaine.fr → http://localhost:PORT` après une sauvegarde, la fait valider par `cloudflared`, crée le DNS puis redémarre `cloudflared` ;
   - **tunnel géré depuis le tableau de bord** (installé avec un jeton) : il affiche les 4 clics pour ajouter la route ;
   - **aucun tunnel** : il propose d'installer `cloudflared` et d'en créer un.

Pour mettre à jour le jeu, relance le script depuis le nouveau dossier : le port et les comptes sont conservés. Pour désinstaller : `sudo ./install-serveur.sh --uninstall`.

## Mettre à jour le serveur (une seule commande)

Envoie le nouveau `eclipse-jeu.zip` dans ton dossier personnel sur le serveur, puis, **dans ton terminal SSH** (c'est toi qui tapes le mot de passe sudo) :

```bash
cd ~ && rm -rf maj-eclipse && mkdir maj-eclipse && cd maj-eclipse && unzip -q ~/eclipse-jeu.zip && sudo bash eclipse/mettre-a-jour.sh
```

Le script `mettre-a-jour.sh` :
1. vérifie que l'archive est intacte ;
2. trouve l'installation actuelle (service `eclipse`, ou jeu lancé à la main) ;
3. sauvegarde les comptes et l'ancien code dans `/var/backups/eclipse/` ;
4. installe la nouvelle version à côté de l'ancienne, puis bascule ;
5. vérifie que le jeu répond, avec la bonne version et le même nombre de comptes ;
6. **en cas d'échec, remet automatiquement l'ancienne version**.

Il ne modifie ni les comptes ni la configuration Cloudflare. Les 2 dernières versions sont gardées (`/opt/eclipse.ancien-…`).

## Mise à jour automatique depuis GitHub

Une fois le jeu installé (`install-serveur.sh`), le serveur peut se mettre à jour tout seul à chaque nouveau commit sur la branche `main` :

```bash
cd ~/eclipse-deploy && sudo bash scripts/installer-maj-auto.sh
```

Le script crée une **clé de déploiement en lecture seule** (à ajouter dans GitHub → Settings → Deploy keys, sans cocher « Allow write access »), puis active un minuteur systemd qui vérifie GitHub **toutes les 5 minutes**. À chaque nouveau commit :

1. s'il y a des parties en cours, la mise à jour attend qu'elles se terminent (6 heures au maximum) ;
2. les comptes et l'ancien code sont sauvegardés dans `/var/backups/eclipse/` (10 sauvegardes gardées) ;
3. l'intégrité des fichiers est vérifiée, puis la nouvelle version est installée à côté de l'ancienne ;
4. si le jeu ne redémarre pas correctement, **l'ancienne version est remise automatiquement**, et ce commit n'est plus retenté.

Les comptes (`/var/lib/eclipse`) ne sont jamais modifiés. Le code du dépôt n'est jamais exécuté en root : les scripts de mise à jour sont figés dans `/usr/local/sbin` lors de l'installation (relance `installer-maj-auto.sh` à la main pour les mettre à jour).

| Action | Commande |
|---|---|
| Voir ce qu'il se passe | `journalctl -u eclipse-maj-auto -f` |
| Vérifier tout de suite | `sudo systemctl start eclipse-maj-auto.service` |
| Mettre en pause | `sudo systemctl disable --now eclipse-maj-auto.timer` |
| Désinstaller | `sudo bash scripts/installer-maj-auto.sh --uninstall` |

**Avant chaque commit** qui modifie `public/` ou `shared/`, régénère le manifeste avec `node scripts/integrity.mjs` (avec `node_modules` installé). Sinon, la mise à jour est refusée et le site reste sur la version précédente.

**Sécurité** : toute personne capable de pousser sur `main` décide de ce qui tourne sur le serveur. Protège le compte GitHub (mot de passe unique, double authentification) et n'ajoute de collaborateurs qu'en confiance.

## Lancer avec Docker

```bash
docker compose up -d --build
```

Pour un port personnalisé (ici 8080) :

```bash
ECLIPSE_PORT=8080 docker compose up -d --build
```

Sans compose :

```bash
docker build -t eclipse-tactics .
```

```bash
docker run -d --name eclipse -p 8080:3000 -v eclipse-data:/data eclipse-tactics
```

Dans `-p 8080:3000`, le premier nombre est le port de ton PC et le second celui du conteneur : ne change que le premier.

- Les comptes sont stockés dans le volume `/data` (`accounts.json`) et survivent aux redémarrages et aux mises à jour de l'image.
- Le conteneur tourne avec l'utilisateur non-root `node` et expose un healthcheck sur `/healthz`.
- `docker stop` déclenche un arrêt propre : les comptes sont écrits sur disque avant la fermeture.

## Paramètres du jeu

L'onglet **PARAMÈTRES**, aussi accessible en partie via Échap puis PARAMÈTRES, propose :

- **Souris** : sensibilité (saisie précise possible), multiplicateur en lunette, inversion de l'axe vertical.
- **Touches** : toutes les commandes sont réassignables, clavier et boutons de souris.
- **Viseur** : couleur, opacité, longueur, épaisseur, écart, style T, point central, contour, viseur dynamique, modèles prédéfinis et code à copier ou importer.
- **Vidéo** : FOV horizontal, FOV de l'arme, résolution de rendu, luminosité, qualité.
- **Interface** : mini-carte, marqueur de touche, compteur de FPS, balancement de l'arme, arme à gauche, couleur des ennemis (options pour daltoniens).
- **Audio** : volume général, son de touche.

Les réglages sont enregistrés dans le navigateur et s'appliquent en direct.

## Jouer à plusieurs

Partage l'adresse du serveur, par exemple `http://<IP-LOCALE>:3000` sur ton réseau local. Pour jouer en ligne, héberge le conteneur sur un service qui accepte les WebSockets (VPS, Render, Railway, Fly.io…). Derrière un reverse proxy HTTPS, transmets les en-têtes `Upgrade` et `Connection` sur le chemin `/ws`. Le client passe automatiquement en `wss://` quand la page est servie en HTTPS.

## Commandes

Commandes par défaut, modifiables dans PARAMÈTRES > TOUCHES :

| Touche | Action |
|---|---|
| ZQSD / WASD | Se déplacer (positions physiques, compatible AZERTY) |
| Espace / C / Maj | Sauter / s'accroupir / marcher sans bruit |
| Clic gauche / clic droit | Tirer / lunette (Longbow) |
| R · 1 2 3 · molette | Recharger · changer d'arme |
| A (Q en QWERTY) · E · X | Capacités et ultime |
| F (maintenir) | Poser ou désamorcer le Noyau |
| B · Tab · Entrée · Échap | Achat · scores · chat · pause |

## Structure

```
server/   server.js (HTTP + WebSocket, lobby, salons), match.js (règles), bot.js (IA), accounts.js (comptes)
shared/   data.js (armes, agents, skins), maps.js (cartes ASCII + A*), physics.js (collisions, rayons)
public/   index.html, css/, js/ (main.js menus, game.js moteur, models.js modèles 3D, audio.js sons)
```

Les cartes sont définies en ASCII dans `shared/maps.js` : `#` mur, `.` sol, `c` et `C` caisses, `A` et `B` sites, `T` et `D` spawns. Ajouter une carte revient à ajouter une grille.
