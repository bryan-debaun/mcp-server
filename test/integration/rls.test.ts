import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma, initPrisma } from '../../src/db'
import { ensureRlsTestRoleReady } from '../utils/db-utils'

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
        await prisma.profile.deleteMany().catch(() => { })
    })

    afterAll(async () => {
        await prisma.rating.deleteMany().catch(() => { })
        await prisma.book.deleteMany().catch(() => { })
        await prisma.profile.deleteMany().catch(() => { })
        if (typeof prisma.$disconnect === 'function') await prisma.$disconnect()
        // Intentionally do not drop the test role here to avoid races when tests run in parallel

    })

    it('enforces owner-based access for ratings (user A cannot see user B ratings)', async () => {
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', 'rls-a@example.com', false)`;
        const userA = await prisma.profile.create({ data: { email: 'rls-a@example.com', name: 'User A' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', 'rls-b@example.com', false)`;
        const userB = await prisma.profile.create({ data: { email: 'rls-b@example.com', name: 'User B' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;

        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userA.email}, false)`;
        const book = await prisma.book.create({ data: { title: 'RLS Test Book', createdBy: userA.id } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;
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