import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'

// Force the DB-less stub path regardless of the local .env.local DATABASE_URL.
vi.mock('../../src/config.js', () => ({
    config: { database: { url: undefined } },
}))

describe('Prisma stub coverage', () => {
    it('every schema.prisma model has a DB-less stub (guards against drift)', async () => {
        const schema = readFileSync(
            path.resolve(process.cwd(), 'prisma/schema.prisma'),
            'utf8',
        )
        const models = [...schema.matchAll(/^\s*model\s+(\w+)\s*\{/gm)].map(
            (m) => m[1],
        )
        expect(models.length).toBeGreaterThan(0)

        const { prisma, initPrisma } = await import('../../src/db/index.js')
        await initPrisma()

        for (const model of models) {
            // Prisma exposes models camel-cased (Profile -> profile, BookAuthor -> bookAuthor).
            const key = model.charAt(0).toLowerCase() + model.slice(1)
            expect(
                prisma[key],
                `missing DB-less stub for schema model "${model}" (prisma.${key})`,
            ).toBeDefined()
            expect(
                typeof prisma[key].findMany,
                `prisma.${key}.findMany should be a function`,
            ).toBe('function')
        }
    })
})
