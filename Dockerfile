# ECLIPSE — serveur de jeu (HTTP + WebSocket)
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app

# Dépendances d'abord (meilleur cache des couches)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Code du jeu
COPY server ./server
COPY shared ./shared
COPY public ./public

# Dossier persistant des comptes joueurs, accessible à l'utilisateur non-root
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

CMD ["node", "server/server.js"]
