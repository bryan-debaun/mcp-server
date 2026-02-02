import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { parseSqlStatements } from '../../src/tools/sql'

describe('SQL parse utility', () => {
    it('parses migration into statements and contains ENABLE ROW LEVEL SECURITY', () => {
        const sql = readFileSync('prisma/migrations/20260202110000_enable_rls/migration.sql', 'utf8')
        const parts = parseSqlStatements(sql)
        expect(parts.length).toBeGreaterThan(0)
        expect(parts.join('\n')).toMatch(/ENABLE ROW LEVEL SECURITY/)
    })
})
