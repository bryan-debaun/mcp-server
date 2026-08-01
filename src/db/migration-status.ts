import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '../logger.js'
import { prisma } from './index.js'

/**
 * Detect migrations that exist in the repo but have not been applied to the
 * connected database.
 *
 * This exists because the boot-time `prisma migrate deploy` failed silently in
 * production for over a month (see the operational readiness review, finding D):
 * it ran against a transaction pooler that cannot take the advisory locks
 * `migrate deploy` needs, and the failure was swallowed. The server happily
 * served traffic against a schema missing two tables the deployed code expected.
 *
 * `scripts/docker-entrypoint.sh` now makes that failure fatal, but a boot-time
 * gate only helps if boot is where it goes wrong. This is the runtime backstop:
 * it answers "is the schema actually what this code expects?" from the outside,
 * on demand, and reports it on the diagnostic health endpoint.
 */
export interface MigrationStatus {
    /** False when the check could not run (no DB, stub client, missing dir). */
    checked: boolean
    /** Migration directory names present in the repo but not applied. */
    pending: string[]
    /** Why the check was skipped, when `checked` is false. */
    reason?: string
}

/**
 * Migration directory names on disk.
 *
 * The runtime image copies `prisma/` (see Dockerfile), and the process runs with
 * the app root as cwd, so this resolves in both the container and local dev.
 */
function migrationsOnDisk(): string[] {
    const dir = join(process.cwd(), 'prisma', 'migrations')
    return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
}

/**
 * Migration names Prisma records as successfully applied.
 *
 * Uses `$queryRaw` (tagged template), NOT `$queryRawUnsafe`: `src/db/index.ts`
 * forwards only `$queryRaw`/`$executeRaw`/`$transaction`/`$disconnect` onto the
 * shared `prisma` object. Calling `$queryRawUnsafe` here would hit `undefined`,
 * this module would report `checked: false` forever, and the health gate would
 * silently never fire — the precise failure mode it exists to catch.
 */
async function appliedMigrations(): Promise<string[]> {
    // Only rows that finished and were not rolled back count as applied — a
    // partially-applied migration must show up as pending, not as done.
    const rows = (await prisma.$queryRaw`
        SELECT migration_name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `) as Array<{ migration_name: string }>
    return rows.map((r) => r.migration_name)
}

export async function getMigrationStatus(): Promise<MigrationStatus> {
    // `prisma` is an empty object until `initPrisma()` runs, and a no-op stub
    // when DATABASE_URL is unset. Neither can answer this question.
    if (typeof prisma.$queryRaw !== 'function') {
        return { checked: false, pending: [], reason: 'no database client' }
    }

    let onDisk: string[]
    try {
        onDisk = migrationsOnDisk()
    } catch (err: any) {
        return {
            checked: false,
            pending: [],
            reason: `migrations directory unreadable: ${err?.message ?? err}`,
        }
    }

    try {
        const applied = new Set(await appliedMigrations())
        return { checked: true, pending: onDisk.filter((m) => !applied.has(m)) }
    } catch (err: any) {
        // An unreachable DB or a missing `_prisma_migrations` table (a database
        // that has never been migrated at all) both land here. Report "couldn't
        // check" rather than "nothing pending" — claiming a clean schema we
        // failed to verify is exactly the silent-success this module exists to
        // prevent.
        logger.debug('migration status check failed', err?.message ?? err)
        return {
            checked: false,
            pending: [],
            reason: `query failed: ${err?.message ?? err}`,
        }
    }
}
