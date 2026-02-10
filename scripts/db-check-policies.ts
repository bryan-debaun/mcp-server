import { Client } from 'pg'

async function main() {
    const conn = process.env.DATABASE_URL
    if (!conn) throw new Error('DATABASE_URL not set')
    const c = new Client({ connectionString: conn })
    await c.connect()

    const tables = ['Role', 'Author', 'Book', 'Rating', 'RatingAggregate']
    const res = await c.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY($1)`, [tables])
    console.log('RLS flags:', res.rows)

    const res2 = await c.query(`SELECT policyname, tablename, cmd, qual IS NOT NULL as has_using, with_check IS NOT NULL as has_with_check FROM pg_policies WHERE schemaname='public' AND tablename = ANY($1) ORDER BY tablename, policyname`, [tables])
    console.log('Policies:')
    for (const row of res2.rows) console.log(row)

    const mig = await c.query(`SELECT migration_name, started_at, finished_at, logs FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5`)
    console.log('Recent migrations:')
    for (const row of mig.rows) {
        const shortenedLogs = row.logs ? (row.logs.length > 200 ? row.logs.slice(0, 200) + '...' : row.logs) : null
        console.log({ migration_name: row.migration_name, started_at: row.started_at, finished_at: row.finished_at, logs: shortenedLogs })
    }

    await c.end()
}

main().catch(e => { console.error(e); process.exit(1) })
