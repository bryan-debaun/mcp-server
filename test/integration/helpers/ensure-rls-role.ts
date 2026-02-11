// Test helper to ensure the rls_test_role exists and is usable for integration tests
export async function ensureRlsTestRoleReady(prisma: any) {
    // Retry loop with backoff to avoid transient race conditions in parallel test runs
    for (let i = 0; i < 5; i++) {
        try {
            // Create role if it does not exist (ignore duplicate errors)
            try {
                await prisma.$executeRaw`CREATE ROLE rls_test_role NOINHERIT`;
            } catch (e) {
                // ignore
            }

            // Grant the minimum privileges required for tests
            await prisma.$executeRaw`GRANT USAGE ON SCHEMA public TO rls_test_role`;
            await prisma.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_test_role`;

            // Verify we can SET ROLE on a fresh connection
            const { Client } = await import('pg');
            const client = new Client({ connectionString: process.env.DATABASE_URL });
            await client.connect();
            await client.query('SET ROLE rls_test_role');
            await client.query('RESET ROLE');
            await client.end();

            // Success
            return;
        } catch (e) {
            // Wait a bit and retry
            await new Promise(r => setTimeout(r, 200 * (i + 1)));
        }
    }

    throw new Error(
        'rls_test_role could not be created or granted privileges. Run as a superuser: CREATE ROLE rls_test_role NOINHERIT; GRANT USAGE ON SCHEMA public TO rls_test_role; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_test_role;'
    );
}
