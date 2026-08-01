import { afterAll, describe, expect, it } from 'vitest'
import { initPrisma, prisma } from '../../src/db'
import { getMigrationStatus } from '../../src/db/migration-status.js'

const RUN_DB_TESTS = process.env.RUN_DB_INTEGRATION === 'true'

/**
 * `getMigrationStatus()` against a REAL Prisma client.
 *
 * The unit tests in `test/db/migration-status.test.ts` mock `prisma`, so they
 * agree with whatever the implementation calls — which is precisely how the
 * first version shipped broken: it used `$queryRawUnsafe`, which
 * `src/db/index.ts` does not forward onto the shared `prisma` object. The mocked
 * tests passed happily while the real thing would have reported `checked: false`
 * forever and the health gate would never have fired.
 *
 * This test exists to make that class of bug impossible to repeat: it exercises
 * the real client against a real database and insists the check actually ran.
 */
describe('migration status against a real database', () => {
    if (!RUN_DB_TESTS) {
        it.skip('skipped - requires RUN_DB_INTEGRATION=true', () => {})
        return
    }

    afterAll(async () => {
        await initPrisma()
        if (typeof prisma.$disconnect === 'function') {
            await prisma.$disconnect()
        }
    })

    it('actually runs the query (checked: true) rather than silently skipping', async () => {
        await initPrisma()
        const status = await getMigrationStatus()

        // The assertion that matters. `checked: false` here means the query
        // never ran — a broken client method, a missing table, an unreachable
        // DB — and the health endpoint would report `pending: null` forever.
        expect(status.checked).toBe(true)
        expect(status.reason).toBeUndefined()
    })

    it('reports no pending migrations on a fully migrated database', async () => {
        await initPrisma()
        const status = await getMigrationStatus()
        // CI runs `prisma migrate deploy` before the suite, so anything pending
        // here means the on-disk names and `_prisma_migrations` disagree.
        expect(status.pending).toEqual([])
    })
})
