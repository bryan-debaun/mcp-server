import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma, initPrisma } from '../../src/db'

const RUN_DB_TESTS = process.env.RUN_DB_INTEGRATION === 'true'

describe('RLS integration tests', () => {
    if (!RUN_DB_TESTS) {
        it.skip('skipped - requires RUN_DB_INTEGRATION=true', () => { })
        return
    }

    beforeAll(async () => {
        await initPrisma()
        // Ensure a non-super role exists for testing RLS behavior
        await prisma.$executeRaw`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rls_test_role') THEN CREATE ROLE rls_test_role NOINHERIT; END IF; END $$;`
        // Ensure role can access public schema objects (privileges are required for non-superusers to see tables)
        await prisma.$executeRaw`GRANT USAGE ON SCHEMA public TO rls_test_role`;
        await prisma.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_test_role`;
        // Clean up tables used in test
        await prisma.rating.deleteMany().catch(() => { })
        await prisma.book.deleteMany().catch(() => { })
        await prisma.user.deleteMany().catch(() => { })
    })

    afterAll(async () => {
        await prisma.rating.deleteMany().catch(() => { })
        await prisma.book.deleteMany().catch(() => { })
        await prisma.user.deleteMany().catch(() => { })
        if (typeof prisma.$disconnect === 'function') await prisma.$disconnect()
        // Clean up test role
        await prisma.$executeRaw`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rls_test_role') THEN REVOKE ALL ON ALL TABLES IN SCHEMA public FROM rls_test_role; REVOKE USAGE ON SCHEMA public FROM rls_test_role; DROP ROLE IF EXISTS rls_test_role; END IF; END $$;`
    })

    it('enforces owner-based access for ratings (user A cannot see user B ratings)', async () => {
        const userA = await prisma.user.create({ data: { email: 'rls-a@example.com', name: 'User A' } })
        const userB = await prisma.user.create({ data: { email: 'rls-b@example.com', name: 'User B' } })

        const book = await prisma.book.create({ data: { title: 'RLS Test Book', createdBy: userA.id } })
        const ratingA = await prisma.rating.create({ data: { bookId: book.id, userId: userA.id, rating: 5 } })
        const ratingB = await prisma.rating.create({ data: { bookId: book.id, userId: userB.id, rating: 3 } })

        // Query as User A: open a dedicated connection and switch role there so the role change and session GUCs live on the same connection
        const { Client } = await import('pg')
        const client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        try {
            await client.query(`SET ROLE rls_test_role`)
            await client.query(`SELECT set_config('request.jwt.claims.email', 'rls-a@example.com', false)`) // session-level
            const resA = await client.query(`SELECT r.* FROM "Rating" r`)
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