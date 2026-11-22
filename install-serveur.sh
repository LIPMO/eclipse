#!/usr/bin/env bash
# =====================================================================
#  ECLIPSE — installation sur un serveur Linux + tunnel Cloudflare
#
#  À lancer depuis le dossier décompressé du jeu :
#     sudo ./install-serveur.sh --hostname jeu.mondomaine.fr
#
#  Ce que fait le script :
#   1. liste les ports TCP en écoute et choisit le premier libre (à partir de 3000)
#   2. installe Node.js si nécessaire, puis le jeu dans /opt/eclipse
#   3. crée un service systemd « eclipse » (démarrage auto, redémarrage en cas de crash)
#   4. ajoute le jeu à ta config Cloudflare Tunnel existante (sauvegarde avant
#      modification), crée l'enregistrement DNS et redémarre cloudflared.
#      S'il n'y a pas encore de tunnel, il propose d'en créer un.
#
#  Options :
#     --hostname NOM     domaine public du jeu (ex. jeu.mondomaine.fr)
#     --port N           port à utiliser (sinon : premier port libre à partir de 3000)
#     --start-port N     port à partir duquel chercher un port libre (défaut 3000)
#     --no-tunnel        installe le jeu sans toucher à Cloudflare (écoute sur toutes les interfaces)
#     --skip-cloudflare  écoute sur 127.0.0.1 (derrière un tunnel déjà configuré) sans modifier Cloudflare
#     --uninstall        supprime le service (les comptes dans /var/lib/eclipse sont conservés)
# =====================================================================
set -euo pipefail

APP_DIR=/opt/eclipse
DATA_DIR=/var/lib/eclipse
SERVICE=eclipse
APP_USER=eclipse
UNIT_FILE=/etc/systemd/system/$SERVICE.service
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CF_HOST=""
PORT=""
START_PORT=3000
TUNNEL=1
SKIP_CF=0
UNINSTALL=0

