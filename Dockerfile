FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm config set dangerouslyAllowAllBuilds true && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ffmpeg python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm config set dangerouslyAllowAllBuilds true && pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
ENV NODE_ENV=production
EXPOSE 3000
VOLUME ["/media", "/data"]
# `/api/health` no exige sesión: sirve como sonda real del proceso.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["pnpm", "start"]
