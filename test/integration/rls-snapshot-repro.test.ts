import { describe } from 'vitest'

const RUN_DB_TESTS = process.env.RUN_DB_INTEGRATION === 'true'

// TODO: This test verifies PostgreSQL snapshot isolation behavior with Profile RLS
// which has been removed in the simplified single-user schema. Skip for now.
describe.skip('RLS snapshot-visibility repro (local reproduction for CI flake)', () => {
    if (!RUN_DB_TESTS) {
        it.skip('skipped - requires RUN_DB_INTEGRATION=true', () => { })
        return
    }

    beforeAll(async () => {
        await initPrisma()
        await ensureRlsTestRoleReady(prisma)
    })

    it('session with an open transaction snapshot cannot see a later commit (repro)', async () => {
        const email = `rls-repro+${Date.now()}@example.com`

        const { Client } = await import('pg')
        let obs = new Client({ connectionString: process.env.DATABASE_URL })
        await obs.connect()
        try {
            // 1) Start a REPEATABLE READ transaction on the observer connection so its
            // snapshot is fixed and will *not* see later commits (this mirrors the CI race)
            await obs.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
            // execute a simple read to establish the snapshot in REPEATABLE READ mode
            await obs.query('SELECT 1')
            const txObsBefore = await obs.query('SELECT txid_current() AS txid')
            console.error('OBS tx before (repeatable-read):', txObsBefore.rows[0])

            // put observer into rls_test_role + set the email GUC (session-level)
            await obs.query('SET ROLE rls_test_role')
            await obs.query(`SELECT set_config('request.jwt.claims.email', '${email}', false)`)

            // 2) Create the Profile via Prisma (superuser/committed)
            const created = await prisma.profile.create({ data: { email, name: 'Repro' } })
            console.error('PRISMA created profile id:', created.id)
            const txPrisma = await prisma.$queryRaw`SELECT txid_current() AS txid`
            console.error('PRISMA txid (after create):', txPrisma)

            // 3) Observer (still inside BEGIN snapshot) should NOT see the newly created Profile
            const resInTxn = await obs.query(`SELECT id FROM "Profile" WHERE email = current_setting('request.jwt.claims.email', true)`)
            console.error('OBS select while in txn, rows:', resInTxn.rows)
            expect(resInTxn.rows.length).toBe(0)

            // 4) Rollback the observer transaction (refreshes snapshot) and re-check — now it should see the row
            await obs.query('ROLLBACK')
            // close + recreate the connection to guarantee a fresh session snapshot in pooled CI
            await obs.end()
            obs = new Client({ connectionString: process.env.DATABASE_URL })
            await obs.connect()
            // re-apply role/GUC on the fresh connection
            await obs.query('SET ROLE rls_test_role')
            await obs.query(`SELECT set_config('request.jwt.claims.email', '${email}', false)`)
            const txObsAfter = await obs.query('SELECT txid_current() AS txid, txid_current_snapshot() AS snapshot')
            console.error('OBS tx after reconnect:', txObsAfter.rows[0])
            const resAfter = await obs.query(`SELECT id FROM "Profile" WHERE email = current_setting('request.jwt.claims.email', true)`)
            console.error('OBS select after reconnect, rows:', resAfter.rows)
            expect(resAfter.rows.length).toBeGreaterThan(0)
            expect(resAfter.rows[0].id).toBe(created.id)
        } finally {
            await obs.end()
        }
    })
})
