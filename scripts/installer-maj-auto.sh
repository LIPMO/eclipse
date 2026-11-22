#!/usr/bin/env bash
# =====================================================================
#  ECLIPSE — installation de la mise à jour automatique depuis GitHub
#
#  À lancer UNE fois, depuis le dossier du jeu, après install-serveur.sh :
#     sudo bash scripts/installer-maj-auto.sh
#
#  - crée une clé de déploiement GitHub en LECTURE SEULE pour root
#  - vérifie l'empreinte de GitHub via son API officielle (HTTPS)
#  - clone le dépôt dans /opt/eclipse-git
#  - installe une copie figée des scripts de mise à jour dans /usr/local/sbin
#    (le code poussé sur GitHub n'est jamais exécuté en root)
#  - active le minuteur systemd « eclipse-maj-auto.timer » (toutes les 5 minutes)
#
#  Options : --repo URL (par défaut git@github.com:LIPMO/eclipse.git), --uninstall
# =====================================================================
set -euo pipefail

REPO_URL=git@github.com:LIPMO/eclipse.git
REPO_DIR=/opt/eclipse-git
STATE_DIR=/var/lib/eclipse-maj
DEPLOY_KEY=/root/.ssh/eclipse_deploy
KNOWN_HOSTS=/root/.ssh/known_hosts_github
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNINSTALL=0

log()  { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO_URL=${2:-}; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) die "Option inconnue : $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "Lance ce script avec sudo : sudo bash scripts/installer-maj-auto.sh"

if [ "$UNINSTALL" = 1 ]; then
  systemctl disable --now eclipse-maj-auto.timer 2>/dev/null || true
  rm -f /etc/systemd/system/eclipse-maj-auto.service /etc/systemd/system/eclipse-maj-auto.timer
  rm -f /usr/local/sbin/eclipse-maj /usr/local/sbin/eclipse-maj-auto
  systemctl daemon-reload
  ok "Mise à jour automatique désactivée. Le jeu continue de tourner normalement."
  warn "Pense à supprimer la clé « serveur ECLIPSE » dans GitHub → Settings → Deploy keys."
  exit 0
fi

[ -f /etc/systemd/system/eclipse.service ] || die "Le jeu n'est pas installé en service : lance d'abord install-serveur.sh."
for c in git curl node ssh-keygen ssh-keyscan flock; do command -v "$c" >/dev/null 2>&1 || die "Commande manquante : $c (sudo apt install -y git curl util-linux openssh-client)"; done
[ -f "$SRC/mettre-a-jour.sh" ] && [ -f "$SRC/scripts/maj-auto.sh" ] || die "Lance ce script depuis le dossier du jeu."

# --- 1. clé de déploiement (lecture seule) ---------------------------------
mkdir -p /root/.ssh; chmod 700 /root/.ssh
if [ ! -f "$DEPLOY_KEY" ]; then
  ssh-keygen -q -t ed25519 -N "" -C "eclipse-maj-auto@$(hostname)" -f "$DEPLOY_KEY"
  ok "Clé de déploiement créée : $DEPLOY_KEY"
fi
chmod 600 "$DEPLOY_KEY"

# --- 2. empreinte de GitHub, récupérée en HTTPS depuis l'API officielle ---------
# empreinte Ed25519 publiée par GitHub (docs.github.com : « GitHub's SSH key fingerprints »)
GITHUB_ED25519_FP="SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU"
log "Récupération des clés SSH officielles de GitHub…"
if curl -fsSL --max-time 20 https://api.github.com/meta 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const k=JSON.parse(s).ssh_keys||[];if(!k.length)process.exit(1);console.log(k.map(x=>'github.com '+x).join('\n'))}catch{process.exit(1)}})" > "$KNOWN_HOSTS.tmp" 2>/dev/null; then
  ok "Clés obtenues depuis l'API de GitHub (HTTPS)."
else
  # secours : clé lue directement, acceptée seulement si son empreinte est celle publiée par GitHub
  warn "API de GitHub indisponible : vérification de la clé par son empreinte publiée."
  ssh-keyscan -t ed25519 github.com 2>/dev/null > "$KNOWN_HOSTS.tmp" || true
  FP=$(ssh-keygen -lf "$KNOWN_HOSTS.tmp" 2>/dev/null | awk '{print $2}')
  [ "$FP" = "$GITHUB_ED25519_FP" ] || { rm -f "$KNOWN_HOSTS.tmp"; die "Empreinte de GitHub inattendue (${FP:-aucune}) : installation annulée par sécurité."; }
  ok "Empreinte de GitHub vérifiée : $FP"
