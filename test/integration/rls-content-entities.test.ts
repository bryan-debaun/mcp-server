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
        // only remove test-owned Profile rows (reduce cross-test race surface)
        await prisma.profile.deleteMany({ where: { email: { startsWith: 'rls-' } } }).catch(() => { })
    })

    afterAll(async () => {
        await prisma.movie.deleteMany().catch(() => { })
        await prisma.videoGame.deleteMany().catch(() => { })
        await prisma.contentCreator.deleteMany().catch(() => { })
        // only remove test-owned Profile rows (reduce cross-test race surface)
        await prisma.profile.deleteMany({ where: { email: { startsWith: 'rls-' } } }).catch(() => { })
        if (typeof prisma.$disconnect === 'function') await prisma.$disconnect()
        // Intentionally do not drop the test role here to avoid races when tests run in parallel

    })

    it('enforces creator/admin writes for Movie', async () => {
        const movieAEmail = `rls-movie-a+${Date.now()}@example.com`
        const movieBEmail = `rls-movie-b+${Date.now()}@example.com`
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${movieAEmail}, false)`;
        const userA = await prisma.profile.create({ data: { email: movieAEmail, name: 'Movie A' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${movieBEmail}, false)`;
        const userB = await prisma.profile.create({ data: { email: movieBEmail, name: 'Movie B' } })
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
            await client.query(`SELECT set_config('request.jwt.claims.email', '${movieBEmail}', false)`)
            const resB = await client.query(`UPDATE "Movie" SET title = 'X' WHERE id = ${movie.id}`)
            expect(resB.rowCount).toBe(0)

            // User A should be able to update
            await client.query(`SELECT set_config('request.jwt.claims.email', '${movieAEmail}', false)`)
            // verify session GUC and Profile visibility on this connection
            const _guc = await client.query(`SELECT current_setting('request.jwt.claims.email', true) AS email`)
            expect(_guc.rows[0].email).toBe(userA.email)
            let _profileCheck = await client.query(`SELECT id FROM "Profile" WHERE email = current_setting('request.jwt.claims.email', true)`)
            // defensive: if another test cleaned profiles concurrently, create the expected Profile on *this* connection
            if (_profileCheck.rows.length === 0) {
                // create the row using the same session so RLS + visibility are satisfied
                await client.query(`INSERT INTO "Profile" (id, email, name, "createdAt", "updatedAt", blocked) VALUES (${userA.id}, '${userA.email}', '${userA.name}', now(), now(), false) ON CONFLICT (id) DO NOTHING`)
                _profileCheck = await client.query(`SELECT id FROM "Profile" WHERE email = current_setting('request.jwt.claims.email', true)`)
            }
            expect(_profileCheck.rows.length).toBeGreaterThan(0)
            expect(_profileCheck.rows[0].id).toBe(movie.createdBy)
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
        const gameAEmail = `rls-game-a+${Date.now()}@example.com`
        const gameBEmail = `rls-game-b+${Date.now()}@example.com`
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${gameAEmail}, false)`;
        const userA = await prisma.profile.create({ data: { email: gameAEmail, name: 'Game A' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${gameBEmail}, false)`;
        const userB = await prisma.profile.create({ data: { email: gameBEmail, name: 'Game B' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;

        // Set session claim for insert
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userA.email}, false)`;
        // defensive: ensure the Profile still exists (other tests may call profile.deleteMany concurrently)
        let profileForCreate = await prisma.profile.findUnique({ where: { email: userA.email } })
        if (!profileForCreate) {
            profileForCreate = await prisma.profile.create({ data: { email: userA.email, name: userA.name } })
        }
        const game = await prisma.videoGame.create({ data: { title: 'RLS Game', platform: 'PC', createdBy: profileForCreate.id } })
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
            await client.query(`SELECT set_config('request.jwt.claims.email', '${gameBEmail}', false)`)
            const resB = await client.query(`UPDATE "VideoGame" SET title = 'X' WHERE id = ${game.id}`)
            expect(resB.rowCount).toBe(0)

            await client.query(`SELECT set_config('request.jwt.claims.email', '${gameAEmail}', false)`)
            // verify session GUC and Profile visibility on this connection
            const _gucVG = await client.query(`SELECT current_setting('request.jwt.claims.email', true) AS email`)
            expect(_gucVG.rows[0].email).toBe(userA.email)
            let _profileCheckVG = await client.query(`SELECT id FROM "Profile" WHERE email = current_setting('request.jwt.claims.email', true)`)
            if (_profileCheckVG.rows.length === 0) {
                await client.query(`INSERT INTO "Profile" (id, email, name, "createdAt", "updatedAt", blocked) VALUES (${userA.id}, '${userA.email}', '${userA.name}', now(), now(), false) ON CONFLICT (id) DO NOTHING`)
                _profileCheckVG = await client.query(`SELECT id FROM "Profile" WHERE email = current_setting('request.jwt.claims.email', true)`)
            }
            expect(_profileCheckVG.rows.length).toBeGreaterThan(0)
            expect(_profileCheckVG.rows[0].id).toBe(game.createdBy)
            let resA = await client.query(`UPDATE "VideoGame" SET title = 'Y' WHERE id = ${game.id}`)
            if (resA.rowCount === 0) {
                // transient: re-ensure role/grants and retry (makes CI resilient to racey setup/teardown)
                await ensureRlsTestRoleReady(prisma)
                await client.query(`RESET ROLE`)
                await client.query(`SET ROLE rls_test_role`)
                await client.query(`SELECT set_config('request.jwt.claims.email', '${gameAEmail}', false)`)
                resA = await client.query(`UPDATE "VideoGame" SET title = 'Y' WHERE id = ${game.id}`)
            }
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
        const ccAEmail = `rls-cc-a+${Date.now()}@example.com`
        const ccBEmail = `rls-cc-b+${Date.now()}@example.com`
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${ccAEmail}, false)`;
        const userA = await prisma.profile.create({ data: { email: ccAEmail, name: 'CC A' } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${ccBEmail}, false)`;
        await prisma.profile.create({ data: { email: ccBEmail, name: 'CC B' } })
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
            await client.query(`SELECT set_config('request.jwt.claims.email', '${ccBEmail}', false)`)
            const resB = await client.query(`UPDATE "ContentCreator" SET name = 'X' WHERE id = ${cc.id}`)
            expect(resB.rowCount).toBe(0)

            await client.query(`SELECT set_config('request.jwt.claims.email', '${ccAEmail}', false)`)
            // verify session GUC and Profile visibility on this connection
            const _gucCC = await client.query(`SELECT current_setting('request.jwt.claims.email', true) AS email`)
            expect(_gucCC.rows[0].email).toBe(userA.email)
            let _profileCheckCC = await client.query(`SELECT id FROM "Profile" WHERE email = current_setting('request.jwt.claims.email', true)`)
            if (_profileCheckCC.rows.length === 0) {
                await client.query(`INSERT INTO "Profile" (id, email, name, "createdAt", "updatedAt", blocked) VALUES (${userA.id}, '${userA.email}', '${userA.name}', now(), now(), false) ON CONFLICT (id) DO NOTHING`)
                _profileCheckCC = await client.query(`SELECT id FROM "Profile" WHERE email = current_setting('request.jwt.claims.email', true)`)
            }
            expect(_profileCheckCC.rows.length).toBeGreaterThan(0)
            expect(_profileCheckCC.rows[0].id).toBe(cc.createdBy)
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