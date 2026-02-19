import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import path from 'path'

describe('RLS migration lint', () => {
    it('all CREATE TABLEs have a matching ENABLE ROW LEVEL SECURITY statement somewhere in migrations', () => {
        const migrationsDir = path.resolve(__dirname, '../../prisma/migrations')
        const dirs = readdirSync(migrationsDir).filter(d => d !== 'migration_lock.toml')

        const migrationFiles = dirs
            .map(d => path.join(migrationsDir, d, 'migration.sql'))
            .filter(p => {
                try {
                    return Boolean(readFileSync(p, 'utf8'))
                } catch (e) {
                    return false
                }
            })

        const allSql = migrationFiles.map(p => readFileSync(p, 'utf8')).join('\n')

        const createTableRegex = /CREATE TABLE\s+"([^"]+)"/gi
        const createTables: string[] = []
        let m
        while ((m = createTableRegex.exec(allSql))) {
            createTables.push(m[1])
        }

        const enabledTables: Set<string> = new Set()
        const enableRegex = /ALTER TABLE\s+(?:IF EXISTS\s+)?"([^"]+)"\s+ENABLE ROW LEVEL SECURITY/gi
        while ((m = enableRegex.exec(allSql))) {
            enabledTables.add(m[1])
        }

        const missing = createTables.filter(t => !enabledTables.has(t))

        expect(missing).toEqual([])
    })
})