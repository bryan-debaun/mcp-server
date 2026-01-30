import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma, testConnection } from '../../src/db'

describe('DB integration', () => {
    beforeAll(async () => {
        // Ensure connection is ready
    })

    afterAll(async () => {
        await prisma.$disconnect()
    })

    it('connects to the DB and returns a basic result', async () => {
        const res = await testConnection()
        expect(res).toBeDefined()
    })
})
