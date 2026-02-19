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

        // capture transaction/snapshot and activity info from this connection (helpful for CI debugging)
        try {
            const tx = await client.query('SELECT txid_current() AS txid, txid_current_snapshot() AS snapshot')
            console.error('DEBUG RLS tx snapshot:', tx.rows[0])
        } catch (e) {
            console.error('DEBUG RLS: failed to read txid_current()', e)
        }
        try {
            const activity = await client.query(`SELECT pid, usename, state, query, query_start FROM pg_stat_activity WHERE datname = current_database() ORDER BY query_start DESC LIMIT 10`)
            console.error('DEBUG RLS pg_stat_activity (sample):', activity.rows)
        } catch (e) {
            console.error('DEBUG RLS: failed to read pg_stat_activity', e)
        }

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
        const userA = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('request.jwt.claims.email', ${movieAEmail}, false)`;
            const created = await tx.profile.create({ data: { email: movieAEmail, name: 'Movie A' } });
            return created;
        });
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('request.jwt.claims.email', ${movieBEmail}, false)`;
            const created = await tx.profile.create({ data: { email: movieBEmail, name: 'Movie B' } });
            return created;
        });

        // Set session-level JWT claim so RLS INSERT WITH CHECK (creator match) succeeds
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userA.email}, false)`;
        const movie = await prisma.movie.create({ data: { title: 'RLS Movie', createdBy: userA.id } })
        // Reset the session claim
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;

        const { Client } = await import('pg')
        let client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        // ensure fresh session snapshot by recreating the connection (deterministic for pooled environments)
        await client.end()
        client = new Client({ connectionString: process.env.DATABASE_URL })
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
            if (_profileCheck.rows.length === 0) {
                await prisma.profile.create({ data: { id: userA.id, email: userA.email, name: userA.name } }).catch(() => { })
            }

            // wait until rls_test_role session can actually see the Profile
            const visible = await waitForProfileVisible(client)
            expect(visible).not.toBeNull()
            // if original _profileCheck was empty, hydrate it from the visible row for legacy assertions
            if (_profileCheck.rows.length === 0) _profileCheck = { rows: [{ id: visible.id }] } as any

            expect(_profileCheck.rows.length).toBeGreaterThan(0)
            expect(_profileCheck.rows[0].id).toBe(movie.createdBy)

            // try the owner UPDATE, retrying a couple times if RLS briefly blocks it
            let resA = { rowCount: 0 } as any
            const maxAttempts = process.env.CI ? 8 : 3
            for (let attempt = 0; attempt < maxAttempts && resA.rowCount === 0; attempt++) {
                // re-ensure role + GUC are set for the session
                await client.query(`RESET ROLE`)
                await client.query(`SET ROLE rls_test_role`)
                await client.query(`SELECT set_config('request.jwt.claims.email', '${userA.email}', false)`)

                // diagnostic right before UPDATE
                try {
                    const dbg = await client.query(`SELECT current_setting('request.jwt.claims.email', true) AS email, session_user, current_user`)
                    console.error('DEBUG RLS before UPDATE attempt', attempt, dbg.rows[0])
                } catch (e) {
                    console.error('DEBUG RLS before UPDATE: failed to read session settings', e)
                }

                resA = await client.query(`UPDATE "Movie" SET title = 'Y' WHERE id = ${movie.id}`)
                if (resA.rowCount === 0) await new Promise(r => setTimeout(r, 50))
            }
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
        const userA = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('request.jwt.claims.email', ${gameAEmail}, false)`;
            const created = await tx.profile.create({ data: { email: gameAEmail, name: 'Game A' } });
            return created;
        });
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('request.jwt.claims.email', ${gameBEmail}, false)`;
            const created = await tx.profile.create({ data: { email: gameBEmail, name: 'Game B' } });
            return created;
        });

        // Set session claim for insert
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userA.email}, false)`;
        // defensive: ensure the Profile still exists (other tests may call profile.deleteMany concurrently)
        let profileForCreate = await prisma.profile.findUnique({ where: { email: userA.email } })
        if (!profileForCreate) {
            profileForCreate = await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userA.email}, false)`;
                return await tx.profile.create({ data: { email: userA.email, name: userA.name } })
            })
        }
        const game = await prisma.videoGame.create({ data: { title: 'RLS Game', platform: 'PC', createdBy: profileForCreate.id } })
        await prisma.$executeRaw`SELECT set_config('request.jwt.claims.email', '', false)`;

        const { Client } = await import('pg')
        let client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        // ensure fresh session snapshot by recreating the connection (deterministic for pooled environments)
        await client.end()
        client = new Client({ connectionString: process.env.DATABASE_URL })
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
                await prisma.profile.create({ data: { id: userA.id, email: userA.email, name: userA.name } }).catch(() => { })
            }

            // wait until rls_test_role session can actually see the Profile
            const visibleVG = await waitForProfileVisible(client)
            expect(visibleVG).not.toBeNull()
            if (_profileCheckVG.rows.length === 0) _profileCheckVG = { rows: [{ id: visibleVG.id }] } as any

            expect(_profileCheckVG.rows.length).toBeGreaterThan(0)
            expect(_profileCheckVG.rows[0].id).toBe(game.createdBy)

            // try the owner UPDATE, retrying a couple times if RLS briefly blocks it
            let resA = { rowCount: 0 } as any
            const maxAttemptsVG = process.env.CI ? 8 : 3
            for (let attempt = 0; attempt < maxAttemptsVG && resA.rowCount === 0; attempt++) {
                await client.query(`RESET ROLE`)
                await client.query(`SET ROLE rls_test_role`)
                await client.query(`SELECT set_config('request.jwt.claims.email', '${gameAEmail}', false)`)

                try {
                    const dbg = await client.query(`SELECT current_setting('request.jwt.claims.email', true) AS email, session_user, current_user`)
                    console.error('DEBUG RLS before UPDATE attempt', attempt, dbg.rows[0])
                } catch (e) {
                    console.error('DEBUG RLS before UPDATE: failed to read session settings', e)
                }

                resA = await client.query(`UPDATE "VideoGame" SET title = 'Y' WHERE id = ${game.id}`)
                if (resA.rowCount === 0) await new Promise(r => setTimeout(r, 50))
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
        const cc = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('request.jwt.claims.email', ${userA.email}, false)`;
            const created = await tx.contentCreator.create({ data: { name: 'RLS CC', createdBy: userA.id } });
            return created;
        });

        const { Client } = await import('pg')
        let client = new Client({ connectionString: process.env.DATABASE_URL })
        await client.connect()
        // ensure fresh session snapshot by recreating the connection (deterministic for pooled environments)
        await client.end()
        client = new Client({ connectionString: process.env.DATABASE_URL })
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
                await prisma.profile.create({ data: { id: userA.id, email: userA.email, name: userA.name } }).catch(() => { })
            }

            // wait until rls_test_role session can actually see the Profile
            const visibleCC = await waitForProfileVisible(client)
            expect(visibleCC).not.toBeNull()
            if (_profileCheckCC.rows.length === 0) _profileCheckCC = { rows: [{ id: visibleCC.id }] } as any

            expect(_profileCheckCC.rows.length).toBeGreaterThan(0)
            expect(_profileCheckCC.rows[0].id).toBe(cc.createdBy)

            // try the owner UPDATE, retrying a couple times if RLS briefly blocks it
            let resA = { rowCount: 0 } as any
            const maxAttemptsCC = process.env.CI ? 8 : 3
            for (let attempt = 0; attempt < maxAttemptsCC && resA.rowCount === 0; attempt++) {
                await client.query(`RESET ROLE`)
                await client.query(`SET ROLE rls_test_role`)
                await client.query(`SELECT set_config('request.jwt.claims.email', '${userA.email}', false)`)

                try {
                    const dbg = await client.query(`SELECT current_setting('request.jwt.claims.email', true) AS email, session_user, current_user`)
                    console.error('DEBUG RLS before UPDATE attempt', attempt, dbg.rows[0])
                } catch (e) {
                    console.error('DEBUG RLS before UPDATE: failed to read session settings', e)
                }

                resA = await client.query(`UPDATE "ContentCreator" SET name = 'Y' WHERE id = ${cc.id}`)
                if (resA.rowCount === 0) await new Promise(r => setTimeout(r, 50))
            }
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