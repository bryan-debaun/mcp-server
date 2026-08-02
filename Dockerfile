# Production Dockerfile for MCP Server (pnpm — see issue #106)
FROM node:24-alpine AS build
WORKDIR /app

# Enable pnpm via corepack (version pinned by package.json "packageManager")
RUN corepack enable

# Allow passing DATABASE_URL at build time for Prisma codegen
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Install full deps (with frozen lockfile) — leverage layer caching on lockfile changes.
# pnpm-workspace.yaml carries the pnpm 11 `allowBuilds` approval; without it the
# strict build-script check fails the install (ERR_PNPM_IGNORED_BUILDS).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy source and build (prisma generate + tsoa routes + tsc + seed compile)
COPY . .
RUN pnpm run build

# Compile seed script to JavaScript for production use
RUN pnpm exec tsc prisma/seed.ts --ignoreConfig --outDir dist --module NodeNext --moduleResolution NodeNext --target ES2022 --esModuleInterop --skipLibCheck

# Reduce to production dependencies in place. pnpm's content-addressed node_modules
# stays self-contained: the generated @prisma/client (with its embedded WASM query
# compiler) is a prod dependency and is preserved; dev tooling (tsc/tsoa/vitest/eslint)
# is removed. This replaces the old npm-era manual copy of @prisma/client + .prisma,
# which does not work with pnpm's symlinked layout.
RUN pnpm prune --prod

# Runtime image
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# pnpm available at runtime for `pnpm run start` / migrate steps
RUN corepack enable

# Copy package manifests, the pruned (production) node_modules, and built artifacts
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts ./scripts

EXPOSE 8080
ENV PORT=8080

# Apply pending DB migrations on boot, then start. Render's free tier has no
# Pre-Deploy Command, so this is how migrations reach prod automatically (#126
# follow-up). `prisma` + `@prisma/config` are prod deps so the CLI survives the
# prod prune; `migrate deploy` is a fast no-op when nothing is pending.
#
# The logic moved into a script because it is no longer a one-liner: it migrates
# over DATABASE_URL_DIRECT (Supabase's transaction pooler cannot take the
# advisory locks migrate deploy needs) and distinguishes an unreachable database
# — survivable, start anyway — from a migration that genuinely failed, which is
# not. See scripts/docker-entrypoint.sh for the full rationale.
# (scripts/ is already copied above; invoked via `sh` so no exec bit is needed —
# which also avoids depending on the file mode surviving a Windows checkout.)
CMD ["sh", "./scripts/docker-entrypoint.sh"]