log()  { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------
# Fonctions utilitaires (testables séparément)
# ---------------------------------------------------------------------

# Liste des ports TCP en écoute (un par ligne, triés)
used_ports() {
  {
    if command -v ss >/dev/null 2>&1; then ss -tln | awk 'NR>1 {print $4}'
    elif command -v netstat >/dev/null 2>&1; then netstat -tln 2>/dev/null | awk 'NR>2 {print $4}'
    fi
    # lecture directe du noyau (toujours disponible sous Linux) : état 0A = LISTEN
    { cat /proc/net/tcp /proc/net/tcp6 2>/dev/null || true; } | awk '
      function hex(h,   n, i) { n = 0; h = toupper(h); for (i = 1; i <= length(h); i++) n = n * 16 + index("0123456789ABCDEF", substr(h, i, 1)) - 1; return n }
      NR > 1 && $4 == "0A" { split($2, a, ":"); print "x:" hex(a[2]) }'
  } | sed -nE 's/.*[:.]([0-9]+)$/\1/p' | sort -un || true
}

# Premier port libre à partir de $1 (la liste des ports occupés est passée en $2)
first_free_port() {
  local p=$1 used=$2
  while printf '%s\n' "$used" | grep -qx "$p"; do p=$((p + 1)); done
  printf '%s\n' "$p"
}

# Ajoute (ou met à jour) une route dans un config.yml de cloudflared.
# $1 = fichier, $2 = nom d'hôte, $3 = URL du service. Écrit le résultat sur stdout.
add_ingress() {
  local file=$1 host=$2 svc=$3 host_re
  host_re=$(printf '%s' "$host" | sed 's/[.]/\\./g')
  local out
  if out=$(awk -v h="$host" -v hre="$host_re" -v svc="$svc" '
      BEGIN { done = 0; inh = 0 }
      # entrée existante pour ce nom d hôte : on remplace son service
      $0 ~ "^[[:space:]]*-[[:space:]]*hostname:[[:space:]]*[\"'\'']?" hre "[\"'\'']?[[:space:]]*$" { print; inh = 1; next }
      inh && $0 ~ /^[[:space:]]*service:/ { sub(/service:.*/, "service: " svc); print; inh = 0; done = 1; next }
      inh && $0 ~ /^[[:space:]]*-/ { inh = 0 }
      # règle « attrape-tout » (- service: ... sans hostname) : on insère juste avant
      !done && $0 ~ /^[[:space:]]*-[[:space:]]*service:/ {
        match($0, /^[[:space:]]*/); ind = substr($0, 1, RLENGTH)
        print ind "- hostname: " h
        print ind "  service: " svc
        done = 1
      }
      { print }
      END { if (!done) exit 3 }
    ' "$file"); then
    printf '%s\n' "$out"
    return 0
  fi
  # pas de règle attrape-tout : on ajoute un bloc ingress complet
  if grep -qE '^ingress:' "$file"; then
    cat "$file"
    printf '  - hostname: %s\n    service: %s\n  - service: http_status:404\n' "$host" "$svc"
  else
    cat "$file"
    printf '\ningress:\n  - hostname: %s\n    service: %s\n  - service: http_status:404\n' "$host" "$svc"
  fi
}

# Trouve la configuration cloudflared : affiche « TOKEN », un chemin de fichier, ou rien
find_cf_config() {
  local unit cfg f
  unit=$(systemctl cat cloudflared 2>/dev/null || true)
  if printf '%s' "$unit" | grep -qE -- '--token|TUNNEL_TOKEN'; then echo TOKEN; return; fi
  cfg=$(printf '%s' "$unit" | sed -nE 's/.*--config[= ]+([^ ]+).*/\1/p' | head -n1)
  for f in "$cfg" /etc/cloudflared/config.yml /etc/cloudflared/config.yaml \
           /root/.cloudflared/config.yml /root/.cloudflared/config.yaml \
           ${SUDO_USER:+/home/$SUDO_USER/.cloudflared/config.yml} ${SUDO_USER:+/home/$SUDO_USER/.cloudflared/config.yaml}; do
    if [ -n "$f" ] && [ -f "$f" ]; then echo "$f"; return; fi
  done
}

# Teste l'URL de santé du jeu avec Node (curl n'est pas forcément installé)
health() {
  node -e "require('http').get('http://127.0.0.1:$1/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
}

# Permet de charger uniquement les fonctions (tests)
if [ "${ECLIPSE_LIB_ONLY:-0}" = 1 ]; then return 0 2>/dev/null || exit 0; fi

# ---------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --hostname) CF_HOST=${2:-}; shift 2 ;;
    --hostname=*) CF_HOST=${1#*=}; shift ;;
    --port) PORT=${2:-}; shift 2 ;;
    --port=*) PORT=${1#*=}; shift ;;
    --start-port) START_PORT=${2:-}; shift 2 ;;
    --no-tunnel) TUNNEL=0; shift ;;
    --skip-cloudflare) SKIP_CF=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) die "Option inconnue : $1 (voir --help)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "Lance ce script avec sudo : sudo ./install-serveur.sh"
command -v systemctl >/dev/null 2>&1 || die "systemd est nécessaire (systemctl introuvable)."

if [ "$UNINSTALL" = 1 ]; then
  systemctl disable --now "$SERVICE" 2>/dev/null || true
  rm -f "$UNIT_FILE"; systemctl daemon-reload
  rm -rf "$APP_DIR"
  ok "Service supprimé. Les comptes sont conservés dans $DATA_DIR (supprime-le à la main si tu veux)."
  warn "Pense à retirer la route du jeu dans ta config Cloudflare si tu ne l'utilises plus."
  exit 0
fi

[ -f "$SRC_DIR/server/server.js" ] || die "Lance le script depuis le dossier du jeu (celui qui contient server/)."

# ---------------------------------------------------------------------
# 1. Ports
# ---------------------------------------------------------------------
log "Ports TCP actuellement en écoute :"
USED=$(used_ports)
printf '   %s\n' "$(printf '%s ' $USED)"

EXISTING_PORT=""
if [ -f "$UNIT_FILE" ]; then EXISTING_PORT=$(sed -nE 's/^Environment=PORT=([0-9]+).*/\1/p' "$UNIT_FILE" | head -n1); fi

