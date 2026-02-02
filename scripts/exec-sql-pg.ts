#!/usr/bin/env tsx
import fs from 'fs'
import path from 'path'
import process from 'process'
import { Client } from 'pg'

async function main() {
    const args = process.argv.slice(2)
    if (args.length === 0) {
        console.error('Usage: exec-sql-pg.ts <sql-file>')
        process.exit(1)
    }
    const file = path.resolve(args[0])
    const sql = fs.readFileSync(file, 'utf8')
    const conn = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mcp_dev'

    const client = new Client({ connectionString: conn })
    await client.connect()
    try {
        const res = await client.query(sql)
        console.log('OK', res.command, res.rowCount)
    } catch (err: any) {
        console.error('PG ERROR:', err.message || err)
        process.exit(2)
    } finally {
        await client.end()
    }
}

main().catch(err => { console.error(err); process.exit(99) })
