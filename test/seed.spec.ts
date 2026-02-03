import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runSeed } from '../prisma/seed'

describe('prisma seed', () => {
    let mockPrisma: any
    let consoleLogSpy: any
    let consoleErrorSpy: any

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { })
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

        mockPrisma = {
            role: {
                findUnique: vi.fn(),
                upsert: vi.fn().mockResolvedValue({ id: 1, name: 'admin' }),
            },
            user: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
            author: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
            book: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
            bookAuthor: { upsert: vi.fn().mockResolvedValue({}) },
            rating: { upsert: vi.fn().mockResolvedValue({}) },
            $disconnect: vi.fn().mockResolvedValue(undefined),
        }
    })

    afterEach(() => {
        delete process.env.ADMIN_EMAIL
        vi.restoreAllMocks()
    })

    it('marks existing ADMIN_EMAIL user as admin', async () => {
        mockPrisma.role.findUnique.mockResolvedValue(null)
        mockPrisma.user.findUnique = vi.fn().mockResolvedValue({ id: 2, email: 'foo@example.com' })
        mockPrisma.user.update = vi.fn().mockResolvedValue({ id: 2 })

        process.env.ADMIN_EMAIL = 'foo@example.com'

        await runSeed(mockPrisma)

        expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { isAdmin: true } })
        expect(consoleLogSpy).toHaveBeenCalledWith('Seeding DB...')
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Marked existing user'))
    })

    it('creates minimal user for ADMIN_EMAIL when not present', async () => {
        mockPrisma.role.findUnique.mockResolvedValue(null)
        mockPrisma.user.findUnique = vi.fn().mockResolvedValue(null)
        mockPrisma.user.create = vi.fn().mockResolvedValue({ id: 3 })

        process.env.ADMIN_EMAIL = 'new@example.com'

        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })

        await runSeed(mockPrisma)

        expect(mockPrisma.user.create).toHaveBeenCalledWith({ data: { email: 'new@example.com', isAdmin: true } })
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Created minimal users row for ADMIN_EMAIL'))
    })

    it('skips seeding when admin role exists', async () => {
        mockPrisma.role.findUnique.mockResolvedValue({ id: 1, name: 'admin' })

        await runSeed(mockPrisma)

        expect(consoleLogSpy).toHaveBeenCalledWith('DB already seeded; skipping.')
        // Ensure upserts were not called when skipping
        expect(mockPrisma.role.upsert).not.toHaveBeenCalled()
        expect(mockPrisma.user.upsert).not.toHaveBeenCalled()
    })

    it('performs seed when admin role missing', async () => {
        mockPrisma.role.findUnique.mockResolvedValue(null)

        await runSeed(mockPrisma)

        expect(consoleLogSpy).toHaveBeenCalledWith('Seeding DB...')
        // Ensure upserts were called
        expect(mockPrisma.role.upsert).toHaveBeenCalled()
        expect(mockPrisma.user.upsert).toHaveBeenCalled()
    })

    it('continues to seed when presence check throws (surfaces errors via log)', async () => {
        mockPrisma.role.findUnique.mockRejectedValue(new Error('table missing'))

        await runSeed(mockPrisma)

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(consoleLogSpy).toHaveBeenCalledWith('Seeding DB...')
        expect(mockPrisma.role.upsert).toHaveBeenCalled()
    })
})