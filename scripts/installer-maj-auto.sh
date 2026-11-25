#!/usr/bin/env bash
# =====================================================================
#  ECLIPSE — installation de la mise à jour automatique depuis GitHub
#
#  À lancer UNE fois, depuis le dossier du jeu, après install-serveur.sh :
#     sudo bash scripts/installer-maj-auto.sh
#
#  - clone le dépôt en HTTPS dans /opt/eclipse-git (le certificat HTTPS de GitHub
#    est vérifié automatiquement par git : aucune clé ni empreinte à gérer)
#  - installe une copie figée des scripts de mise à jour dans /usr/local/sbin
#    (le code poussé sur GitHub n'est jamais exécuté en root)
#  - active le minuteur systemd « eclipse-maj-auto.timer » (toutes les 5 minutes)
#
#  Dépôt privé : le serveur doit pouvoir le lire. Soit tu clones toi-même /opt/eclipse-git
#  avant de lancer ce script (il réutilise alors ce clone), soit tu enregistres un jeton
#  GitHub en lecture seule (voir README, « Mise à jour automatique depuis GitHub »).
#
#  Options : --repo URL (par défaut https://github.com/LIPMO/eclipse.git), --uninstall
# =====================================================================
set -euo pipefail

REPO_URL=https://github.com/LIPMO/eclipse.git
REPO_SET=0
REPO_DIR=/opt/eclipse-git
STATE_DIR=/var/lib/eclipse-maj
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNINSTALL=0

log()  { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO_URL=${2:-}; REPO_SET=1; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) die "Option inconnue : $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "Lance ce script avec sudo : sudo bash scripts/installer-maj-auto.sh"

if [ "$UNINSTALL" = 1 ]; then
  systemctl disable --now eclipse-maj-auto.timer eclipse-maj-demande.path 2>/dev/null || true
  rm -f /etc/systemd/system/eclipse-maj-auto.service /etc/systemd/system/eclipse-maj-auto.timer /etc/systemd/system/eclipse-maj-demande.service /etc/systemd/system/eclipse-maj-demande.path
  rm -f /usr/local/sbin/eclipse-maj /usr/local/sbin/eclipse-maj-auto /usr/local/sbin/eclipse-maj-demande
  rm -rf /var/lib/eclipse-statut
  systemctl daemon-reload
  ok "Mise à jour automatique désactivée. Le jeu continue de tourner normalement."
  warn "Si tu avais enregistré un jeton GitHub, supprime /root/.git-credentials et révoque le jeton sur GitHub."
  exit 0
fi

[ -f /etc/systemd/system/eclipse.service ] || die "Le jeu n'est pas installé en service : lance d'abord install-serveur.sh."
for c in git node flock; do command -v "$c" >/dev/null 2>&1 || die "Commande manquante : $c (sudo apt install -y git util-linux)"; done
[ -f "$SRC/mettre-a-jour.sh" ] && [ -f "$SRC/scripts/maj-auto.sh" ] && [ -f "$SRC/scripts/maj-demande.sh" ] || die "Lance ce script depuis le dossier du jeu."
export GIT_TERMINAL_PROMPT=0 # jamais de question bloquante : un accès refusé s'arrête avec un message clair

# --- 1. accès au dépôt (HTTPS) --------------------------------------------------
# un clone déjà présent (fait à la main) est réutilisé tel quel, sauf si --repo est donné
if [ -d "$REPO_DIR/.git" ] && [ "$REPO_SET" = 0 ]; then REPO_URL=$(git -C "$REPO_DIR" remote get-url origin); fi
# une ancienne installation peut avoir une adresse SSH : on repasse en HTTPS, sans clé
REPO_URL=$(printf %s "$REPO_URL" | sed -E 's#^git@github.com:#https://github.com/#')
if [ -d "$REPO_DIR/.git" ]; then git -C "$REPO_DIR" remote set-url origin "$REPO_URL" 2>/dev/null || true; fi
if ! git ls-remote "$REPO_URL" main >/dev/null 2>&1; then
  echo
  warn "Le serveur ne peut pas lire $REPO_URL."
  echo "   Le dépôt est privé : choisis une des solutions du README (« Mise à jour automatique depuis GitHub ») :"
  echo "   - cloner toi-même le dépôt dans $REPO_DIR, puis relancer ce script ;"
  echo "   - ou enregistrer un jeton GitHub en lecture seule pour root ;"
  echo "   - ou rester sur la mise à jour à la main avec l'archive (mettre-a-jour.sh)."
  die "Rien n'a été installé."
