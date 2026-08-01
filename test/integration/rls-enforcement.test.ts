import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
    runWithDbContext,
    TRUSTED_SERVICE_CONTEXT,
} from '../../src/db/request-context.js'
import { withRequestClaims } from '../../src/db/with-request-claims.js'

const RUN_DB_TESTS = process.env.RUN_DB_INTEGRATION === 'true'

/**
 * Does RLS actually stop a non-admin writing? (ORR gap #7.)
 *
 * The previous version of this file pinned the *broken* posture, because at the
 * time RLS enforced nothing: the app owned every table, carried `BYPASSRLS`, and
 * no table used FORCE. `20260801120000_enforce_rls` plus the claim-propagating
 * Prisma extension changed that, so this now asserts enforcement.
 *
 * Crucially it connects as **`mcp_app`**, not as the migration owner. Testing
 * this as `postgres` would pass vacuously — the owner sails past every policy,
 * which is the exact trap the original setup fell into.
 */
const OWNER_URL = process.env.DATABASE_URL ?? ''
const APP_PASSWORD = 'rls_test_app_password'

function appUrl(): string {
    const u = new URL(OWNER_URL)
    u.username = 'mcp_app'
    u.password = APP_PASSWORD
    return u.toString()
}

describe('RLS enforcement (ORR gap #7)', () => {
    if (!RUN_DB_TESTS) {
        it.skip('skipped - requires RUN_DB_INTEGRATION=true', () => {})
        return
    }

    let base: PrismaClient
    let db: any

    beforeAll(async () => {
        // Give the (NOLOGIN) app role a password for the duration of the test.
        // Production does this once during cutover; here it keeps the test
        // self-contained and avoids putting a credential in the migration.
        const owner = new pg.Client({ connectionString: OWNER_URL })
        await owner.connect()
        await owner.query(`ALTER ROLE mcp_app LOGIN PASSWORD '${APP_PASSWORD}'`)
        await owner.end()

        base = new PrismaClient({
            adapter: new PrismaPg({ connectionString: appUrl() }),
        })
        db = withRequestClaims(base)
    })

    afterAll(async () => {
        await base?.$disconnect()
        const owner = new pg.Client({ connectionString: OWNER_URL })
        await owner.connect()
        await owner.query('ALTER ROLE mcp_app NOLOGIN')
        await owner.end()
    })

    it('connects as a role that cannot bypass RLS', async () => {
        const [row] = (await base.$queryRaw`
            SELECT current_user AS role,
                   (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass
        `) as Array<{ role: string; bypass: boolean }>
        expect(row.role).toBe('mcp_app')
        expect(row.bypass).toBe(false)
    })

    it('has RLS enabled AND forced on every application table', async () => {
        const rows = (await base.$queryRaw`
            SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT LIKE '\\_%'
        `) as Array<{ name: string; enabled: boolean; forced: boolean }>

        expect(rows.length).toBeGreaterThan(0)
        // FORCE matters: without it, pointing the app back at an owner role
        // silently reopens everything.
        expect(rows.filter((r) => !r.enabled).map((r) => r.name)).toEqual([])
        expect(rows.filter((r) => !r.forced).map((r) => r.name)).toEqual([])
    })

    it('allows reads without any identity (public catalog, fast path)', async () => {
        await expect(db.movie.findMany({ take: 1 })).resolves.toBeDefined()
    })

    it('BLOCKS a write with no identity', async () => {
        await expect(
            db.movie.create({
                data: { title: 'no-context', status: 'NOT_STARTED' },
            }),
        ).rejects.toThrow(/row-level security/i)
    })

    // The bug class this exists for: an authorization slip that lets a
    // non-admin through the application layer still cannot write.
    it('BLOCKS a write from a non-admin identity', async () => {
        await expect(
            runWithDbContext(
                { role: 'user', email: 'someone@example.com' },
                async () =>
                    await db.movie.create({
                        data: { title: 'non-admin', status: 'NOT_STARTED' },
                    }),
            ),
        ).rejects.toThrow(/row-level security/i)
    })

    it('ALLOWS a write from an admin identity', async () => {
        const created = await runWithDbContext(
            { role: 'admin', email: 'brn.dbn@gmail.com' },
            async () =>
                await db.movie.create({
                    data: { title: 'admin-write', status: 'NOT_STARTED' },
                }),
        )
        expect(created?.id).toBeDefined()

        await runWithDbContext(
            { role: 'admin', email: 'brn.dbn@gmail.com' },
            async () => await db.movie.delete({ where: { id: created.id } }),
        )
    })

    it('ALLOWS a write from the trusted service context (MCP gateway key)', async () => {
        const created = await runWithDbContext(
            { ...TRUSTED_SERVICE_CONTEXT },
            async () =>
                await db.movie.create({
                    data: { title: 'service-write', status: 'NOT_STARTED' },
                }),
        )
        expect(created?.id).toBeDefined()
        await runWithDbContext(
            { ...TRUSTED_SERVICE_CONTEXT },
            async () => await db.movie.delete({ where: { id: created.id } }),
        )
    })

    it('does not leak claims to the next call once the scope exits', async () => {
        await runWithDbContext(
            { role: 'admin', email: 'brn.dbn@gmail.com' },
            async () =>
                await db.movie.create({
                    data: { title: 'scoped', status: 'NOT_STARTED' },
                }),
        )
        // Same connection, no scope — must be refused again.
        await expect(
            db.movie.create({
                data: { title: 'after-scope', status: 'NOT_STARTED' },
            }),
        ).rejects.toThrow(/row-level security/i)
    })

    // Regression guard for the footgun found during the spike: Prisma promises
    // are lazy, so a context callback that returns without awaiting executes
    // outside the scope and loses its claims.
    it('loses claims when the callback does not await (documented footgun)', async () => {
        await expect(
            runWithDbContext(
                { role: 'admin', email: 'brn.dbn@gmail.com' },
                () =>
                    db.movie.create({
                        data: { title: 'unawaited', status: 'NOT_STARTED' },
                    }),
            ),
        ).rejects.toThrow(/row-level security/i)
    })

    it('denies schema modification to the app role', async () => {
        await expect(
            base.$executeRawUnsafe('CREATE TABLE rls_should_fail (id int)'),
        ).rejects.toThrow(/permission denied/i)
    })
})
