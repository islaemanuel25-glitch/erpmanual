# syntax=docker/dockerfile:1

# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# CLI de Prisma autocontenido (arbol de deps completo, aislado)
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefix /opt/prisma-cli prisma@6.19.3

COPY . .

RUN npx prisma generate
RUN npm run build

# --- Production stage ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Standalone output ya incluye node_modules necesarios
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Prisma CLI aislado en /opt (arbol completo y autocontenido)
COPY --from=builder /opt/prisma-cli /opt/prisma-cli
RUN printf '#!/bin/sh\nexec node /opt/prisma-cli/node_modules/prisma/build/index.js "$@"\n' > /usr/local/bin/prisma \
    && chmod +x /usr/local/bin/prisma

USER node

EXPOSE 3000

CMD ["node", "server.js"]