fi
mv "$KNOWN_HOSTS.tmp" "$KNOWN_HOSTS"; chmod 644 "$KNOWN_HOSTS"
ok "Empreinte de GitHub enregistrée ($(wc -l < "$KNOWN_HOSTS") clé(s))."
export GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o StrictHostKeyChecking=yes -o BatchMode=yes"

# --- 3. accès au dépôt ----------------------------------------------------------
if ! git ls-remote "$REPO_URL" main >/dev/null 2>&1; then
  [ -t 0 ] || die "Lance ce script dans un terminal : il faut ajouter la clé sur GitHub."
  echo
  echo "Ajoute cette clé PUBLIQUE sur GitHub, en lecture seule :"
  echo "  1. https://github.com/${REPO_URL#git@github.com:}" | sed 's/\.git$//'
  echo "     → Settings → Deploy keys → Add deploy key"
  echo "  2. Titre : serveur ECLIPSE   ·   NE COCHE PAS « Allow write access »"
  echo "  3. Colle cette ligne :"
  echo
  cat "$DEPLOY_KEY.pub"
  echo
  for i in 1 2 3; do
    read -rp "Appuie sur Entrée quand la clé est ajoutée… " _
    if git ls-remote "$REPO_URL" main >/dev/null 2>&1; then break; fi
    warn "GitHub refuse encore l'accès (tentative $i/3). Vérifie la clé et le dépôt."
    [ "$i" = 3 ] && die "Accès au dépôt impossible : rien n'a été installé."
  done
fi
ok "Accès au dépôt vérifié (lecture seule)."

# --- 4. copie locale du dépôt ---------------------------------------------------
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
  git -C "$REPO_DIR" fetch --quiet origin main
else
  git clone --quiet --branch main "$REPO_URL" "$REPO_DIR"
fi
chown -R root:root "$REPO_DIR"; chmod 700 "$REPO_DIR"
ok "Dépôt prêt : $REPO_DIR"

# --- 5. scripts figés (le code du dépôt n'est jamais lancé en root) --------------
install -m 755 -o root -g root "$SRC/mettre-a-jour.sh" /usr/local/sbin/eclipse-maj
install -m 755 -o root -g root "$SRC/scripts/maj-auto.sh" /usr/local/sbin/eclipse-maj-auto
ok "Scripts installés : /usr/local/sbin/eclipse-maj et /usr/local/sbin/eclipse-maj-auto"

# la version déjà installée est-elle identique à GitHub ? (évite un redémarrage inutile)
mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
HEAD_SHA=$(git -C "$REPO_DIR" rev-parse origin/main)
APP_DIR=$(sed -nE 's/^WorkingDirectory=(.*)$/\1/p' /etc/systemd/system/eclipse.service | head -n1)
if [ -n "$APP_DIR" ] && cmp -s <(git -C "$REPO_DIR" show origin/main:integrity.json 2>/dev/null) "$APP_DIR/integrity.json" \
   && cmp -s <(git -C "$REPO_DIR" show origin/main:server/server.js 2>/dev/null) "$APP_DIR/server/server.js"; then
  echo "$HEAD_SHA" > "$STATE_DIR/deployed"
  ok "La version installée correspond déjà au dernier commit (${HEAD_SHA:0:7})."
else
  rm -f "$STATE_DIR/deployed"
  log "La version installée diffère de GitHub : elle sera mise à jour au premier passage du minuteur."
fi

# --- 6. minuteur systemd ---------------------------------------------------------
cat > /etc/systemd/system/eclipse-maj-auto.service <<'EOF'
[Unit]
Description=ECLIPSE - mise à jour automatique depuis GitHub
After=network-online.target eclipse.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/eclipse-maj-auto
Nice=10
EOF
cat > /etc/systemd/system/eclipse-maj-auto.timer <<'EOF'
[Unit]
Description=ECLIPSE - vérification des mises à jour toutes les 5 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
RandomizedDelaySec=30s

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now eclipse-maj-auto.timer >/dev/null
ok "Minuteur activé : vérification toutes les 5 minutes."

echo
ok "Mise à jour automatique en place."
echo "   Voir ce qu'il se passe   : journalctl -u eclipse-maj-auto -f"
echo "   Vérifier maintenant      : sudo systemctl start eclipse-maj-auto.service"
echo "   Mettre en pause          : sudo systemctl disable --now eclipse-maj-auto.timer"
echo "   Désinstaller             : sudo bash scripts/installer-maj-auto.sh --uninstall"
