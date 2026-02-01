#!/bin/sh
set -e

echo "Running database migrations with direct connection..."
export DATABASE_URL="${DATABASE_URL_DIRECT}"
npx prisma migrate deploy

echo "Seeding database with pooled connection..."
unset DATABASE_URL
npm run prisma:seed

echo "Starting server with pooled connection..."
npm run start
