#!/usr/bin/env bash
# =====================================================================
#  ECLIPSE — mise à jour automatique depuis GitHub
#
#  Installé dans /usr/local/sbin/eclipse-maj-auto par scripts/installer-maj-auto.sh,
#  et lancé toutes les 5 minutes par le minuteur systemd « eclipse-maj-auto.timer ».
#
#  1. récupère la branche main du dépôt (HTTPS)
#  2. s'il y a un nouveau commit : attend la fin des parties en cours (6 h au maximum)
#  3. l'installe avec /usr/local/sbin/eclipse-maj (sauvegarde, intégrité, bascule, retour arrière)
#  4. un commit en échec n'est jamais réessayé : on attend le commit suivant
#
#  Les comptes (/var/lib/eclipse) ne sont jamais modifiés. Journal : journalctl -u eclipse-maj-auto
# =====================================================================
set -uo pipefail

REPO_DIR=/opt/eclipse-git
STATE_DIR=/var/lib/eclipse-maj
BRANCH=${ECLIPSE_BRANCH:-main}
MAX_WAIT_MIN=${ECLIPSE_MAX_WAIT_MIN:-360}
UPDATER=${ECLIPSE_UPDATER:-/usr/local/sbin/eclipse-maj}
UNIT_FILE=/etc/systemd/system/eclipse.service
export GIT_TERMINAL_PROMPT=0

log() { echo "[maj-auto] $*"; }

mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
# une seule mise à jour à la fois
exec 9>"$STATE_DIR/lock"
flock -n 9 || { log "Une mise à jour est déjà en cours."; exit 0; }

[ -d "$REPO_DIR/.git" ] || { log "Dépôt $REPO_DIR absent : lance d'abord scripts/installer-maj-auto.sh."; exit 1; }
[ -x "$UPDATER" ] || { log "Programme de mise à jour $UPDATER absent."; exit 1; }

# connexion à GitHub : HTTPS, le certificat est vérifié par git (aucune clé)
git -C "$REPO_DIR" fetch --quiet origin "$BRANCH" || { log "Impossible de lire le dépôt sur GitHub (réseau, ou accès au dépôt privé refusé)."; exit 1; }

NEW=$(git -C "$REPO_DIR" rev-parse "origin/$BRANCH")
CUR=$(cat "$STATE_DIR/deployed" 2>/dev/null || true)
[ "$NEW" = "$CUR" ] && exit 0
if [ "$(cat "$STATE_DIR/failed" 2>/dev/null || true)" = "$NEW" ]; then exit 0; fi

# parties en cours : on attend qu'elles se terminent (au plus MAX_WAIT_MIN minutes)
PORT=$(sed -nE 's/^Environment=PORT=([0-9]+).*/\1/p' "$UNIT_FILE" 2>/dev/null | head -n1)
MATCHES=$(node -e "require('http').get('http://127.0.0.1:${PORT:-3000}/api/status', r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { console.log(JSON.parse(s).matches || 0); } catch { console.log(0); } process.exit(0); }); }).on('error', () => { console.log(0); process.exit(0); })" 2>/dev/null || echo 0)
if [ "${MATCHES:-0}" -gt 0 ] 2>/dev/null; then
  [ -f "$STATE_DIR/pending-$NEW" ] || date +%s > "$STATE_DIR/pending-$NEW"
  WAITED=$(( ( $(date +%s) - $(cat "$STATE_DIR/pending-$NEW") ) / 60 ))
  if [ "$WAITED" -lt "$MAX_WAIT_MIN" ]; then
    log "Nouveau commit ${NEW:0:7} : $MATCHES partie(s) en cours, mise à jour reportée (attente : $WAITED min)."
    exit 0
  fi
  log "Des parties sont toujours en cours après $MAX_WAIT_MIN min : mise à jour quand même."
fi

git -C "$REPO_DIR" checkout --quiet --force --detach "$NEW" && git -C "$REPO_DIR" clean -fdq || { log "Impossible de préparer le commit ${NEW:0:7}."; exit 1; }
log "Déploiement du commit ${NEW:0:7} : $(git -C "$REPO_DIR" log -1 --format=%s "$NEW")"

if "$UPDATER" --source "$REPO_DIR" --auto; then
  echo "$NEW" > "$STATE_DIR/deployed"
  rm -f "$STATE_DIR"/pending-* "$STATE_DIR/failed"
  log "Commit ${NEW:0:7} en ligne."
else
  echo "$NEW" > "$STATE_DIR/failed"
  rm -f "$STATE_DIR"/pending-*
  log "Échec du commit ${NEW:0:7} : l'ancienne version reste en place. Il ne sera pas réessayé ; pousse un correctif."
  exit 1
fi
