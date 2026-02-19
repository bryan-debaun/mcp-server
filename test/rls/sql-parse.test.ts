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

    it('does not split dollar-quoted DO $$ blocks', () => {
        const sql = readFileSync('prisma/migrations/20260202110000_enable_rls/migration.sql', 'utf8')
        const parts = parseSqlStatements(sql)
        // Ensure at least one parsed statement contains a full DO $$ ... END$$ block
        const hasDoBlock = parts.some(p => p.includes('DO $$') && p.includes('END$$'))
        expect(hasDoBlock).toBe(true)
    })
})
