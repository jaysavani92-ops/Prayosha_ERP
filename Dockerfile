# syntax=docker/dockerfile:1.7
# One image, two processes: the API (default CMD) and the worker
# (override CMD with `node dist/worker.js`).

ARG NODE_VERSION=24.22.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
# glibc (bookworm) rather than alpine/musl: argon2 ships tested glibc prebuilds.

# ---- production dependencies only ----------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# --ignore-scripts: dependency install scripts never run; native modules load
# their bundled prebuilt binaries at runtime.
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# ---- compile TypeScript ----------------------------------------------------
FROM base AS build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime -----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    # Argon2 hashing runs on the libuv pool; keep PASSWORD_HASH_CONCURRENCY <= this.
    UV_THREADPOOL_SIZE=4 \
    NODE_OPTIONS=--enable-source-maps
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# Unprivileged user; the filesystem is not written to at runtime.
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
