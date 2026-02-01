#!/bin/sh
set -e

echo "Running database migrations with direct connection..."
echo "Using session pooler: ${DATABASE_URL_DIRECT}"
env DATABASE_URL="${DATABASE_URL_DIRECT}" npx prisma migrate deploy

echo "Seeding database with pooled connection..."
npm run prisma:seed

echo "Starting server with pooled connection..."
npm run start
