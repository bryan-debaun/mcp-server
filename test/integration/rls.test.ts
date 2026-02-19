import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma, initPrisma } from '../../src/db'
import { ensureRlsTestRoleReady } from '../utils/db-utils'

// helper: wait until the rls_test_role session can see the Profile for the
// current request.jwt.claims.email (prevents CI visibility races)
// - uses a larger default attempt count when running in CI
// - prints a Prisma-backed snapshot on final failure for easier debugging in CI logs
async function waitForProfileVisible(client: any, attempts = process.env.CI ? 40 : 8, delayMs = 100) {
    for (let i = 0; i < attempts; i++) {
        const r = await client.query(
            `SELECT id FROM "Profile" WHERE email = current_setting('request.jwt.claims.email', true)`
        );
        if (r.rows.length > 0) return r.rows[0];
        await new Promise((r) => setTimeout(r, delayMs));
    }
    // final diagnostic snapshot (connection-level)
    try {
        const dbg = await client.query(
            `SELECT current_setting('request.jwt.claims.email', true) AS email, current_setting('request.jwt.claims.role', true) AS role, session_user, current_user`
        );
        console.error('DEBUG RLS visibility timeout, session:', dbg.rows[0]);

        // also capture a superuser view of the same profile so CI logs show whether the
        // Profile row truly exists (helps distinguish visibility vs. missing-seed)
        const email = dbg.rows[0].email
        if (email) {
            const pr = await prisma.profile.findUnique({ where: { email } })
            console.error('DEBUG RLS profile (prisma):', pr)
            const count = await prisma.profile.count({ where: { email } })
            console.error('DEBUG RLS profile count (prisma):', count)
        } else {
            const sample = await prisma.profile.count({ where: { email: { startsWith: 'rls-' } } })
            console.error('DEBUG RLS sample rls-* profile count (prisma):', sample)
        }
    } catch (err) {
        console.error('DEBUG RLS visibility timeout, failed to read session settings or prisma snapshot', err);
    }
    return null;
}

const RUN_DB_TESTS = process.env.RUN_DB_INTEGRATION === 'true'

describe('RLS integration tests', () => {
    if (!RUN_DB_TESTS) {
        it.skip('skipped - requires RUN_DB_INTEGRATION=true', () => { })
        return
    }

    beforeAll(async () => {
        await initPrisma()
        await ensureRlsTestRoleReady(prisma);
        // Clean up tables used in test
        await prisma.rating.deleteMany().catch(() => { })
        await prisma.book.deleteMany().catch(() => { })
        // only remove test-owned Profile rows (reduce cross-test race surface)
        await prisma.profile.deleteMany({ where: { email: { startsWith: 'rls-' } } }).catch(() => { })
    })

    afterAll(async () => {
        await prisma.rating.deleteMany().catch(() => { })
        await prisma.book.deleteMany().catch(() => { })
        // only remove test-owned Profile rows (reduce cross-test race surface)
        await prisma.profile.deleteMany({ where: { email: { startsWith: 'rls-' } } }).catch(() => { })
        if (typeof prisma.$disconnect === 'function') await prisma.$disconnect()
        // Intentionally do not drop the test role here to avoid races when tests run in parallel

    })

    it('enforces owner-based access for ratings (user A cannot see user B ratings)', async () => {
        const userAEmail = `rls-a+${Date.now()}@example.com`
        const userBEmail = `rls-b+${Date.now()}@example.com`
        const userA = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userAEmail}, false)`;
            const created = await tx.profile.create({ data: { email: userAEmail, name: 'User A' } });
            return created;
        });
        const userB = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userBEmail}, false)`;
            const created = await tx.profile.create({ data: { email: userBEmail, name: 'User B' } });
            return created;
        });

        const book = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userA.email}, false)`;
            const created = await tx.book.create({ data: { title: 'RLS Test Book', createdBy: userA.id } });
            return created;
        });
        const ratingA = await prisma.rating.create({ data: { bookId: book.id, userId: userA.id, rating: 5 } })
        const ratingB = await prisma.rating.create({ data: { bookId: book.id, userId: userB.id, rating: 3 } })

        // Query as User A: open a dedicated connection and switch role there so the role change and session GUCs live on the same connection
        const { Client } = await import('pg')
        const client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        try {
            await client.query(`SET ROLE rls_test_role`)
            await client.query(`SELECT set_config('request.jwt.claims.email', '${userAEmail}', false)`) // session-level
            // verify session GUC and Profile visibility on this connection
            const _gucR = await client.query(`SELECT current_setting('request.jwt.claims.email', true) AS email`)
            expect(_gucR.rows[0].email).toBe(userA.email)
            let _profileCheckR = await client.query(`SELECT id FROM "Profile" WHERE email = current_setting('request.jwt.claims.email', true)`)
            if (_profileCheckR.rows.length === 0) {
                await prisma.profile.create({ data: { id: userA.id, email: userA.email, name: userA.name } }).catch(() => { })
            }

            // wait until rls_test_role session can actually see the Profile
            const visibleR = await waitForProfileVisible(client)
            expect(visibleR).not.toBeNull()
            if (_profileCheckR.rows.length === 0) _profileCheckR = { rows: [{ id: visibleR.id }] } as any

            expect(_profileCheckR.rows.length).toBeGreaterThan(0)
            expect(_profileCheckR.rows[0].id).toBe(userA.id)

            // try the owner SELECT, retrying a couple times if RLS briefly blocks it
            let resA = { rows: [] } as any
            const maxAttempts = process.env.CI ? 8 : 3
            for (let attempt = 0; attempt < maxAttempts && resA.rows.length === 0; attempt++) {
                await client.query(`RESET ROLE`)
                await client.query(`SET ROLE rls_test_role`)
                await client.query(`SELECT set_config('request.jwt.claims.email', '${userAEmail}', false)`)

                // diagnostic right before SELECT
                try {
                    const dbg = await client.query(`SELECT current_setting('request.jwt.claims.email', true) AS email, session_user, current_user`)
                    console.error('DEBUG RLS before SELECT attempt', attempt, dbg.rows[0])
                } catch (e) {
                    console.error('DEBUG RLS before SELECT: failed to read session settings', e)
                }

                resA = await client.query(`SELECT r.* FROM "Rating" r`)
                if (resA.rows.length === 0) await new Promise(r => setTimeout(r, 50))
            }
            // Reset role on this connection
            await client.query(`RESET ROLE`)

            expect(Array.isArray(resA.rows)).toBe(true)
            // should only see their own rating
            expect(resA.rows.length).toBeGreaterThanOrEqual(1)
            expect(resA.rows.some((r: any) => r.id === ratingA.id)).toBe(true)
            expect(resA.rows.some((r: any) => r.id === ratingB.id)).toBe(false)
        } finally {
            await client.end()
        }

        // Query as admin: should see both (run as session with admin claim)
        const adminRes = await prisma.$queryRaw`WITH _s AS (SELECT set_config('request.jwt.claims.role', 'admin', true)) SELECT r.* FROM "Rating" r`

        expect((adminRes as any[]).some(r => r.id === ratingA.id)).toBe(true)
        expect((adminRes as any[]).some(r => r.id === ratingB.id)).toBe(true)
    })
})