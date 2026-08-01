#!/bin/sh
# Container entrypoint: apply pending migrations, then start the server.
#
# This was a one-line `CMD` that ran `prisma migrate deploy || echo '...'`. Two
# things were wrong with it, and together they hid a month of missing migrations
# in production (see the operational readiness review, finding D):
#
#   1. It ran against `DATABASE_URL`, which in production is Supabase's
#      TRANSACTION pooler (port 6543). That pooler cannot take the advisory locks
#      `migrate deploy` requires, so the step failed on every single deploy.
#   2. The `|| echo` swallowed that failure unconditionally, so the server always
#      started — against an un-migrated schema — and the only trace was one log
#      line nobody was reading.
#
# The result: migrations from #145 and #147 sat unapplied from 2026-06-28 to
# 2026-07-31 while the code that needed them was live. The résumé features had no
# backing tables the whole time.
#
# Fixes here:
#   - Migrate over `DATABASE_URL_DIRECT` (the session pooler, port 5432) when it
#     is set. It takes the locks fine.
#   - Distinguish "the database is unreachable" from "the migration failed".
#     Only the first is survivable.

set -u

MIGRATE_URL="${DATABASE_URL_DIRECT:-${DATABASE_URL:-}}"

# Is the database actually reachable? Used to tell a paused Supabase project
# apart from a migration that genuinely failed. `pg` is a prod dependency (the
# Prisma adapter uses it), so it survives the production prune.
#
# Tries the connection string as-is first (so `sslmode` in the URL is honoured),
# then retries forcing SSL. Do NOT collapse this to a single hardcoded
# `ssl: {...}`: that forces TLS onto servers that don't offer it and reports a
# perfectly reachable database as unreachable — which would send a genuine
# migration failure down the "start anyway" path and defeat the point of this
# script.
db_reachable() {
    DATABASE_URL="$MIGRATE_URL" node -e "
        const pg = require('pg')
        const url = process.env.DATABASE_URL
        const attempt = (opts) => {
            const c = new pg.Client({
                connectionString: url,
                connectionTimeoutMillis: 10000,
                ...opts,
            })
            return c
                .connect()
                .then(() => c.query('SELECT 1'))
                .then(() => c.end())
        }
        attempt({})
            .catch(() => attempt({ ssl: { rejectUnauthorized: false } }))
            .then(() => process.exit(0))
            .catch(() => process.exit(1))
    " >/dev/null 2>&1
}

if [ -z "$MIGRATE_URL" ]; then
    echo "[boot] no DATABASE_URL/DATABASE_URL_DIRECT set; skipping migrations"
elif [ "${SKIP_BOOT_MIGRATE:-}" = "1" ]; then
    echo "[boot] SKIP_BOOT_MIGRATE=1; skipping migrations"
else
    if [ -n "${DATABASE_URL_DIRECT:-}" ]; then
        echo "[boot] applying migrations over DATABASE_URL_DIRECT"
    else
        echo "[boot] DATABASE_URL_DIRECT not set; applying migrations over DATABASE_URL"
        echo "[boot] NOTE: if that is a transaction pooler (port 6543), migrate deploy cannot take its advisory locks and WILL fail"
    fi

    if DATABASE_URL="$MIGRATE_URL" pnpm exec prisma migrate deploy; then
        echo "[boot] migrations up to date"
    elif [ "${BOOT_MIGRATE_NONFATAL:-}" = "1" ]; then
        # Escape hatch: restore the old behaviour without a code change, in case
        # a bad migration ever needs to be worked around under time pressure.
        echo "[boot] prisma migrate deploy failed; BOOT_MIGRATE_NONFATAL=1 set, starting anyway"
    elif db_reachable; then
        # The database answered, so this is not a paused project — the migration
        # itself failed. Refuse to start: serving traffic against a schema we do
        # not understand is worse than not starting, and Render's health-check
        # gate keeps the previous revision live while this one fails.
        echo "[boot] FATAL: database is reachable but 'prisma migrate deploy' failed."
        echo "[boot] Refusing to start against an un-migrated schema. Previous revision stays live."
        echo "[boot] To override for one deploy, set BOOT_MIGRATE_NONFATAL=1."
        exit 1
    else
        # Unreachable — most likely a paused Supabase free project. Start anyway
        # so health checks stay up and the service recovers when the DB returns.
        # (Note: Prisma is initialised lazily and falls back to stubs, so the
        # server genuinely can serve in this state.)
        echo "[boot] prisma migrate deploy failed and the database is unreachable"
        echo "[boot] (paused Supabase project?) — starting anyway so health checks stay up"
    fi
fi

exec node dist/index.js