if [ -n "$PORT" ]; then
  [[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "Port invalide : $PORT"
  if printf '%s\n' "$USED" | grep -qx "$PORT" && [ "$PORT" != "$EXISTING_PORT" ]; then
    die "Le port $PORT est déjà utilisé. Relance sans --port pour en choisir un libre automatiquement."
  fi
elif [ -n "$EXISTING_PORT" ]; then
  PORT=$EXISTING_PORT
  log "ECLIPSE est déjà installé : je garde son port ($PORT)."
else
  PORT=$(first_free_port "$START_PORT" "$USED")
fi
ok "Port choisi pour le jeu : $PORT"

# ---------------------------------------------------------------------
# 2. Node.js
# ---------------------------------------------------------------------
node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
if node_ok; then
  ok "Node.js $(node -v) déjà présent."
else
  log "Installation de Node.js 22…"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y && apt-get install -y ca-certificates curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    dnf install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    yum install -y nodejs
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache nodejs npm
  elif command -v pacman >/dev/null 2>&1; then
    pacman -Sy --noconfirm nodejs npm
  else
    die "Gestionnaire de paquets non reconnu : installe Node.js 18 ou plus, puis relance le script."
  fi
  node_ok || die "L'installation de Node.js a échoué."
  ok "Node.js $(node -v) installé."
fi

# ---------------------------------------------------------------------
# 3. Fichiers du jeu
# ---------------------------------------------------------------------
log "Installation du jeu dans $APP_DIR…"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell "$(command -v nologin || echo /bin/false)" "$APP_USER"
fi
mkdir -p "$APP_DIR" "$DATA_DIR"
if [ "$SRC_DIR" != "$APP_DIR" ]; then
  tar -C "$SRC_DIR" --exclude=./node_modules --exclude=./data --exclude=./.git --exclude=./launcher -cf - . | tar -C "$APP_DIR" -xf -
fi
(cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund)
# vérification d'intégrité : refuse d'installer des fichiers modifiés (archive corrompue ou piratée)
if [ -f "$APP_DIR/integrity.json" ]; then
  (cd "$APP_DIR" && node scripts/integrity.mjs --verify) || die "Des fichiers du jeu ne correspondent pas au manifeste d'intégrité : installation annulée. Utilise une archive officielle intacte."
  ok "Intégrité des fichiers vérifiée."
fi
chown -R root:root "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
chmod 700 "$DATA_DIR"
find "$DATA_DIR" -type f -exec chmod 600 {} + 2>/dev/null || true
ok "Fichiers installés. Comptes joueurs : $DATA_DIR"

# ---------------------------------------------------------------------
# 4. Service systemd
# ---------------------------------------------------------------------
BIND=127.0.0.1
[ "$TUNNEL" = 1 ] || BIND=0.0.0.0
log "Création du service systemd « $SERVICE » (écoute sur $BIND:$PORT)…"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=ECLIPSE - serveur de jeu
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=HOST=$BIND
Environment=DATA_DIR=$DATA_DIR
ExecStart=$(command -v node) server/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR
# isolation renforcée : même en cas de faille dans le jeu, l'attaquant reste enfermé
UMask=0077
CapabilityBoundingSet=
AmbientCapabilities=
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
RemoveIPC=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @mount @debug @cpu-emulation @obsolete @raw-io @reboot @swap
SystemCallErrorNumber=EPERM
LimitNOFILE=8192

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"
for _ in $(seq 1 30); do health "$PORT" && break; sleep 0.5; done
health "$PORT" || { journalctl -u "$SERVICE" -n 30 --no-pager || true; die "Le jeu ne répond pas sur le port $PORT (logs ci-dessus)."; }
ok "Le jeu tourne : http://127.0.0.1:$PORT"

if [ "$TUNNEL" = 0 ]; then
  echo
  ok "Installation terminée (sans tunnel). Accès : http://<ip-du-serveur>:$PORT"
  echo "   Panneau admin : http://<ip-du-serveur>:$PORT/admin"
  [ -f "$DATA_DIR/admin-setup-code.txt" ] && echo "   Code d'installation admin : $(cat "$DATA_DIR/admin-setup-code.txt")"
  warn "Ouvre le port $PORT dans ton pare-feu si nécessaire (ex. : sudo ufw allow $PORT/tcp)."
  exit 0
fi

# ---------------------------------------------------------------------
# 5. Tunnel Cloudflare
# ---------------------------------------------------------------------
if [ "$SKIP_CF" = 1 ]; then
  ok "Configuration Cloudflare non modifiée (--skip-cloudflare) : ton tunnel existant continue de pointer vers localhost:$PORT."
  exit 0
fi
if [ -z "$CF_HOST" ]; then
  if [ ! -t 0 ]; then
    # lancé sans terminal (par un autre programme) : pas de question possible
    warn "Pas de nom de domaine (--hostname) : la configuration Cloudflare n'est pas modifiée."
    ok "Le jeu tourne sur http://127.0.0.1:$PORT"
    exit 0
  fi
  read -rp "Domaine public pour le jeu (ex. jeu.mondomaine.fr) : " CF_HOST
fi
[[ "$CF_HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] || die "Nom de domaine invalide : $CF_HOST"
SVC_URL="http://localhost:$PORT"

restart_cloudflared() {
  if systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared\.service'; then
    systemctl restart cloudflared && ok "cloudflared redémarré."
  else
    warn "Pas de service systemd « cloudflared » : redémarre ton processus cloudflared pour appliquer la nouvelle route."
  fi
}

route_dns() { # $1 = tunnel (id ou nom), $2 = dossier où chercher cert.pem
  local cert="" c
  for c in "$2/cert.pem" /root/.cloudflared/cert.pem /etc/cloudflared/cert.pem ${SUDO_USER:+/home/$SUDO_USER/.cloudflared/cert.pem}; do
    [ -f "$c" ] && { cert=$c; break; }
  done
  if [ -n "$cert" ] && cloudflared tunnel --origincert "$cert" route dns "$1" "$CF_HOST" 2>&1 | tee /tmp/eclipse-cf-dns.log; then
    ok "Enregistrement DNS $CF_HOST créé (ou déjà présent)."
  else
    grep -qi 'already' /tmp/eclipse-cf-dns.log 2>/dev/null && { ok "L'enregistrement DNS $CF_HOST existe déjà."; return; }
    warn "Je n'ai pas pu créer le DNS automatiquement. Dans le tableau de bord Cloudflare (DNS de ton domaine), ajoute :"
    if [[ "$1" =~ ^[0-9a-f-]{36}$ ]]; then
      warn "   CNAME  $CF_HOST  →  $1.cfargotunnel.com   (proxy activé, nuage orange)"
    else
      warn "   CNAME  $CF_HOST  →  <ID-du-tunnel>.cfargotunnel.com   (proxy activé ; ID visible avec : cloudflared tunnel list)"
    fi
  fi
}

CF_CFG=""
command -v cloudflared >/dev/null 2>&1 && CF_CFG=$(find_cf_config)

if [ "$CF_CFG" = "TOKEN" ]; then
  # Tunnel géré à distance (installé avec un jeton) : la config vit dans le tableau de bord
  echo
  warn "Ton tunnel Cloudflare est géré depuis le tableau de bord (installé avec un jeton)."
  warn "Le script ne peut pas modifier cette config ; ajoute la route toi-même (1 minute) :"
  echo "   1. https://one.dash.cloudflare.com → Networks → Tunnels → ton tunnel → Configure"
  echo "   2. Onglet « Public Hostname » (ou « Published application routes ») → Add"
  echo "   3. Hostname : $CF_HOST    Service : HTTP    URL : localhost:$PORT"
  echo "   4. Enregistre. Les WebSockets du jeu passent sans réglage supplémentaire."
  echo
  ok "Le jeu sera ensuite accessible sur https://$CF_HOST"
  exit 0
fi

if [ -n "$CF_CFG" ]; then
  # Tunnel géré localement : on ajoute la route dans config.yml
  log "Config Cloudflare trouvée : $CF_CFG"
  TUN=$(sed -nE 's/^tunnel:[[:space:]]*["'\'']?([^"'\''[:space:]]+).*/\1/p' "$CF_CFG" | head -n1)
  [ -n "$TUN" ] || die "Pas de ligne « tunnel: » dans $CF_CFG : je préfère ne rien toucher."
  BACKUP="$CF_CFG.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$CF_CFG" "$BACKUP"
  TMP=$(mktemp)
  add_ingress "$CF_CFG" "$CF_HOST" "$SVC_URL" > "$TMP"
  if cloudflared tunnel --config "$TMP" ingress validate >/dev/null 2>&1; then
    cat "$TMP" > "$CF_CFG"; rm -f "$TMP"
    ok "Route ajoutée : $CF_HOST → $SVC_URL (sauvegarde : $BACKUP)"
  else
    rm -f "$TMP"
    die "La nouvelle config ne passe pas la validation cloudflared : rien n'a été modifié (sauvegarde : $BACKUP)."
  fi
  route_dns "$TUN" "$(dirname "$CF_CFG")"
  restart_cloudflared
else
  # Aucun tunnel : installation de cloudflared et création d'un tunnel « eclipse »
  warn "Aucune configuration cloudflared trouvée sur ce serveur."
  read -rp "Créer un nouveau tunnel Cloudflare « eclipse » maintenant ? [O/n] " yn
  case "${yn:-o}" in [nN]*) ok "Jeu installé sur le port $PORT, sans tunnel."; exit 0 ;; esac
  if ! command -v cloudflared >/dev/null 2>&1; then
    log "Installation de cloudflared…"
    case "$(uname -m)" in x86_64|amd64) A=amd64 ;; aarch64|arm64) A=arm64 ;; armv7l|armhf) A=arm ;; *) die "Architecture non gérée : $(uname -m)" ;; esac
    BASE=https://github.com/cloudflare/cloudflared/releases/latest/download
    if command -v dpkg >/dev/null 2>&1; then
      curl -fsSL -o /tmp/cloudflared.deb "$BASE/cloudflared-linux-$A.deb" && dpkg -i /tmp/cloudflared.deb
    elif command -v rpm >/dev/null 2>&1 && [ "$A" != arm ]; then
      R=$([ "$A" = amd64 ] && echo x86_64 || echo aarch64)
      curl -fsSL -o /tmp/cloudflared.rpm "$BASE/cloudflared-linux-$R.rpm" && rpm -Uvh /tmp/cloudflared.rpm
    else
      curl -fsSL -o /usr/local/bin/cloudflared "$BASE/cloudflared-linux-$A" && chmod +x /usr/local/bin/cloudflared
    fi
    ok "cloudflared $(cloudflared --version 2>/dev/null | head -n1) installé."
  fi
  if [ ! -f /root/.cloudflared/cert.pem ]; then
    log "Connexion à ton compte Cloudflare : ouvre le lien affiché, puis choisis le domaine de $CF_HOST."
    cloudflared tunnel login
  fi
  if ! cloudflared tunnel list 2>/dev/null | awk '{print $2}' | grep -qx eclipse; then
    cloudflared tunnel create eclipse
  fi
  TUN=$(cloudflared tunnel list --name eclipse --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s);console.log(t[0]?.id||'')})")
  [ -n "$TUN" ] || die "Impossible de récupérer l'identifiant du tunnel."
  mkdir -p /etc/cloudflared
  [ -f "/root/.cloudflared/$TUN.json" ] && cp "/root/.cloudflared/$TUN.json" "/etc/cloudflared/$TUN.json"
  if [ -f /etc/cloudflared/config.yml ]; then cp -p /etc/cloudflared/config.yml "/etc/cloudflared/config.yml.bak-$(date +%Y%m%d-%H%M%S)"; fi
  cat > /etc/cloudflared/config.yml <<EOF
tunnel: $TUN
credentials-file: /etc/cloudflared/$TUN.json

ingress:
  - hostname: $CF_HOST
    service: $SVC_URL
  - service: http_status:404
EOF
  ok "Config créée : /etc/cloudflared/config.yml"
  route_dns "$TUN" /root/.cloudflared
  if ! systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared\.service'; then
    cloudflared --config /etc/cloudflared/config.yml service install
  fi
  systemctl enable cloudflared >/dev/null 2>&1 || true
  restart_cloudflared
fi

echo
ok "Terminé ! Le jeu sera accessible sur https://$CF_HOST (le DNS peut prendre 1 à 2 minutes)."
echo "   Panneau admin      : https://$CF_HOST/admin"
if [ -f "$DATA_DIR/admin-setup-code.txt" ]; then
  echo "   Code d'installation admin (à saisir une seule fois sur /admin) : $(cat "$DATA_DIR/admin-setup-code.txt")"
fi
echo "   Statut du jeu      : systemctl status $SERVICE"
echo "   Logs en direct     : journalctl -u $SERVICE -f"
echo "   Mise à jour        : relance ce script depuis le nouveau dossier du jeu"
echo "   Désinstallation    : sudo ./install-serveur.sh --uninstall"
