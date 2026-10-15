# syntax=docker/dockerfile:1

# Etapa 1: compilar el cliente y el servidor. Necesita las herramientas de
# compilación porque `better-sqlite3` es un módulo nativo.
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm config set dangerouslyAllowAllBuilds true && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Etapa 2: dejar sólo las dependencias de producción, ya compiladas. Así la
# imagen final no arrastra python3/make/g++ (unos 400 MB) que sólo hacen falta
# para construir el módulo nativo, no para ejecutarlo.
FROM build AS production-deps
RUN pnpm install --prod --frozen-lockfile

# Etapa 3: imagen final. Sólo ffmpeg, que sí se usa en ejecución.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
ENV NODE_ENV=production
EXPOSE 3000
VOLUME ["/media", "/data"]
# `/api/health` no exige sesión: sirve como sonda real del proceso.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
# Sin pnpm en la imagen final: se arranca node directamente (es lo que hace
# `pnpm start` en desarrollo).
CMD ["node", "--env-file-if-exists=.env", "--import", "tsx", "server/index.ts"]
