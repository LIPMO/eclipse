# ECLIPSE — shooter tactique multijoueur (navigateur)

Jeu de tir tactique original, jouable dans le navigateur : agents à capacités, manches avec phase d'achat, pose et désamorçage du Noyau, skins d'armes, comptes joueurs. Serveur Node.js autoritaire (WebSocket) et rendu Three.js.

## Contenu

- **5 modes**
  - **Assaut 5v5** : les attaquants posent le Noyau sur le site A ou B, les défenseurs le désamorcent. Économie, changement de côté à la mi-temps.
  - **Duel 1v1** : sur 3 petites cartes (FOSSE, CUBE, IGLOO). Victoire à l'élimination, 9000 crédits à chaque manche. Si le temps est écoulé, la manche revient au joueur qui a le plus de PV.
  - **Mêlée** : chacun pour soi, réapparition au bout de 3 s, toutes les armes gratuites.
  - **Dernier debout** : chacun pour soi avec des vies limitées (3 par défaut) ; le dernier joueur encore en jeu gagne.
  - **Gun Game** : chacun pour soi, une arme par niveau (8 armes), chaque élimination donne la suivante ; le premier qui élimine au couteau gagne.
- **Duel rapide** : un bouton apparie automatiquement deux joueurs et lance la partie.
- **7 cartes** : DUNE, NÉON, GLACIER, TEMPLE (5v5) et FOSSE, CUBE, IGLOO (duel).
- **13 agents** avec 2 capacités et un ultime chacun : fumées, flash, incendiaire, ruée, téléportation, mur de glace, invisibilité, révélation, élan, givre, blizzard…
- **Killcam** des 3 dernières secondes avant la mort, **marqueur de position** au clic molette.
- **Clans** (tag, rôles, chat de clan, classement) et **tournois** à élimination directe créés depuis l'administration.
- **Version téléphone** : joystick, visée au doigt, boutons d'action réglables.
- **Champ de tir**, émotes, vote de carte et revanche, options de salon (munitions infinies, têtes uniquement, gravité basse…).
- **Profils** (bannière, devise, vitrine, statistiques par mode et par arme), joueurs récents, cadeaux, recommandations, boutique du jour.
- **Paramètres** : recherche, profils de réglages, export par code, sauvegarde sur le compte, volumes par catégorie, filtres daltoniens, mode streamer.
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

## Launcher (ECLIPSE Launcher 2)

Le dossier `launcher/` contient l'application de bureau (Electron). Elle se connecte par défaut à **https://eclipseee.online** et propose :

- l'état du serveur, les joueurs en ligne, les notes de mise à jour et la **boutique du jour** (bouton « Voir en jeu ») ;
- un bouton **JOUER** (ou Entrée) qui ouvre le jeu dans sa propre fenêtre, en plein écran ou fenêtré (F11), position et taille retenues ;
- des réglages de performance : images par seconde illimitées, carte graphique la plus puissante ;
- l'ouverture au démarrage de l'ordinateur (facultative) ;
- la **mise à jour automatique** du launcher (version installée), avec vérification de l'empreinte SHA-512.

**Téléchargement pour les joueurs :** https://eclipseee.online/telecharger (bouton « Télécharger » en bas du site, à côté des CGU).

**Publier une nouvelle version :** change `version` dans `launcher/package.json` (par exemple 2.0.1) et envoie le code sur `main`. GitHub Actions (`.github/workflows/launcher.yml`) voit que cette version n'est pas encore publiée et compile alors Windows (installateur en un clic + portable) et Linux (AppImage), calcule les empreintes SHA-256, ajoute une **attestation de provenance signée** (Sigstore) et publie le tout sur GitHub Releases. Les launchers installés se mettent à jour tout seuls.

**Signature Windows (Authenticode)** : sans certificat de signature de code, Windows affiche l'écran SmartScreen la première fois (« Informations complémentaires » → « Exécuter quand même »). Pour le supprimer, achète un certificat de signature de code et ajoute dans les secrets du dépôt `WIN_CSC_LINK` (fichier .pfx encodé en base64) et `WIN_CSC_KEY_PASSWORD` : la compilation signera alors automatiquement les fichiers Windows.

