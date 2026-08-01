import { afterAll, describe, expect, it } from 'vitest'
import { initPrisma, prisma } from '../../src/db'

const RUN_DB_TESTS = process.env.RUN_DB_INTEGRATION === 'true'

/**
 * Does Row-Level Security actually apply to the connection **the application
 * uses**? (Operational readiness review, gap #7.)
 *
 * The review listed RLS as a defence-in-depth control, "migrations present,
 * enforcement path unverified". Verifying it turned up that RLS is **not an
 * active control for this application** â€” for three independent reasons, any one
 * of which is sufficient on its own:
 *
 *   1. The app connects as `postgres`, which **owns** every table. In Postgres
 *      the table owner bypasses RLS unless `FORCE ROW LEVEL SECURITY` is set â€”
 *      and no migration in this repo has ever used FORCE.
 *   2. That role also carries `rolbypassrls` in production, which skips policies
 *      regardless of ownership or FORCE.
 *   3. Most tables don't have RLS enabled at all any more. The single-user
 *      simplification (`20260219163147_simplify_single_user`) deliberately
 *      dropped policies and disabled RLS on the catalog tables.
 *
 * None of that is necessarily wrong: authorization for this service is enforced
 * in the application layer (OIDC JWT + `requireAdmin` + the MCP gateway key),
 * and for a single-user app that is a defensible place for it to live. What was
 * wrong was *believing* RLS was a second layer when it is inert.
 *
 * So this test does not assert that RLS works. It **pins the real posture** so
 * it cannot drift silently, and so that anyone who later enables RLS and assumes
 * they are protected gets a loud failure pointing them here instead of a false
 * sense of security.
 */
describe('RLS enforcement posture (ORR gap #7)', () => {
    if (!RUN_DB_TESTS) {
        it.skip('skipped - requires RUN_DB_INTEGRATION=true', () => {})
        return
    }

    afterAll(async () => {
        await initPrisma()
        if (typeof prisma.$disconnect === 'function') {
            await prisma.$disconnect()
        }
    })

    it('reports whether the app connection can bypass RLS', async () => {
        await initPrisma()

        const [role] = (await prisma.$queryRaw`SELECT current_user AS role,
                    (SELECT rolsuper     FROM pg_roles WHERE rolname = current_user) AS is_superuser,
                    (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS has_bypassrls`) as Array<{
            role: string
            is_superuser: boolean
            has_bypassrls: boolean
        }>

        const tables = (await prisma.$queryRaw`SELECT c.relname AS name,
                    pg_get_userbyid(c.relowner) AS owner,
                    c.relrowsecurity      AS rls_enabled,
                    c.relforcerowsecurity AS rls_forced
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname !~ '^_'`) as Array<{
            name: string
            owner: string
            rls_enabled: boolean
            rls_forced: boolean
        }>

        expect(tables.length).toBeGreaterThan(0)

        const ownsTables = tables.some((t) => t.owner === role.role)
        const bypassesAsOwner = ownsTables && tables.some((t) => !t.rls_forced)
        const bypasses =
            role.is_superuser || role.has_bypassrls || bypassesAsOwner

        // Pinning the *current* answer. If this ever fails, RLS enforcement has
        // changed â€” which is a good thing, but it means the security section of
        // docs/operational-readiness-review.md is now wrong and must be updated
        // to stop describing RLS as inert. Do not "fix" this by flipping the
        // expectation without reading Â§9.
        expect(bypasses).toBe(true)
    })

    it('has no table using FORCE ROW LEVEL SECURITY', async () => {
        await initPrisma()
        const forced = (await prisma.$queryRaw`SELECT c.relname AS name
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r'
               AND c.relforcerowsecurity = true`) as Array<{ name: string }>

        // Without FORCE, an owner-connected app is never subject to its own
        // policies. This is the single change that would matter most if RLS is
        // ever meant to become a real control.
        expect(forced.map((t) => t.name)).toEqual([])
    })

    it('policies that exist do not constrain the app connection', async () => {
        await initPrisma()
        const withPolicies =
            (await prisma.$queryRaw`SELECT c.relname AS name, count(p.oid)::int AS policies
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             LEFT JOIN pg_policy p ON p.polrelid = c.oid
             WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname !~ '^_'
             GROUP BY c.relname HAVING count(p.oid) > 0`) as Array<{
                name: string
                policies: number
            }>

        // Documented, not asserted to be empty: some tables genuinely do carry
        // policies (Article, Bet, Resume, ResumeDownloadRequest in production).
        // They are simply never evaluated for this connection. Whoever wrote
        // them was reasonably expecting protection that isn't there.
        for (const t of withPolicies) {
            expect(t.policies).toBeGreaterThan(0)
        }
    })
})
