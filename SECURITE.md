# Sécurité d'ECLIPSE et intervention après un piratage

Ce guide se suit dans l'ordre. Les commandes se lancent sur le serveur, dans ta session SSH.

## 0. L'attaque « ClickFix » trouvée sur ton site (22/11/2026)

**Ce que j'ai constaté sur https://eclipse.charlesvibe.xyz** : pour les visiteurs Windows uniquement, environ 300 lignes de script sont ajoutées à la fin de la page d'accueil (67 Ko au lieu de 11 Ko). Ce script :
- vérifie que le visiteur n'est pas un robot d'analyse (webdriver, carte graphique, polices, outils de développement…), pour échapper aux antivirus ;
- affiche un faux CAPTCHA et copie dans le presse-papiers une commande à coller avec Windows+R, Ctrl+V, Entrée ;
- cette commande lance PowerShell, qui télécharge et exécute un script depuis **`asgd-serv3.info/velcap5a`** : un voleur de mots de passe, de sessions Discord et de portefeuilles ;
- charge aussi un fichier **`/_r/f/l5xm5s4e.png`** (236 Ko) servi **par ton propre serveur**.

Les en-têtes sont identiques à ceux de ton serveur Node, et le dossier `/_r/` n'a jamais fait partie du jeu. Le pirate a donc **modifié les fichiers sur ta machine** : ce n'est ni une faille XSS du jeu (audit négatif), ni Cloudflare.

**Pour retrouver les fichiers modifiés sur le serveur** :

```bash
sudo grep -rIl --exclude-dir={proc,sys,dev,run} -e "asgd-serv3" -e "_checksFails" -e "captcha-cf" -e "velcap" / 2>/dev/null
```

```bash
sudo find / \( -path /proc -o -path /sys -o -path /dev \) -prune -o -type d -name "_r" -print 2>/dev/null
```

```bash
sudo find /home /opt /var/www /root -type f \( -name "*.js" -o -name "*.html" \) -mtime -30 -newer /etc/hostname 2>/dev/null | grep -v node_modules | head -50
```

**Pour les joueurs qui ont suivi les instructions** (Windows+R, Ctrl+V, Entrée) :
1. Débrancher le PC d'internet.
2. Lancer **Microsoft Defender → Analyse hors ligne**.
3. Depuis un autre appareil sain, changer les mots de passe (e-mail en premier, puis Discord, Steam, banque…), activer la double authentification et déconnecter toutes les sessions.
4. Déplacer les fonds d'un éventuel portefeuille crypto.

En cas de doute, réinstaller Windows.

**Protection ajoutée en 1.4** : le serveur ne sert plus que les fichiers dont l'empreinte SHA-256 correspond au manifeste `integrity.json` livré avec l'archive.
- Une page modifiée ou un fichier ajouté (comme `/_r/…`) n'est jamais envoyé aux joueurs.
- Une alerte « Sécurité » apparaît dans l'admin.
- `install-serveur.sh` refuse d'installer une archive modifiée.
- La CSP bloque tout script ajouté dans la page sans autorisation.

Ces protections n'empêchent pas un pirate **qui contrôle encore ta machine** de tout modifier, serveur compris : réinstaller la machine reste indispensable (section 2).

## 1. Urgence : couper l'accès public

```bash
sudo systemctl stop cloudflared
```

Le site est hors ligne le temps de l'enquête, mais personne ne peut plus passer par le tunnel.

## 2. Comprendre ce qui s'est passé (commandes en lecture seule)

**Les processus `node server.js`**, en particulier celui lancé en **root** (PID 3297665 lors de ta vérification) :

```bash
for p in $(pgrep -f "node .*server"); do echo "PID $p | utilisateur $(ps -o user= -p $p) | lancé il y a $(ps -o etime= -p $p) | dossier $(sudo readlink /proc/$p/cwd)"; done
```

Une appli Node qui tourne en root et qui a une faille donne le contrôle total de la machine. Si tu ne reconnais pas un de ces dossiers, c'est suspect.

**Les connexions SSH réussies** des 14 derniers jours (une IP inconnue = intrusion) :

```bash
sudo journalctl -u ssh --since "14 days ago" | grep -E "Accepted|Invalid user" | tail -40
```

```bash
last -n 30
```

