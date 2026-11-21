# syntax=docker/dockerfile:1.7

# --- build: bundle the renderer (browser mode and component gallery) ---
FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/desktop/package.json apps/desktop/
COPY packages/core/package.json packages/core/
COPY packages/react/package.json packages/react/
COPY native/crypto/package.json native/crypto/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @discordy/desktop... --ignore-scripts
COPY packages/core packages/core
COPY packages/react packages/react
COPY apps/desktop apps/desktop
RUN pnpm --filter @discordy/desktop exec electron-vite build && node apps/desktop/scripts/check-renderer-budget.mjs

# --- runtime: unprivileged nginx serving the static renderer ---
FROM nginxinc/nginx-unprivileged:1.27-alpine
ARG VERSION=0.1.0
ARG REVISION=unknown
LABEL org.opencontainers.image.title="discordy-client" \
      org.opencontainers.image.description="Voics client web build (renderer bundle and component gallery)" \
      org.opencontainers.image.source="https://github.com/voics-app/client" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.licenses="UNLICENSED"
USER root
RUN apk upgrade --no-cache
USER 101
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/desktop/out/renderer /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