Pour tester en local, depuis le dossier `launcher` : `npm install` puis `npm start`.

Les notes de mise à jour affichées par le launcher viennent de `server/news.json` sur ton serveur (adresses `/api/status`, `/api/news`, `/api/shop` et `/api/launcher`).

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

### Observer une partie (spectateur staff)

Dans **Joueurs connectés**, **Salons** ou **Anti-triche**, le bouton **👁 Regarder** ouvre le jeu dans un nouvel onglet et te place, invisible, dans la vue du joueur choisi. Il faut être connecté au jeu avec ton compte staff. Le panneau à droite affiche son niveau, son agent, son arme, ses munitions, sa précision, ses tirs à la tête et ses alertes. **X** active les rayons X (tous les ennemis visibles à travers les murs), **V** passe à la 3e personne, **← →** changent de joueur. Tu peux avertir, rendre muet, expulser ou bannir 24 h sans quitter l'observation. Seul le gameplay est transmis : ce n'est pas une capture de l'écran du joueur.

### Anti-triche et alertes Discord

L'onglet **Anti-triche** a un bouton pour désactiver ou réactiver l'anti-triche (à réserver aux tests). Dans **Configuration**, tu règles sa sensibilité et tu peux coller l'adresse d'un webhook Discord (Paramètres du salon → Intégrations → Webhooks) pour recevoir les alertes, signalements, bans et vainqueurs de tournois. Seules les adresses `https://discord.com/api/webhooks/…` sont acceptées.

Variable facultative : `MAX_ACCOUNTS_PER_IP` (3 par défaut) fixe la limite d'inscriptions par adresse IP sur 24 h au premier lancement ; elle se change ensuite dans la configuration.

### Stabilité et maintenance (1.8)
- **Santé du serveur** (Système & métriques) : écriture des données, espace disque, mémoire, vitesse du jeu, erreurs, fichiers vérifiés, sauvegarde, Discord, anti-triche.
- **Sauvegarde automatique** chaque jour dans `data/backups` (comptes, clans, tournois, administration), les 7 dernières sont gardées (réglable). Le propriétaire peut en créer une et les télécharger depuis le panneau.
- **Alerte de lenteur** : le staff (et Discord si coché) est prévenu quand le calcul du jeu dépasse le seuil pendant 15 s.
- **Maintenance programmée** : joueurs prévenus tout de suite puis à 10, 5 et 1 minute ; plus de nouvelle partie dans les 5 dernières minutes.
- **Redémarrer quand plus personne ne joue** : attend la fin des parties en cours avant de redémarrer.
- **Historique de la configuration** avec retour à l'ancienne valeur, **tableau des permissions** par rôle, **annuler une sanction** depuis la fiche d'un compte, exports CSV des bans et des signalements.
- **Erreurs des navigateurs** et **latence par pays** (pays fourni par Cloudflare) dans Système & métriques.
- Limites du chat et des actions sociales réglables dans Configuration.

### Groupes et social (1.9)
- **Groupes** de 4 amis maximum : le chef choisit la partie, les membres le suivent automatiquement dans la même équipe. Chat de groupe : `/g message`, invitation : `/groupe pseudo`.
- **Réactions** (touche H) pour féliciter un coéquipier, **salons favoris**, **menu sur les pseudos du chat**, **message de bienvenue** de clan.
- Menu : raccourcis clavier 1 à 9 (et `?`), visite guidée, thème clair, lecture simple, notifications regroupées.

