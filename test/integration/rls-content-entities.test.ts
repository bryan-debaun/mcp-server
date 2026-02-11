import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma, initPrisma } from '../../src/db'

const RUN_DB_TESTS = process.env.RUN_DB_INTEGRATION === 'true'

describe('RLS content entities tests', () => {
    if (!RUN_DB_TESTS) {
        it.skip('skipped - requires RUN_DB_INTEGRATION=true', () => { })
        return
    }

    beforeAll(async () => {
        await initPrisma()
        await prisma.$executeRaw`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rls_test_role') THEN CREATE ROLE rls_test_role NOINHERIT; END IF; END $$;`
        await prisma.$executeRaw`GRANT USAGE ON SCHEMA public TO rls_test_role`;
        await prisma.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_test_role`;
        await prisma.movie.deleteMany().catch(() => { })
        await prisma.videoGame.deleteMany().catch(() => { })
        await prisma.contentCreator.deleteMany().catch(() => { })
        await prisma.user.deleteMany().catch(() => { })
    })

    afterAll(async () => {
        await prisma.movie.deleteMany().catch(() => { })
        await prisma.videoGame.deleteMany().catch(() => { })
        await prisma.contentCreator.deleteMany().catch(() => { })
        await prisma.user.deleteMany().catch(() => { })
        if (typeof prisma.$disconnect === 'function') await prisma.$disconnect()
        await prisma.$executeRaw`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rls_test_role') THEN REVOKE ALL ON ALL TABLES IN SCHEMA public FROM rls_test_role; REVOKE USAGE ON SCHEMA public FROM rls_test_role; DROP ROLE IF EXISTS rls_test_role; END IF; END $$;`
    })

    it('enforces creator/admin writes for Movie', async () => {
        const userA = await prisma.user.create({ data: { email: 'rls-movie-a@example.com', name: 'Movie A' } })
        await prisma.user.create({ data: { email: 'rls-movie-b@example.com', name: 'Movie B' } })

        const movie = await prisma.movie.create({ data: { title: 'RLS Movie', createdBy: userA.id } })

        const { Client } = await import('pg')
        const client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        try {
            await client.query(`SET ROLE rls_test_role`)
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
        const userA = await prisma.user.create({ data: { email: 'rls-game-a@example.com', name: 'Game A' } })
        await prisma.user.create({ data: { email: 'rls-game-b@example.com', name: 'Game B' } })

        const game = await prisma.videoGame.create({ data: { title: 'RLS Game', platform: 'PC', createdBy: userA.id } })

        const { Client } = await import('pg')
        const client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        try {
            await client.query(`SET ROLE rls_test_role`)
            await client.query(`SELECT set_config('request.jwt.claims.email', 'rls-game-b@example.com', false)`)
            const resB = await client.query(`UPDATE "VideoGame" SET title = 'X' WHERE id = ${game.id}`)
            expect(resB.rowCount).toBe(0)

            await client.query(`SELECT set_config('request.jwt.claims.email', 'rls-game-a@example.com', false)`)
            const resA = await client.query(`UPDATE "VideoGame" SET title = 'Y' WHERE id = ${game.id}`)
            expect(resA.rowCount).toBeGreaterThan(0)

            await client.query(`SELECT set_config('request.jwt.claims.role', 'admin', true)`)
            const resAdmin = await client.query(`UPDATE "VideoGame" SET title = 'Z' WHERE id = ${game.id}`)
            expect(resAdmin.rowCount).toBeGreaterThan(0)

            await client.query(`RESET ROLE`)
        } finally {
            await client.end()
        }
    })

    it('enforces creator/admin writes for ContentCreator', async () => {
        const userA = await prisma.user.create({ data: { email: 'rls-cc-a@example.com', name: 'CC A' } })
        await prisma.user.create({ data: { email: 'rls-cc-b@example.com', name: 'CC B' } })

        const cc = await prisma.contentCreator.create({ data: { name: 'RLS CC', createdBy: userA.id } })

        const { Client } = await import('pg')
        const client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        try {
            await client.query(`SET ROLE rls_test_role`)
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