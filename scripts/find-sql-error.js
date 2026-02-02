import fs from 'fs'
import { execSync } from 'child_process'

const file = 'prisma/migrations/20260202110000_enable_rls/migration.sql'
const sql = fs.readFileSync(file, 'utf8')
// naive split on semicolon - works for our statements
const parts = sql.split(';').map(s => s.trim()).filter(Boolean)
console.log(`Found ${parts.length} statements`)

for (let i = 0; i < parts.length; i++) {
    const stmt = parts[i] + ';\n'
    console.log(`\n--- Statement ${i + 1}/${parts.length} ---`)
    console.log(stmt.slice(0, 400))
    const tmp = `.tmp_stmt_${i}.sql`
    fs.writeFileSync(tmp, stmt, 'utf8')
    try {
        execSync(`npx prisma db execute --file ${tmp}`, { stdio: 'inherit', env: { ...process.env, DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/mcp_dev' } })
        console.log('OK')
    } catch (err) {
        console.error('ERROR executing statement:', err.message)
        process.exit(1)
    } finally {
        try { fs.unlinkSync(tmp) } catch (e) { /* noop */ }
    }
}

console.log('All statements executed')
