#!/usr/bin/env sh
# Lance ECLIPSE : ./lancer.sh [port]   (3000 par défaut)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé : https://nodejs.org"; exit 1
fi
PORT="${1:-}"
if [ -z "$PORT" ]; then printf "Port à utiliser (Entrée = 3000) : "; read -r PORT; fi
PORT="${PORT:-3000}"
[ -d node_modules ] || { echo "Installation des dépendances (une seule fois)…"; npm install --omit=dev; }
exec node server/server.js --port "$PORT"
