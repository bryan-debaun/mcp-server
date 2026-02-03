import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

describe('ItemStatus migration', () => {
    it('migration SQL creates ItemStatus enum and adds status/is_admin columns with indexes', () => {
        const file = path.resolve('prisma/migrations/20260202173000_add_itemstatus_and_isadmin/migration.sql')
        const sql = readFileSync(file, 'utf8')

        expect(sql).toMatch(/CREATE TYPE "ItemStatus" AS ENUM \('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'\)/)
        expect(sql).toMatch(/ALTER TABLE "Book" ADD COLUMN "status"/) 
        expect(sql).toMatch(/ALTER TABLE "User" ADD COLUMN "is_admin"/) 
        expect(sql).toMatch(/CREATE INDEX "Book_status_index"/) 
        expect(sql).toMatch(/CREATE INDEX "User_is_admin_index"/) 
    })
})