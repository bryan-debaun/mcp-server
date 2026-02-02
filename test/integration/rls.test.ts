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
        // Clean up tables used in test
        await prisma.rating.deleteMany().catch(() => { })
        await prisma.user.deleteMany().catch(() => { })
    })

    afterAll(async () => {
        await prisma.rating.deleteMany().catch(() => { })
        await prisma.user.deleteMany().catch(() => { })
        if (typeof prisma.$disconnect === 'function') await prisma.$disconnect()
    })

    it('enforces owner-based access for ratings (user A cannot see user B ratings)', async () => {
        const userA = await prisma.user.create({ data: { email: 'rls-a@example.com', name: 'User A' } })
        const userB = await prisma.user.create({ data: { email: 'rls-b@example.com', name: 'User B' } })

        const ratingA = await prisma.rating.create({ data: { bookId: 1, userId: userA.id, rating: 5 } })
        const ratingB = await prisma.rating.create({ data: { bookId: 1, userId: userB.id, rating: 3 } })

        // Query as User A: set JWT email claim in session and query ratings
        const asA = await prisma.$queryRawUnsafe(`
      WITH _s AS (SELECT set_config('request.jwt.claims.email', 'rls-a@example.com', true))
      SELECT r.* FROM "Rating" r
    `)

        expect(Array.isArray(asA)).toBe(true)
        // should only see their own rating
        expect((asA as any[]).length).toBeGreaterThanOrEqual(1)
        expect((asA as any[]).some(r => r.id === ratingA.id)).toBe(true)
        expect((asA as any[]).some(r => r.id === ratingB.id)).toBe(false)

        // Query as admin: should see both
        const asAdmin = await prisma.$queryRawUnsafe(`
      WITH _s AS (SELECT set_config('request.jwt.claims.role', 'admin', true))
      SELECT r.* FROM "Rating" r
    `)

        expect((asAdmin as any[]).some(r => r.id === ratingA.id)).toBe(true)
        expect((asAdmin as any[]).some(r => r.id === ratingB.id)).toBe(true)
    })
})