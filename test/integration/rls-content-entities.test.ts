import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma, initPrisma } from '../../src/db'
import { ensureRlsTestRoleReady } from '../utils/db-utils'

const RUN_DB_TESTS = process.env.RUN_DB_INTEGRATION === 'true'

describe('RLS content entities tests', () => {
    if (!RUN_DB_TESTS) {
        it.skip('skipped - requires RUN_DB_INTEGRATION=true', () => { })
        return
    }

    beforeAll(async () => {
        await initPrisma()
        await ensureRlsTestRoleReady(prisma);
        await prisma.movie.deleteMany().catch(() => { })
        await prisma.videoGame.deleteMany().catch(() => { })
        await prisma.contentCreator.deleteMany().catch(() => { })
        await prisma.profile.deleteMany().catch(() => { })
    })

    afterAll(async () => {
        await prisma.movie.deleteMany().catch(() => { })
        await prisma.videoGame.deleteMany().catch(() => { })
        await prisma.contentCreator.deleteMany().catch(() => { })
        await prisma.profile.deleteMany().catch(() => { })
        if (typeof prisma.$disconnect === 'function') await prisma.$disconnect()
        // Intentionally do not drop the test role here to avoid races when tests run in parallel

    })

    it('enforces creator/admin writes for Movie', async () => {
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', 'rls-movie-a@example.com', false)`;
        const userA = await prisma.profile.create({ data: { email: 'rls-movie-a@example.com', name: 'Movie A' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', 'rls-movie-b@example.com', false)`;
        await prisma.profile.create({ data: { email: 'rls-movie-b@example.com', name: 'Movie B' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;

        // Set session-level JWT claim so RLS INSERT WITH CHECK (creator match) succeeds
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userA.email}, false)`;
        const movie = await prisma.movie.create({ data: { title: 'RLS Movie', createdBy: userA.id } })
        // Reset the session claim
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;

        const { Client } = await import('pg')
        const client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        try {
            try {
                await client.query(`SET ROLE rls_test_role`)
            } catch (e) {
                // try to re-create role and retry (handles transient race/drop)
                await ensureRlsTestRoleReady(prisma)
                await client.query(`SET ROLE rls_test_role`)
            }
            // User B should not be able to update
            await client.query(`SELECT set_config('request.jwt.claims.email', 'rls-movie-b@example.com', false)`)
            const resB = await client.query(`UPDATE "Movie" SET title = 'X' WHERE id = ${movie.id}`)
            expect(resB.rowCount).toBe(0)

            // User A should be able to update
            await client.query(`SELECT set_config('request.jwt.claims.email', 'rls-movie-a@example.com', false)`)
            const resA = await client.query(`UPDATE "Movie" SET title = 'Y' WHERE id = ${movie.id}`)
            expect(resA.rowCount).toBeGreaterThan(0)

            // Admin should be able to update
            await client.query(`SELECT set_config('request.jwt.claims.role', 'admin', true)`)
            const resAdmin = await client.query(`UPDATE "Movie" SET title = 'Z' WHERE id = ${movie.id}`)
            expect(resAdmin.rowCount).toBeGreaterThan(0)

            await client.query(`RESET ROLE`)
        } finally {
            await client.end()
        }
    })

    it('enforces creator/admin writes for VideoGame', async () => {
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', 'rls-game-a@example.com', false)`;
        const userA = await prisma.profile.create({ data: { email: 'rls-game-a@example.com', name: 'Game A' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', 'rls-game-b@example.com', false)`;
        await prisma.profile.create({ data: { email: 'rls-game-b@example.com', name: 'Game B' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;

        // Set session claim for insert
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userA.email}, false)`;
        const game = await prisma.videoGame.create({ data: { title: 'RLS Game', platform: 'PC', createdBy: userA.id } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;

        const { Client } = await import('pg')
        const client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        try {
            try {
                await client.query(`SET ROLE rls_test_role`)
            } catch (e) {
                await ensureRlsTestRoleReady(prisma)
                await client.query(`SET ROLE rls_test_role`)
            }
            await client.query(`SELECT set_config('request.jwt.claims.email', 'rls-game-b@example.com', false)`)
            const resB = await client.query(`UPDATE "VideoGame" SET title = 'X' WHERE id = ${game.id}`)
            expect(resB.rowCount).toBe(0)

            await client.query(`SELECT set_config('request.jwt.claims.email', 'rls-game-a@example.com', false)`)
            const resA = await client.query(`UPDATE "VideoGame" SET title = 'Y' WHERE id = ${game.id}`)
            expect(resA.rowCount).toBeGreaterThan(0)

            await client.query(`SELECT set_config('request.jwt.claims.role', 'admin', true)`)
            let resAdmin = await client.query(`UPDATE "VideoGame" SET title = 'Z' WHERE id = ${game.id}`)
            if (resAdmin.rowCount === 0) {
                // transient: try to re-ensure role/grants and retry
                await ensureRlsTestRoleReady(prisma)
                await client.query(`SELECT set_config('request.jwt.claims.role', 'admin', true)`)
                resAdmin = await client.query(`UPDATE "VideoGame" SET title = 'Z' WHERE id = ${game.id}`)
            }
            expect(resAdmin.rowCount).toBeGreaterThan(0)

            await client.query(`RESET ROLE`)
        } finally {
            await client.end()
        }
    })

    it('enforces creator/admin writes for ContentCreator', async () => {
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', 'rls-cc-a@example.com', false)`;
        const userA = await prisma.profile.create({ data: { email: 'rls-cc-a@example.com', name: 'CC A' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', 'rls-cc-b@example.com', false)`;
        await prisma.profile.create({ data: { email: 'rls-cc-b@example.com', name: 'CC B' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;

        // Set session claim for insert
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userA.email}, false)`;
        const cc = await prisma.contentCreator.create({ data: { name: 'RLS CC', createdBy: userA.id } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;

        const { Client } = await import('pg')
        const client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        try {
            try {
                await client.query(`SET ROLE rls_test_role`)
            } catch (e) {
                await ensureRlsTestRoleReady(prisma)
                await client.query(`SET ROLE rls_test_role`)
            }
            await client.query(`SELECT set_config('request.jwt.claims.email', 'rls-cc-b@example.com', false)`)
            const resB = await client.query(`UPDATE "ContentCreator" SET name = 'X' WHERE id = ${cc.id}`)
            expect(resB.rowCount).toBe(0)

            await client.query(`SELECT set_config('request.jwt.claims.email', 'rls-cc-a@example.com', false)`)
            const resA = await client.query(`UPDATE "ContentCreator" SET name = 'Y' WHERE id = ${cc.id}`)
            expect(resA.rowCount).toBeGreaterThan(0)

            await client.query(`SELECT set_config('request.jwt.claims.role', 'admin', true)`)
            const resAdmin = await client.query(`UPDATE "ContentCreator" SET name = 'Z' WHERE id = ${cc.id}`)
            expect(resAdmin.rowCount).toBeGreaterThan(0)

            await client.query(`RESET ROLE`)
        } finally {
            await client.end()
        }
    })
})