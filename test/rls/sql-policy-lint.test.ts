import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'

describe('RLS migration SQL policy lint', () => {
    it('migration has no comma-separated action lists in CREATE POLICY', () => {
        const file = path.resolve('prisma/migrations/20260202110000_enable_rls/migration.sql')
        const sql = fs.readFileSync(file, 'utf8')
        const regex = /CREATE\s+POLICY[\s\S]*?FOR\s+(?:INSERT|UPDATE|DELETE)\s*,\s*(?:INSERT|UPDATE|DELETE)/i
        expect(regex.test(sql)).toBe(false)
    })
})