fi
ok "Accès au dépôt vérifié."

# --- 2. copie locale du dépôt ---------------------------------------------------
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
  git -C "$REPO_DIR" fetch --quiet origin main
else
  git clone --quiet --branch main "$REPO_URL" "$REPO_DIR"
fi
chown -R root:root "$REPO_DIR"; chmod 700 "$REPO_DIR"
ok "Dépôt prêt : $REPO_DIR"

# --- 3. scripts figés (le code du dépôt n'est jamais lancé en root) --------------
install -m 755 -o root -g root "$SRC/mettre-a-jour.sh" /usr/local/sbin/eclipse-maj
install -m 755 -o root -g root "$SRC/scripts/maj-auto.sh" /usr/local/sbin/eclipse-maj-auto
install -m 755 -o root -g root "$SRC/scripts/maj-demande.sh" /usr/local/sbin/eclipse-maj-demande
ok "Scripts installés : /usr/local/sbin/eclipse-maj, eclipse-maj-auto et eclipse-maj-demande"

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

# --- 4. minuteur systemd ---------------------------------------------------------
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
# --- 5. mise à jour à distance depuis le panneau d'administration -----------------
# le jeu (utilisateur sans droits) dépose <DATA_DIR>/maj/demande ; systemd lance alors la mise à jour en root.
# l'état est publié dans /var/lib/eclipse-statut (root, lecture seule pour le jeu)
DATA_DIR=$(sed -nE 's/^Environment=DATA_DIR=(.*)$/\1/p' /etc/systemd/system/eclipse.service | head -n1)
APP_USER=$(sed -nE 's/^User=(.*)$/\1/p' /etc/systemd/system/eclipse.service | head -n1)
DATA_DIR=${DATA_DIR:-/var/lib/eclipse}
install -d -m 700 -o "${APP_USER:-eclipse}" -g "${APP_USER:-eclipse}" "$DATA_DIR/maj"
install -d -m 755 -o root -g root /var/lib/eclipse-statut
cat > /etc/systemd/system/eclipse-maj-demande.service <<'EOF'
[Unit]
Description=ECLIPSE - mise à jour demandée depuis l'administration
After=network-online.target eclipse.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/eclipse-maj-demande
Nice=10
EOF
cat > /etc/systemd/system/eclipse-maj-demande.path <<EOF
[Unit]
Description=ECLIPSE - surveille les demandes de mise à jour de l'administration

[Path]
PathExists=$DATA_DIR/maj/demande
Unit=eclipse-maj-demande.service

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now eclipse-maj-auto.timer >/dev/null
systemctl enable --now eclipse-maj-demande.path >/dev/null
systemctl start eclipse-maj-auto.service >/dev/null 2>&1 || true # publie l'état tout de suite
ok "Minuteur activé : vérification toutes les 5 minutes."
ok "Mise à jour à distance activée : bouton « Mettre à jour maintenant » dans l'administration (propriétaire)."

echo
ok "Mise à jour automatique en place."
echo "   Voir ce qu'il se passe   : journalctl -u eclipse-maj-auto -f"
echo "   Vérifier maintenant      : sudo systemctl start eclipse-maj-auto.service"
echo "   Mettre en pause          : sudo systemctl disable --now eclipse-maj-auto.timer"
echo "   Désinstaller             : sudo bash scripts/installer-maj-auto.sh --uninstall"
