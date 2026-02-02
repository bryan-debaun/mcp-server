import { Client } from 'pg'
import fs from 'fs'

const sqlFile = process.argv[2]
if (!sqlFile) {
    console.error('Usage: node scripts/exec-sql-pg.js <sql-file>')
    process.exit(1)
}
const sql = fs.readFileSync(sqlFile, 'utf8')
const connection = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mcp_dev'
    ; (async () => {
        const client = new Client({ connectionString: connection })
        await client.connect()
        try {
            console.log('Executing...')
            const res = await client.query(sql)
            console.log('OK', res.command, res.rowCount)
        } catch (err) {
            console.error('PG ERROR:', err)
            process.exit(1)
        } finally {
            await client.end()
        }
    })()
