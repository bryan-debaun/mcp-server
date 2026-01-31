import { describe, it, expect, vi } from 'vitest'

beforeEach(() => {
    vi.resetModules()
})

describe('Prisma init', () => {
    it('works when @prisma/client import succeeds', async () => {
        // Ensure the module tries to initialize PrismaClient so our mock is used
        process.env.DATABASE_URL = 'postgresql://test'
        vi.doMock('@prisma/client', () => ({ PrismaClient: class { constructor() { } async $queryRaw() { return [{ ok: 1 }] } } }))
        vi.doMock('@prisma/adapter-pg', () => ({ PrismaPg: class { constructor(_opts: any) { } } }))
        const { testConnection, prismaReady } = await import('../../src/db/index')
        await prismaReady
        await expect(testConnection()).resolves.toBeTruthy()
    })

    it('uses fallback stub when @prisma/client fails', async () => {
        vi.doMock('@prisma/client', () => { throw new Error('nope') })
        vi.doMock('@prisma/adapter-pg', () => ({ PrismaPg: class { constructor(_opts: any) { } } }))
        const { testConnection } = await import('../../src/db/index')
        await expect(testConnection()).rejects.toBeDefined()
    })
})