### Boutique, manette et langue (1.11)
- **Revente** pendant la phase d'achat : prix complet pour ce que tu as acheté pendant la manche, moitié du prix sinon (clic droit sur l'objet ou bouton VENDRE). **Racheter** (N), **3 favoris**, **Prêt** (P) : quand tous les joueurs humains sont prêts, la manche part 3 s plus tard.
- **Armes au sol** : J lâche l'arme en main, les joueurs éliminés laissent tomber leur arme principale ; on ramasse en marchant dessus si l'emplacement est libre (Assaut et Duel).
- **Manette** (API Gamepad, disposition standard) : stick gauche déplacement, stick droit visée, RT tir, LT lunette, A saut, B accroupi, X recharger, Y arme suivante, LB/RB capacités, croix haut ultime, croix bas poser/désamorcer, croix gauche lâcher, croix droite achat, Vue scores, Menu pause. Menus navigables (A valider, B retour, X revendre). Réglages : sensibilité, zone morte, aide à la visée, vibrations.
- **Langue** : PARAMÈTRES → Langue (français ou anglais). La traduction (`public/i18n/en.json`, chargé seulement en anglais) s'applique à tout l'affichage du jeu, y compris aux messages du serveur. Le panneau d'administration, les notes de mise à jour et les pages légales restent en français.
- **En partie** : compteur de joueurs en vie, barres de vie des coéquipiers, temps restant des effets, alerte de munitions, viseur rouge sur un ennemi, rapport de dégâts, bips de fin de manche, alerte de désamorçage impossible, mini-carte tournante/zoomée, grande carte (M), arme précédente (Z), modes bascule, rechargement automatique, couper le chat d'un joueur, défi de visée de 60 s au champ de tir, protection de réapparition de 1,5 s en Mêlée.

### Tests
`npm test` démarre le serveur sur un port libre avec des données temporaires et vérifie l'essentiel (santé, version, sécurité de base, partie contre des bots). GitHub Actions lance ce test, la vérification de la syntaxe et celle d'`integrity.json` à chaque envoi.

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

