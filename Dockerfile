# ---- Builder: installiert alle Deps + baut ----
FROM node:20-alpine AS builder
WORKDIR /app

# System-Pakete für Build/Prisma
RUN apk add --no-cache openssl libc6-compat

# Nur Manifeste für Cache-Hit
COPY package.json package-lock.json ./
# Volle Deps (inkl. dev) für den Build
RUN npm install --no-audit --no-fund

# Quellcode
COPY . .

# Build (Remix/Vite)
ARG BUILD_ID
ENV BUILD_ID=${BUILD_ID}
RUN echo "$BUILD_ID" > /app/BUILD_ID && npm run build

# ---- Runtime: nur Prod-Dependencies + Build-Artefakte ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NODE_OPTIONS="--enable-source-maps"

# System-Pakete, die Prisma benötigt
RUN apk add --no-cache openssl libc6-compat curl

# 1) Schema VOR npm ci bereitstellen, damit @prisma/client postinstall sauber generiert
COPY prisma ./prisma
COPY package.json package-lock.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund && npm cache clean --force

# 2) Build-Output & Assets
COPY --from=builder /app/build ./build
COPY --from=builder /app/app ./app
COPY --from=builder /app/public ./public
COPY --from=builder /app/BUILD_ID ./BUILD_ID
COPY --from=builder /app/server.js ./server.js

# Eigentümerrechte setzen, bevor auf node gewechselt wird
RUN chown -R node:node /app

# Non-root User für Sicherheit (node user existiert bereits in Alpine)
USER node

# Port & Start
EXPOSE 3000
# Remix-Serve respektiert $PORT; Fly kann PORT setzen
CMD ["npm", "run", "start"]
