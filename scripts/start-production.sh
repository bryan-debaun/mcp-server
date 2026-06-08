#!/bin/sh
set -e

echo "Running database migrations with direct connection..."
# `pnpm dlx` fetches the prisma CLI on demand — the production image ships only
# runtime deps (see Dockerfile `pnpm prune --prod`), so the CLI is not installed locally.
env DATABASE_URL="${DATABASE_URL_DIRECT}" pnpm dlx prisma migrate deploy

echo "Seeding database with pooled connection..."
pnpm run prisma:seed

echo "Starting server with pooled connection..."
pnpm run start
