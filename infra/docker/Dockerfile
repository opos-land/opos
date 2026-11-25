# syntax=docker/dockerfile:1

# The images of a deployment, built on its server from the repository at the deployed commit
# (docs/adr/0033-host-dev-on-the-teams-coolify-server-and-leave-productions-hosting-open.md).
# The build context is the repository root:
#
#   docker build -f infra/docker/Dockerfile --target api .
#   docker build -f infra/docker/Dockerfile --target tools .
#   docker build -f infra/docker/Dockerfile --target web \
#     --build-arg APP=panel --build-arg VITE_API_URL=https://api.example.org .
#   docker build -f infra/docker/Dockerfile --target head \
#     --build-arg APP=portal --build-arg VITE_API_URL=https://api.example.org .
#
# Each image holds one part of the workspace, cut out by `turbo prune`, and runs as a user without
# privileges. compose.yaml beside this file puts them together into one deployment.

# node 24.15.0, the version of mise.toml and of engines
ARG NODE_IMAGE=node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d
# caddy 2.11.9
ARG CADDY_IMAGE=caddy:2.11.9-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9

FROM ${NODE_IMAGE} AS base
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_HOME=/usr/local/share/corepack
WORKDIR /repo
# pnpm at the version of packageManager, kept where every user of the image finds it
COPY package.json ./
RUN corepack enable && corepack install

# The whole repository with the root package's own dependencies: turbo, to cut the workspace
FROM base AS source
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter opos

# --- the API ---------------------------------------------------------------------------------

FROM source AS prune-api
RUN pnpm turbo prune @opos/api --docker

FROM base AS build-api
COPY --from=prune-api /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune-api /repo/out/full/ ./
RUN pnpm turbo run build --filter=@opos/api

# The bundle holds the workspace packages; what it imports at run time is the API's own production
# dependencies, installed on their own so that no build tool reaches the image
FROM base AS deps-api
COPY --from=prune-api /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prod --filter @opos/api

# The CA of Supabase's Postgres, which every connection of a deployment verifies the server against
# (docs/adr/0013-connect-to-postgres-directly-with-verified-tls.md). Public; supabase-ca.crt is
# the certificate of the dashboard's Database settings, SSL configuration, "Supabase Root 2021 CA",
# SHA-256 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production \
    NODE_EXTRA_CA_CERTS=/etc/ssl/supabase/ca.crt
COPY infra/docker/supabase-ca.crt /etc/ssl/supabase/ca.crt
WORKDIR /repo/apps/api
COPY --from=deps-api /repo/node_modules /repo/node_modules
COPY --from=deps-api /repo/apps/api/node_modules ./node_modules
COPY --from=build-api /repo/apps/api/package.json ./
COPY --from=build-api /repo/apps/api/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3001}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]

# --- the database tools ----------------------------------------------------------------------

FROM source AS prune-db
RUN pnpm turbo prune @opos/db --docker

# The scripts run from their sources, so the image keeps the development dependencies. It is the
# one container that holds the postgres URL.
FROM base AS tools
# pnpm checks the dependencies before a script and installs when a manifest is newer than the last
# install, which it is whenever the install below comes from the build cache and the sources do
# not; the dependencies are fixed at build time, and the node user may not write them anyway
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/supabase/ca.crt \
    pnpm_config_verify_deps_before_run=false
COPY infra/docker/supabase-ca.crt /etc/ssl/supabase/ca.crt
COPY --from=prune-db /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune-db /repo/out/full/ ./
COPY infra/docker/tools.sh /usr/local/bin/tools
WORKDIR /repo/packages/db
USER node
# Healthy once the roles, the migrations, the verification and any seed passed: the API waits for
# it. A failed check counts only after the start period, which leaves the seed its time; the first
# check that passes ends it
HEALTHCHECK --interval=5s --timeout=3s --start-period=600s --retries=3 \
  CMD ["test", "-f", "/tmp/ready"]
CMD ["tools"]

# --- the panel, the portal and the admin application -----------------------------------------

FROM source AS prune-web
ARG APP
RUN test -n "$APP" && pnpm turbo prune "@opos/$APP" --docker

FROM base AS build-web
ARG APP
# Baked into the bundle: an environment has its own build
ARG VITE_API_URL
COPY --from=prune-web /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune-web /repo/out/full/ ./
RUN test -n "$VITE_API_URL" && VITE_API_URL="$VITE_API_URL" pnpm turbo run build --filter="@opos/$APP"

FROM ${CADDY_IMAGE} AS web
ARG APP
ARG VITE_API_URL
# The one origin the pages may call, for the Content-Security-Policy of the Caddyfile
ENV API_ORIGIN=${VITE_API_URL}
COPY infra/docker/Caddyfile /etc/caddy/Caddyfile
COPY --chmod=0755 infra/docker/web.sh /usr/local/bin/web
COPY --from=build-web /repo/apps/${APP}/dist /srv
USER nobody
EXPOSE 8080
# The one path basic auth leaves open
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
CMD ["web"]

# --- the server beside the portal ------------------------------------------------------------

# Answers the document of each of the portal's pages with that page's head
# (docs/adr/0091-fill-the-head-of-the-portals-pages-on-a-server-beside-it.md). Built with
# APP=portal, from the portal's own build: one file with everything it imports in it, beside the
# document it fills, so the image holds Node and no installed dependency. It keeps no secret.
FROM ${NODE_IMAGE} AS head
ENV NODE_ENV=production \
    PORT=8081
WORKDIR /srv
COPY --from=build-web /repo/apps/portal/build ./
COPY --from=build-web /repo/apps/portal/dist/index.html ./index.html
USER node
EXPOSE 8081
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "main.js"]