**Les clés SSH autorisées** (une clé que tu n'as pas ajoutée = porte dérobée) :

```bash
cat ~/.ssh/authorized_keys; sudo cat /root/.ssh/authorized_keys 2>/dev/null
```

**Les comptes et les droits administrateur** :

```bash
awk -F: '$3 >= 1000 || $3 == 0 {print $1, $3, $7}' /etc/passwd; getent group sudo; sudo ls -la /etc/sudoers.d
```

**Les tâches planifiées et services ajoutés récemment** :

```bash
crontab -l 2>/dev/null; sudo crontab -l 2>/dev/null; ls -la /etc/cron.d; ls -lt /etc/systemd/system | head -15
```

**Les processus qui consomment le processeur** (mineurs de cryptomonnaie) et les fichiers dans les dossiers temporaires :

```bash
ps -eo pid,user,%cpu,etime,args --sort=-%cpu | head -15; ls -la /tmp /var/tmp /dev/shm
```

**Si tu trouves un processus root inconnu, une clé SSH inconnue ou un compte que tu n'as pas créé**, considère la machine comme compromise. La seule solution sûre est alors la suivante :
1. Sauvegarde les données utiles (le fichier `accounts.json` du jeu).
2. **Réinstalle Ubuntu**.
3. Restaure les données.

Un attaquant qui a eu les droits root peut avoir caché des accès que les commandes ci-dessus ne montrent pas.

## 3. Changer tous les secrets

- **Mot de passe Linux** de ton utilisateur : `passwd`.
- **Compte Cloudflare** : change le mot de passe et active la double authentification.
- **Tunnel Cloudflare** : ses identifiants (`/etc/cloudflared/*.json` ou le jeton) ont pu être lus. Supprime le tunnel puis recrée-le, en relançant `install-serveur.sh` qui sait le faire, ou fais tourner le jeton dans le tableau de bord Zero Trust.
- **Clés SSH** : si tu en avais sur le serveur, régénère-les depuis ton PC.
- **Clé de déploiement** : si tu avais ajouté la clé `claude-eclipse-deploy`, retire-la :

```bash
sed -i '/claude-eclipse-deploy/d' ~/.ssh/authorized_keys
```

## 4. Verrouiller la machine

**SSH par clé uniquement.** Depuis ton PC Windows (PowerShell), crée une clé puis copie-la sur le serveur :

```bash
ssh-keygen -t ed25519
```

```bash
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh <utilisateur>@<IP-DU-SERVEUR> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
```

Vérifie que `ssh <utilisateur>@<IP-DU-SERVEUR>` fonctionne **sans mot de passe** avant de continuer. Ensuite, sur le serveur, interdis les mots de passe et la connexion en root :

```bash
printf "PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\nMaxAuthTries 3\n" | sudo tee /etc/ssh/sshd_config.d/99-durcissement.conf && sudo systemctl reload ssh
```

**Pare-feu.** Le tunnel Cloudflare sort vers internet et n'a besoin d'aucun port ouvert. On n'autorise donc que SSH, et seulement depuis ton réseau local. Attention : si tu administres le serveur depuis l'extérieur de chez toi, adapte la règle, sinon tu te bloques dehors.

```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing && sudo ufw allow from <RESEAU-LOCAL>/24 to any port 22 proto tcp && sudo ufw enable
```

**Blocage automatique des attaques SSH et mises à jour de sécurité automatiques** :

```bash
sudo apt update && sudo apt install -y fail2ban unattended-upgrades && sudo systemctl enable --now fail2ban && sudo dpkg-reconfigure -plow unattended-upgrades
```

**Ne lance plus jamais d'appli Node en root.** Arrête les anciennes copies du jeu lancées à la main (voir la section 5).

## 5. Déployer ECLIPSE 1.4 (version sécurisée) à la place de l'ancienne

L'ancien jeu (PID 299027 lors de ta vérification) écoute sur le port 3002, celui vers lequel pointe ton tunnel.

1. **Repère son dossier et sauvegarde ses comptes** :

```bash
OLD=$(readlink /proc/299027/cwd); echo "$OLD"; ls -la "$OLD/data"
```

```bash
sudo mkdir -p /var/lib/eclipse && sudo cp "$OLD/data/accounts.json" /var/lib/eclipse/ && cp "$OLD/data/accounts.json" ~/accounts-sauvegarde-$(date +%F).json
```

2. **Arrête l'ancien jeu.** S'il revient tout seul, il est relancé par un service : montre-moi `cat /proc/299027/cgroup`.

```bash
kill 299027
```

3. **Installe la version 1.4** sur le même port, depuis le dossier décompressé de la nouvelle archive :

```bash
cd ~/eclipse && sudo bash install-serveur.sh --hostname eclipse.charlesvibe.xyz --port 3002
```

4. **Relance le tunnel** si le script ne l'a pas fait :

```bash
sudo systemctl start cloudflared
```

5. **Vérifie** : https://eclipse.charlesvibe.xyz/api/status doit répondre avec `"version":"1.4.0"`.

À la mise à jour, **toutes les sessions sont invalidées**. Chaque joueur se reconnecte une fois avec son mot de passe, ce qui coupe l'accès à quiconque aurait volé des sessions. Si le fichier des comptes a pu être lu par l'attaquant, demande aussi aux joueurs de **changer leur mot de passe**. Ils sont hachés avec scrypt, mais un mot de passe faible reste devinable.

## 6. Protéger le panneau /admin

**Avec Cloudflare Access (recommandé)** : Zero Trust → Access → Applications → Add an application → Self-hosted. Choisis le domaine `eclipse.charlesvibe.xyz` et le chemin `/admin*`, avec la règle « Emails = ton adresse ». Cloudflare demandera alors un code par e-mail avant même d'afficher la page.

**En complément, restriction par IP** (ajoute la ligne dans `/etc/systemd/system/eclipse.service`, puis `sudo systemctl daemon-reload && sudo systemctl restart eclipse`) :

```
Environment=ADMIN_ALLOWED_IPS=203.0.113.7
```

## Ce qui a été corrigé dans le code (version 1.4)

| Faille | Correction |
|---|---|
| **Une seule trame WebSocket malformée faisait planter tout le serveur** | Erreurs interceptées par connexion, et filet de sécurité global |
| Messages WebSocket jusqu'à 100 Mo acceptés (saturation de la mémoire) | Limite à 16 Ko par message |
| Aucune limite de connexions ni de messages | 16 connexions simultanées par IP, débit limité, inondation coupée automatiquement |
| Mots de passe testables à l'infini | Blocage de l'IP 15 minutes après 8 échecs |
| Création de comptes en masse | 6 inscriptions réussies par IP et par heure |
| Pseudos `__proto__`, `constructor`, `admin`… | Refusés, et données stockées dans des objets sans prototype |
| Jetons de session en clair dans `accounts.json` | Stockés hachés (SHA-256), 5 appareils maximum par compte |
| Mots de passe de 6 caractères | 8 minimum, et les mots de passe courants sont refusés |
| Pas d'en-têtes de sécurité | CSP stricte, anti-iframe, nosniff, HSTS en HTTPS, Permissions-Policy |
| Contrôle des chemins de fichiers imparfait | Vérification avec séparateur, fichiers cachés refusés |
| Connexions WebSocket depuis d'autres sites | Origine vérifiée |
| Pseudos invités libres (usurpation) | Caractères sûrs uniquement, noms réservés interdits |
| Wallhack possible (positions de tous les ennemis envoyées) | Le serveur n'envoie que les ennemis visibles ou entendus |
| PV, argent et porteur du Noyau ennemis envoyés | Réservés aux alliés |
| Speedhack, téléportation, vol | Mouvement vérifié par le serveur, retour en arrière et alerte dans l'admin |
| Spam de chat et de salons | Limites de débit, messages répétés ignorés |
| Connexions lentes (slowloris), méthodes HTTP arbitraires | Délais stricts, seules GET, HEAD et POST pour l'admin sont acceptées |
| Service trop permissif | systemd : aucun privilège, noyau et périphériques inaccessibles, appels système filtrés, fichiers en 600 |

Toutes les alertes apparaissent dans le panneau admin → Journaux → **Sécurité**.

## Variables d'environnement de sécurité

| Variable | Défaut | Rôle |
|---|---|---|
| `MAX_CONN_PER_IP` | 16 | Connexions simultanées par IP (amis derrière la même box) |
| `CONN_BURST_PER_IP` | 40 | Rafale de nouvelles connexions par IP |
| `REGISTRATIONS_PER_HOUR` | 6 | Inscriptions réussies par IP et par heure |
| `ALLOWED_ORIGINS` | — | Autres sites autorisés à se connecter au jeu |
| `ADMIN_ALLOWED_IPS` | — | IP autorisées à ouvrir /admin |
