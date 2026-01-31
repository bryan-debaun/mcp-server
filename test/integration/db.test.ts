import { describe, it, expect, afterAll } from 'vitest'
import { prisma, testConnection, initPrisma } from '../../src/db'

const RUN_DB_TESTS = process.env.RUN_DB_INTEGRATION === 'true'

describe('DB integration', () => {
    if (!RUN_DB_TESTS) {
        it.skip('skipped - requires RUN_DB_INTEGRATION=true', () => { })
        return
    }


    afterAll(async () => {
        await initPrisma()
        if (typeof prisma.$disconnect === 'function') {
            await prisma.$disconnect()
        }
    })

    it('connects to the DB and returns a basic result', async () => {
        const res = await testConnection()
        expect(res).toBeDefined()
    })
})
