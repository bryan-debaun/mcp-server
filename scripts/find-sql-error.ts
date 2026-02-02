#!/usr/bin/env tsx
import path from 'path'
import process from 'process'
import { parseSqlStatements, readSqlFile, executeStatements } from '../src/tools/sql.js'

function usage() {
    console.log('Usage: find-sql-error.ts <path-to-sql-file> [--dry-run] [--apply]')
    process.exit(1)
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length === 0) usage()

    const file = args[0]
    const dryRun = args.includes('--dry-run')
    const apply = args.includes('--apply')

    const full = path.resolve(file)
    const sql = readSqlFile(full)
    const statements = parseSqlStatements(sql)

    console.log(`Parsed ${statements.length} statements from ${file}`)

    // Sanity check: disallow comma-separated action lists in CREATE POLICY statements (Postgres syntax error)
    // Detect patterns like: CREATE POLICY ... FOR INSERT, UPDATE or FOR UPDATE, DELETE (comma between actions)
    const policyCommaRegex = /CREATE\s+POLICY[\s\S]*?FOR\s+(?:INSERT|UPDATE|DELETE)\s*,\s*(?:INSERT|UPDATE|DELETE)/i
    const bad = statements.find(s => policyCommaRegex.test(s))
    if (bad) {
        console.error('Invalid CREATE POLICY: comma-separated action list detected. Use one policy per action or FOR ALL instead. Offending statement:')
        console.error(bad)
        process.exit(4)
    }

    if (dryRun && !apply) {
        console.log('Dry-run mode: not executing statements')
        return
    }

    if (apply) {
        const conn = process.env.DATABASE_URL
        if (!conn) {
            console.error('DATABASE_URL must be set to run --apply')
            process.exit(2)
        }

        try {
            await executeStatements(conn, statements, (i, s) => {
                console.log(`Executing statement ${i + 1}/${statements.length}: ${s.slice(0, 120).replace(/\n/g, ' ')}...`)
            })
            console.log('All statements executed successfully')
        } catch (err: any) {
            console.error('Execution failed:', err.message || err)
            process.exit(3)
        }
    }
}

main().catch(err => { console.error(err); process.exit(99) })
