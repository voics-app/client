# syntax=docker/dockerfile:1.7

# --- build: bundle the renderer (browser mode and component gallery) ---
FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/desktop/package.json apps/desktop/
COPY native/crypto/package.json native/crypto/
RUN pnpm install --frozen-lockfile --filter @discordy/desktop... --ignore-scripts
COPY apps/desktop apps/desktop
RUN pnpm --filter @discordy/desktop exec electron-vite build

# --- runtime: unprivileged nginx serving the static renderer ---
FROM nginxinc/nginx-unprivileged:1.27-alpine
ARG VERSION=0.1.0
ARG REVISION=unknown
LABEL org.opencontainers.image.title="discordy-client" \
      org.opencontainers.image.description="Discordy client web build (renderer bundle and component gallery)" \
      org.opencontainers.image.source="https://github.com/discordy-voics/client" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.licenses="UNLICENSED"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/desktop/out/renderer /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
