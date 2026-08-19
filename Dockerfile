# =============================================================================
# Image de production « Suivi MAJ GTrans2 » — SIFA Logistics
#
# Construction en deux étapes :
#   1. `builder` compile le frontend React (Vite) ;
#   2. l'image finale ne contient que le backend Node et les fichiers compilés.
# =============================================================================

# ---------- Étape 1 : compilation du frontend ----------
FROM node:22-alpine AS builder
WORKDIR /build

COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci --no-audit --no-fund

COPY client/ ./client/
RUN cd client && npm run build

# ---------- Étape 2 : image finale ----------
FROM node:22-alpine
WORKDIR /app

# tini : gestion correcte des signaux (arrêt propre, sauvegarde finale de l'état)
RUN apk add --no-cache tini

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

COPY server/src ./server/src
COPY --from=builder /build/client/dist ./client/dist

# Le serveur tourne sans privilèges root ; `data` accueille l'état persistant.
RUN mkdir -p /app/server/data/archives && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    PORT=8080 \
    CLIENT_DIR=/app/client/dist \
    DATA_DIR=/app/server/data

EXPOSE 8080
VOLUME ["/app/server/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
