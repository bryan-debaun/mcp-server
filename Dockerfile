# Production Dockerfile for MCP Server (pnpm — see issue #106)
FROM node:20-alpine AS build
WORKDIR /app

# Enable pnpm via corepack (version pinned by package.json "packageManager")
RUN corepack enable

# Allow passing DATABASE_URL at build time for Prisma codegen
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Install full deps (with frozen lockfile) — leverage layer caching on lockfile changes
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy source and build (prisma generate + tsoa routes + tsc + seed compile)
COPY . .
RUN pnpm run build

# Compile seed script to JavaScript for production use
RUN pnpm exec tsc prisma/seed.ts --outDir dist --module NodeNext --moduleResolution NodeNext --target ES2022 --esModuleInterop --skipLibCheck

# Reduce to production dependencies in place. pnpm's content-addressed node_modules
# stays self-contained: the generated @prisma/client (with its embedded WASM query
# compiler) is a prod dependency and is preserved; dev tooling (tsc/tsoa/vitest/eslint)
# is removed. This replaces the old npm-era manual copy of @prisma/client + .prisma,
# which does not work with pnpm's symlinked layout.
RUN pnpm prune --prod

# Runtime image
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# pnpm available at runtime for `pnpm run start` / migrate steps
RUN corepack enable

# Copy package manifests, the pruned (production) node_modules, and built artifacts
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts ./scripts

EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/index.js"]