Envoie le nouveau `eclipse-jeu.zip` dans ton dossier personnel sur le serveur (ou l'archive téléchargée sur GitHub avec **Code → Download ZIP** : le fichier s'appelle alors `eclipse-main.zip` et le dossier `eclipse-main`), puis, **dans ton terminal SSH** (c'est toi qui tapes le mot de passe sudo) :

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

Une fois le jeu installé (`install-serveur.sh`), le serveur peut se mettre à jour tout seul à chaque nouveau commit sur la branche `main`. Il lit le dépôt en **HTTPS** : git vérifie lui-même le certificat de GitHub, il n'y a ni clé SSH ni empreinte à gérer.

**Accès au dépôt privé** : le serveur doit pouvoir lire le dépôt. Trois possibilités :
- **Jeton en lecture seule** : sur GitHub, Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Choisis *Only select repositories* → `eclipse`, puis dans Repository permissions : **Contents : Read-only** (rien d'autre). Ce jeton ne se colle que dans le terminal du serveur, jamais dans un chat ni dans un fichier du dépôt. Il est enregistré en clair dans `/root/.git-credentials` (lisible seulement par root) : révoque-le sur GitHub si le serveur est compromis.
- **Dépôt public** : aucun identifiant n'est nécessaire, mais tout le monde peut alors lire le code.
- **Sans accès à GitHub** : reste sur la mise à jour à la main avec l'archive (section précédente).

### Installation avec le script

Depuis le dossier décompressé de la nouvelle version (par exemple `~/maj-eclipse/eclipse-main`) :

```bash
sudo bash scripts/installer-maj-auto.sh
```

Le script réutilise `/opt/eclipse-git` s'il existe déjà (clone fait à la main), sinon il le clone. Si le dépôt est illisible, il s'arrête sans rien installer.

### Installation entièrement à la main

1. Installe git :

```bash
sudo apt install -y git
```

2. Avec un jeton (dépôt privé), demande à git de retenir l'identifiant de root. Saute cette étape si le dépôt est public :

```bash
sudo git config --global credential.helper store
```

3. Clone le dépôt. Avec un jeton, git demande `Username` (ton pseudo GitHub) puis `Password` : colle le **jeton**, pas ton mot de passe GitHub.

```bash
sudo git clone --branch main https://github.com/LIPMO/eclipse.git /opt/eclipse-git
```

```bash
sudo chmod 700 /opt/eclipse-git
```

4. Installe une copie figée des deux scripts de mise à jour :

```bash
sudo install -m 755 -o root -g root /opt/eclipse-git/mettre-a-jour.sh /usr/local/sbin/eclipse-maj
```

```bash
sudo install -m 755 -o root -g root /opt/eclipse-git/scripts/maj-auto.sh /usr/local/sbin/eclipse-maj-auto
```

5. Crée le service :

```bash
printf '%s\n' '[Unit]' 'Description=ECLIPSE - mise à jour automatique depuis GitHub' 'After=network-online.target eclipse.service' 'Wants=network-online.target' '' '[Service]' 'Type=oneshot' 'ExecStart=/usr/local/sbin/eclipse-maj-auto' 'Nice=10' | sudo tee /etc/systemd/system/eclipse-maj-auto.service > /dev/null
```

6. Crée le minuteur (toutes les 5 minutes) :

```bash
printf '%s\n' '[Unit]' 'Description=ECLIPSE - vérification des mises à jour toutes les 5 minutes' '' '[Timer]' 'OnBootSec=3min' 'OnUnitActiveSec=5min' 'RandomizedDelaySec=30s' '' '[Install]' 'WantedBy=timers.target' | sudo tee /etc/systemd/system/eclipse-maj-auto.timer > /dev/null
```

7. Active-le, puis lance une première vérification et regarde le résultat :

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now eclipse-maj-auto.timer
```

```bash
sudo systemctl start eclipse-maj-auto.service; journalctl -u eclipse-maj-auto -n 30 --no-pager
```

### Fonctionnement

À chaque nouveau commit :

1. s'il y a des parties en cours, la mise à jour attend qu'elles se terminent (6 heures au maximum) ;
2. les comptes et l'ancien code sont sauvegardés dans `/var/backups/eclipse/` (10 sauvegardes gardées) ;
3. l'intégrité des fichiers est vérifiée, puis la nouvelle version est installée à côté de l'ancienne ;
4. si le jeu ne redémarre pas correctement, **l'ancienne version est remise automatiquement**, et ce commit n'est plus retenté.

Les comptes (`/var/lib/eclipse`) ne sont jamais modifiés. Le code du dépôt n'est jamais exécuté en root : les scripts de mise à jour sont figés dans `/usr/local/sbin` (refais l'étape 4, ou relance `installer-maj-auto.sh`, pour les mettre à jour).

| Action | Commande |
|---|---|
| Voir ce qu'il se passe | `journalctl -u eclipse-maj-auto -f` |
| Vérifier tout de suite | `sudo systemctl start eclipse-maj-auto.service` |
| Mettre en pause | `sudo systemctl disable --now eclipse-maj-auto.timer` |
| Désinstaller | `sudo bash scripts/installer-maj-auto.sh --uninstall` (avec un jeton : ensuite `sudo rm /root/.git-credentials` et révocation du jeton sur GitHub) |

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
| Y · T | Chat d'équipe · messages radio |
| Clic molette | Marquer une position pour l'équipe |
| Espace (après la mort) | Passer la killcam |
| V · G | Émotes · inspecter l'arme |
| J · Z · M | Lâcher l'arme · arme précédente · grande carte (maintenir) |
| N · P | Racheter l'équipement précédent · prêt (phase d'achat) / défi de visée (champ de tir) |

Sur téléphone : joystick à gauche, glisser à droite pour viser, boutons d'action à l'écran (Paramètres → Tactile pour la taille, l'opacité et la sensibilité).

## Structure

```
server/   server.js (HTTP + WebSocket, lobby, salons), match.js (règles), bot.js (IA), accounts.js (comptes)
shared/   data.js (armes, agents, skins), maps.js (cartes ASCII + A*), physics.js (collisions, rayons)
public/   index.html, css/, js/ (main.js menus, game.js moteur, models.js modèles 3D, audio.js sons)
```

Les cartes sont définies en ASCII dans `shared/maps.js` : `#` mur, `.` sol, `c` et `C` caisses, `A` et `B` sites, `T` et `D` spawns. Ajouter une carte revient à ajouter une grille.
