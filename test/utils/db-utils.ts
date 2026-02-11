import type { PrismaClient } from '@prisma/client'

export async function ensureRlsTestRoleReady(prisma: PrismaClient, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            // best-effort create (ignore duplicate/permission errors)
            await prisma.$executeRaw`CREATE ROLE rls_test_role NOINHERIT`;
        } catch (e) {
            // ignore - role may already exist or permissions may prevent creation
        }

        try {
            // grant what a non-superuser needs to run the tests
            await prisma.$executeRaw`GRANT USAGE ON SCHEMA public TO rls_test_role`;
            await prisma.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_test_role`;

            // verify on a fresh connection that SET ROLE succeeds
            const { Client } = await import('pg')
            const client = new Client({ connectionString: process.env.DATABASE_URL })
            await client.connect()
            try {
                await client.query('SET ROLE rls_test_role')
                await client.query('RESET ROLE')
            } finally {
                await client.end()
            }

            return
        } catch (err) {
            if (i === retries - 1) {
                throw new Error(
                    "rls_test_role could not be created or granted privileges. Please run as a DB superuser:\n" +
                    "CREATE ROLE rls_test_role NOINHERIT;\n" +
                    "GRANT USAGE ON SCHEMA public TO rls_test_role;\n" +
                    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_test_role;"
                )
            }
            // backoff and retry
            await new Promise(r => setTimeout(r, 250 * (i + 1)))
        }
    }
}
