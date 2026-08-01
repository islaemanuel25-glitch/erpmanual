# syntax=docker/dockerfile:1

# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# Identidad del despliegue: el SHA del commit, el MISMO para cliente y servidor.
# Lo usa el guard de versión (lib/version/compararBuild.js) para detectar
# pestañas que quedaron con un bundle anterior a un deploy.
#
# Se declara vacío a propósito y se valida abajo: si el build de producción se
# lanza sin pasarlo, tiene que FALLAR. Un guard silenciosamente inactivo por un
# argumento olvidado es peor que no tenerlo, porque da una falsa sensación de
# protección.
ARG APP_BUILD_ID=""

# Lo pone docker-compose.prod.yml en 1. Sin él (build local de desarrollo) el
# SHA es opcional. Es un flag de build, no un secreto.
ARG REQUIRE_BUILD_ID="0"

# `NEXT_PUBLIC_*` es lo único que Next incrusta en el bundle del navegador.
ENV NEXT_PUBLIC_BUILD_ID=$APP_BUILD_ID
ENV APP_BUILD_ID=$APP_BUILD_ID

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# CLI de Prisma autocontenido (arbol de deps completo, aislado)
RUN --mount=type=cache,target=/root/.npm \
    npm install --prefix /opt/prisma-cli prisma@6.19.3

COPY . .

RUN if [ "$REQUIRE_BUILD_ID" = "1" ] && [ -z "$APP_BUILD_ID" ]; then \
      echo "ERROR: falta APP_BUILD_ID en el build de produccion." >&2; \
      echo "Usar: APP_BUILD_ID=\"\$(git rev-parse HEAD)\" docker compose -f docker-compose.prod.yml build app" >&2; \
      exit 1; \
    fi

RUN npx prisma generate
RUN npm run build

# --- Production stage ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Un ARG del builder NO cruza a la imagen final: hay que volver a declararlo en
# esta etapa y fijarlo con ENV para que /api/version lo lea en runtime. Si esto
# faltara, el cliente traería el SHA y el servidor devolvería "" — el guard
# quedaría en INDETERMINADO permanente y no bloquearía nunca.
ARG APP_BUILD_ID=""
ENV APP_BUILD_ID=$APP_BUILD_ID

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
