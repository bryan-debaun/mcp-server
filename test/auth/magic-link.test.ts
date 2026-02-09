import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.MAGIC_LINK_JWT_SECRET = 'test-secret'

// Mock prisma authMagicLink methods
const mockCreate = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()

// Note: we rely on global __TEST_PRISMA_MOCK__ instead of vi.mock to avoid
// hoisting/TDZ issues with Vitest and module cache. The global mock is set in
// `beforeEach` where mocks are initialized.

describe('magic-link token utils', () => {
    beforeEach(() => {
        mockCreate.mockReset()
        mockFindUnique.mockReset()
        mockUpdate.mockReset()
            ; (globalThis as any).__TEST_PRISMA_MOCK__ = {
                authMagicLink: {
                    create: mockCreate,
                    findUnique: mockFindUnique,
                    update: mockUpdate,
                }
            }
    })

    it('generates token and stores jti', async () => {
        let mod: any
        try {
            mod = await import('../../src/auth/magic-link.js')
        } catch (err: any) {
            console.error('magic-link import failed', err)
            throw err
        }
        const { generateMagicLinkToken } = mod
        mockCreate.mockResolvedValue({ jti: 'abc', email: 'u@example.com', expiresAt: new Date() })
        const res = await generateMagicLinkToken('u@example.com', 5)
        expect(res.jti).toBeDefined()
        expect(res.token).toBeDefined()
        expect(mockCreate).toHaveBeenCalled()
    })

    it('verifies token and marks consumed', async () => {
        const { generateMagicLinkToken, verifyMagicLinkToken } = await import('../../src/auth/magic-link.js')
        // Create a token first
        mockCreate.mockResolvedValue({ jti: 't1', email: 'u2@example.com', expiresAt: new Date(Date.now() + 1000 * 60) })
        const { token, jti } = await generateMagicLinkToken('u2@example.com')

        // findUnique should return record with not consumed
        mockFindUnique.mockResolvedValue({ jti, email: 'u2@example.com', userId: null, expiresAt: new Date(Date.now() + 1000 * 60), consumed: false })
        mockUpdate.mockResolvedValue({ jti, consumed: true })

        const out = await verifyMagicLinkToken(token)
        expect(out.jti).toBe(jti)
        expect(out.email).toBe('u2@example.com')
        expect(mockUpdate).toHaveBeenCalled()
    })

    it('rejects replayed token', async () => {
        const { generateMagicLinkToken, verifyMagicLinkToken } = await import('../../src/auth/magic-link.js')
        mockCreate.mockResolvedValue({ jti: 'r1', email: 'u3@example.com', expiresAt: new Date(Date.now() + 1000 * 60) })
        const { token } = await generateMagicLinkToken('u3@example.com')

        mockFindUnique.mockResolvedValue({ jti: 'r1', email: 'u3@example.com', userId: null, expiresAt: new Date(Date.now() + 1000 * 60), consumed: true })

        await expect(verifyMagicLinkToken(token)).rejects.toThrow('replayed token')
    })

    it('rejects expired token', async () => {
        const { generateMagicLinkToken, verifyMagicLinkToken } = await import('../../src/auth/magic-link.js')
        mockCreate.mockResolvedValue({ jti: 'e1', email: 'u4@example.com', expiresAt: new Date(Date.now() - 1000 * 60) })
        const { token } = await generateMagicLinkToken('u4@example.com')

        mockFindUnique.mockResolvedValue({ jti: 'e1', email: 'u4@example.com', userId: null, expiresAt: new Date(Date.now() - 1000 * 60), consumed: false })

        await expect(verifyMagicLinkToken(token)).rejects.toThrow('expired token')
    })

    it('throws a clear error when DATABASE_URL is not configured', async () => {
        // Ensure we are not using the global test prisma mock
        delete process.env.DATABASE_URL
        delete (globalThis as any).__TEST_PRISMA_MOCK__
        vi.resetModules()

        const { generateMagicLinkToken } = await import('../../src/auth/magic-link.js')
        await expect(generateMagicLinkToken('no-db@example.com')).rejects.toThrow(/DATABASE_URL not configured|PrismaClient not initialized/)
    })
})