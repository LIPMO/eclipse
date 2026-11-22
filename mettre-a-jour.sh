#!/usr/bin/env bash
# =====================================================================
#  ECLIPSE — mise à jour en une commande
#
#  Depuis le dossier décompressé de la NOUVELLE version :
#     sudo bash mettre-a-jour.sh
#
#  1. vérifie que l'archive est intacte (manifeste d'intégrité)
#  2. trouve l'installation actuelle (service systemd « eclipse », ou jeu lancé à la main)
#  3. sauvegarde les comptes et l'ancien code dans /var/backups/eclipse/
#  4. installe la nouvelle version à côté de l'ancienne, puis bascule
#  5. vérifie que le jeu répond, avec la bonne version et le même nombre de comptes
#  6. en cas d'échec : remet automatiquement l'ancienne version
#  Ne touche jamais à la configuration Cloudflare ni aux comptes.
#
#  Options : --port N (si aucune installation n'est trouvée ; 3002 par défaut)
# =====================================================================
set -uo pipefail

SERVICE=eclipse
UNIT_FILE=/etc/systemd/system/$SERVICE.service
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_ROOT=/var/backups/eclipse
WANT_PORT=3002

log()  { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --port) WANT_PORT=${2:-}; shift 2 ;;
    --port=*) WANT_PORT=${1#*=}; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) die "Option inconnue : $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "Lance la mise à jour avec sudo :  sudo bash mettre-a-jour.sh"
[ -f "$SRC_DIR/server/server.js" ] && [ -f "$SRC_DIR/package.json" ] || die "Lance ce script depuis le dossier décompressé de la nouvelle version (celui qui contient server/)."
command -v node >/dev/null 2>&1 || die "Node.js est introuvable. Utilise plutôt install-serveur.sh pour une première installation."
command -v systemctl >/dev/null 2>&1 || die "systemd est nécessaire (systemctl introuvable)."

NEW_VERSION=$(node -p "require('$SRC_DIR/package.json').version")
log "Mise à jour d'ECLIPSE vers la version $NEW_VERSION"

# --- petites fonctions -------------------------------------------------
# GET http://127.0.0.1:PORT/CHEMIN, affiche le corps (Node est toujours là, curl pas forcément)
http_get() {
  node -e "require('http').get('http://127.0.0.1:$1$2', r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { process.stdout.write(s); process.exit(r.statusCode === 200 ? 0 : 1); }); }).on('error', () => process.exit(1))" 2>/dev/null
}
count_accounts() { # $1 = dossier de données
  [ -f "$1/accounts.json" ] || { echo 0; return; }
  node -e "try { const d = JSON.parse(require('fs').readFileSync('$1/accounts.json', 'utf8')); console.log(Object.keys(d.users || {}).length); } catch { console.log('?'); }"
}
wait_healthy() { # $1 = port, $2 = version attendue ; 40 s max
  local i body
  for i in $(seq 1 80); do
    if body=$(http_get "$1" /api/status); then
      if printf '%s' "$body" | grep -q "\"version\":\"$2\""; then return 0; fi
    fi
    sleep 0.5
  done
  return 1
}

# --- 1. intégrité de l'archive ---------------------------------------------
log "Vérification de l'archive…"
if [ -f "$SRC_DIR/integrity.json" ]; then
  (cd "$SRC_DIR" && node scripts/integrity.mjs --verify) || die "L'archive ne correspond pas à son manifeste d'intégrité : mise à jour annulée (rien n'a été modifié)."
else
  warn "Pas de manifeste d'intégrité dans l'archive : vérification impossible."
fi

# --- 2. installation actuelle ------------------------------------------------
MODE=""
if [ -f "$UNIT_FILE" ]; then
  MODE=service
  APP_DIR=$(sed -nE 's/^WorkingDirectory=(.*)$/\1/p' "$UNIT_FILE" | head -n1)
  DATA_DIR=$(sed -nE 's/^Environment=DATA_DIR=(.*)$/\1/p' "$UNIT_FILE" | head -n1)
  PORT=$(sed -nE 's/^Environment=PORT=([0-9]+).*/\1/p' "$UNIT_FILE" | head -n1)
  APP_USER=$(sed -nE 's/^User=(.*)$/\1/p' "$UNIT_FILE" | head -n1)
  [ -n "$APP_DIR" ] && [ -d "$APP_DIR" ] || die "Service trouvé mais dossier du jeu introuvable ($APP_DIR)."
  DATA_DIR=${DATA_DIR:-$APP_DIR/data}; PORT=${PORT:-3000}; APP_USER=${APP_USER:-root}
  ok "Installation trouvée : service « $SERVICE », code $APP_DIR, comptes $DATA_DIR, port $PORT"
else
  PID=""
  # seul un processus dont le dossier contient ECLIPSE est pris en compte (jamais un autre programme Node)
  for P in $(pgrep -f 'node .*server/server\.js' || true); do
    D=$(readlink "/proc/$P/cwd" 2>/dev/null || true)
    if [ -n "$D" ] && grep -q '"name": *"eclipse-tactics"' "$D/package.json" 2>/dev/null; then PID=$P; break; fi
  done
  if [ -n "$PID" ]; then
    MODE=manuel
    APP_DIR=$(readlink "/proc/$PID/cwd")
    ENVV=$(tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null || true)
    DATA_DIR=$(printf '%s\n' "$ENVV" | sed -nE 's/^DATA_DIR=(.*)$/\1/p' | head -n1)
    PORT=$(printf '%s\n' "$ENVV" | sed -nE 's/^PORT=([0-9]+)$/\1/p' | head -n1)
    [ -n "$PORT" ] || PORT=$(tr '\0' ' ' < "/proc/$PID/cmdline" | sed -nE 's/.*--port[= ]([0-9]+).*/\1/p')
    [ -n "$PORT" ] || PORT=$WANT_PORT
    case "$DATA_DIR" in /*) ;; "") DATA_DIR=$APP_DIR/data ;; *) DATA_DIR=$APP_DIR/$DATA_DIR ;; esac
    ok "Jeu lancé à la main trouvé : processus $PID, dossier $APP_DIR, comptes $DATA_DIR, port $PORT"
    warn "Il va être remplacé par un service systemd « $SERVICE » (redémarrage automatique, isolation renforcée)."
  else
    MODE=neuf; PORT=$WANT_PORT; DATA_DIR=/var/lib/eclipse; APP_DIR=""
    warn "Aucune installation d'ECLIPSE trouvée : installation neuve sur le port $PORT (sans toucher à Cloudflare)."
  fi
fi

OLD_VERSION=$( [ -n "$APP_DIR" ] && node -p "require('$APP_DIR/package.json').version" 2>/dev/null || echo "aucune")
ACC_BEFORE=$(count_accounts "$DATA_DIR")
log "Version actuelle : $OLD_VERSION · comptes : $ACC_BEFORE"

# --- 3. sauvegarde -------------------------------------------------------------
BK="$BACKUP_ROOT/$STAMP"
mkdir -p "$BK"; chmod 700 "$BACKUP_ROOT" "$BK"
if [ -d "$DATA_DIR" ]; then
  tar -C "$(dirname "$DATA_DIR")" -czf "$BK/comptes-et-donnees.tar.gz" "$(basename "$DATA_DIR")" || die "Sauvegarde des comptes impossible : mise à jour annulée."
fi
if [ -n "$APP_DIR" ] && [ -d "$APP_DIR" ]; then
  tar -C "$(dirname "$APP_DIR")" --exclude="$(basename "$APP_DIR")/node_modules" -czf "$BK/code-$OLD_VERSION.tar.gz" "$(basename "$APP_DIR")" || die "Sauvegarde du code impossible : mise à jour annulée."
fi
chmod 600 "$BK"/* 2>/dev/null || true
ok "Sauvegarde : $BK"

# --- 4a. installation par le script complet (jeu lancé à la main ou installation neuve) ---
if [ "$MODE" != service ]; then
  if [ "$MODE" = manuel ]; then
    # les comptes de l'ancien dossier sont repris dans /var/lib/eclipse
    if [ "$DATA_DIR" != /var/lib/eclipse ] && [ -f "$DATA_DIR/accounts.json" ]; then
      if [ -f /var/lib/eclipse/accounts.json ]; then
        warn "/var/lib/eclipse contient déjà des comptes : je les garde (ceux de $DATA_DIR restent dans la sauvegarde)."
      else
        mkdir -p /var/lib/eclipse && cp -a "$DATA_DIR/." /var/lib/eclipse/ && ok "Comptes copiés de $DATA_DIR vers /var/lib/eclipse"
      fi
    fi
    log "Arrêt de l'ancien processus ($PID)…"
    kill "$PID" 2>/dev/null; for _ in $(seq 1 20); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
    kill -9 "$PID" 2>/dev/null || true
  fi
  bash "$SRC_DIR/install-serveur.sh" --port "$PORT" --skip-cloudflare || {
    warn "L'installation a échoué."
    [ "$MODE" = manuel ] && warn "Pour relancer l'ancienne version à la main :  cd $APP_DIR && PORT=$PORT node server/server.js"
    die "Les comptes sont intacts (sauvegarde : $BK)."
  }
  wait_healthy "$PORT" "$NEW_VERSION" || die "Le jeu ne répond pas en version $NEW_VERSION (voir : journalctl -u $SERVICE -n 50)."
  ACC_AFTER=$(count_accounts /var/lib/eclipse)
else
# --- 4b. mise à jour du service existant : installation à côté, puis bascule ---
  NEW_DIR="$APP_DIR.nouveau"
  rm -rf "$NEW_DIR"; mkdir -p "$NEW_DIR"
  tar -C "$SRC_DIR" --exclude=./node_modules --exclude=./data --exclude=./.git --exclude=./launcher -cf - . | tar -C "$NEW_DIR" -xf - || die "Copie des fichiers impossible."
  # mêmes dépendances que la version actuelle : on réutilise node_modules (rapide, sans Internet)
  if [ -d "$APP_DIR/node_modules" ] && cmp -s "$APP_DIR/package-lock.json" "$NEW_DIR/package-lock.json"; then
    cp -a "$APP_DIR/node_modules" "$NEW_DIR/" && ok "Dépendances reprises de la version actuelle."
  else
    log "Installation des dépendances (npm)…"
    (cd "$NEW_DIR" && npm ci --omit=dev --no-audit --no-fund) || { rm -rf "$NEW_DIR"; die "npm a échoué : rien n'a été modifié, l'ancienne version tourne toujours."; }
  fi
  (cd "$NEW_DIR" && node scripts/integrity.mjs --verify) || { rm -rf "$NEW_DIR"; die "Fichiers installés non conformes : rien n'a été modifié."; }
  chown -R root:root "$NEW_DIR"
  OLD_DIR="$APP_DIR.ancien-$OLD_VERSION-$STAMP"
  log "Bascule vers la version $NEW_VERSION…"
  systemctl stop "$SERVICE"
  mv "$APP_DIR" "$OLD_DIR" && mv "$NEW_DIR" "$APP_DIR" || { [ -d "$OLD_DIR" ] && [ ! -d "$APP_DIR" ] && mv "$OLD_DIR" "$APP_DIR"; systemctl start "$SERVICE"; die "Bascule impossible : ancienne version relancée."; }
  systemctl start "$SERVICE"
  if ! wait_healthy "$PORT" "$NEW_VERSION"; then
    warn "La nouvelle version ne démarre pas correctement. Journal :"
    journalctl -u "$SERVICE" -n 30 --no-pager 2>/dev/null || true
    warn "Retour automatique à la version $OLD_VERSION…"
    systemctl stop "$SERVICE"
    mv "$APP_DIR" "$APP_DIR.echec-$NEW_VERSION-$STAMP" && mv "$OLD_DIR" "$APP_DIR"
    systemctl start "$SERVICE"
    if wait_healthy "$PORT" "$OLD_VERSION"; then die "Mise à jour annulée : la version $OLD_VERSION tourne de nouveau, comptes intacts. Envoie le journal ci-dessus."
    else die "Attention : l'ancienne version ne redémarre pas non plus. Sauvegarde complète : $BK"; fi
  fi
  ACC_AFTER=$(count_accounts "$DATA_DIR")
  # garde les 2 dernières anciennes versions, supprime les plus vieilles
  ls -1dt "$APP_DIR".ancien-* 2>/dev/null | tail -n +3 | xargs -r rm -rf
fi

# --- 5. bilan ------------------------------------------------------------------
echo
STATUS=$(http_get "$PORT" /api/status || true)
ok "ECLIPSE $NEW_VERSION fonctionne sur le port $PORT."
echo "   Réponse du serveur : $STATUS"
if [ "$ACC_BEFORE" = "$ACC_AFTER" ]; then ok "Comptes : $ACC_AFTER (aucun perdu)."
else warn "Comptes avant : $ACC_BEFORE, après : $ACC_AFTER. Les comptes d'avant sont dans $BK/comptes-et-donnees.tar.gz"; fi
if journalctl -u "$SERVICE" -n 80 --no-pager 2>/dev/null | grep -q 'FICHIER MODIFIÉ\|FICHIER INCONNU'; then
  warn "Le journal signale des fichiers non conformes : vérifie avec  journalctl -u $SERVICE | grep SÉCURITÉ"
else
  ok "Intégrité vérifiée par le serveur au démarrage."
fi
echo "   Sauvegarde        : $BK"
echo "   Journal en direct : journalctl -u $SERVICE -f"
echo "   Le site public (tunnel Cloudflare) n'a pas été modifié : il affiche la nouvelle version immédiatement."
echo "   Dans le navigateur, fais Ctrl+F5 si l'ancienne page reste affichée."
