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
            profile: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
            author: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
            book: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
            movie: { upsert: vi.fn().mockResolvedValue({ id: 1, iasn: 'IASN-001' }) },
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
        mockPrisma.profile.findUnique = vi.fn().mockResolvedValue({ id: 2, email: 'foo@example.com' })
        mockPrisma.profile.update = vi.fn().mockResolvedValue({ id: 2 })

        process.env.ADMIN_EMAIL = 'foo@example.com'

        await runSeed(mockPrisma)

        expect(mockPrisma.profile.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { isAdmin: true } })
        expect(consoleLogSpy).toHaveBeenCalledWith('Seeding DB...')
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Marked existing user'))
    })

    it('creates minimal user for ADMIN_EMAIL when not present', async () => {
        mockPrisma.role.findUnique.mockResolvedValue(null)
        mockPrisma.profile.findUnique = vi.fn().mockResolvedValue(null)
        mockPrisma.profile.create = vi.fn().mockResolvedValue({ id: 3 })

        process.env.ADMIN_EMAIL = 'new@example.com'

        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })

        await runSeed(mockPrisma)

        expect(mockPrisma.profile.create).toHaveBeenCalledWith({ data: { email: 'new@example.com', isAdmin: true } })
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Created minimal users row for ADMIN_EMAIL'))
    })

    it('skips seeding when admin role exists', async () => {
        mockPrisma.role.findUnique.mockResolvedValue({ id: 1, name: 'admin' })

        await runSeed(mockPrisma)

        expect(consoleLogSpy).toHaveBeenCalledWith('DB already seeded; skipping.')
        // Ensure upserts were not called when skipping
        expect(mockPrisma.role.upsert).not.toHaveBeenCalled()
        expect(mockPrisma.profile.upsert).not.toHaveBeenCalled()
    })

    it('performs seed when admin role missing', async () => {
        mockPrisma.role.findUnique.mockResolvedValue(null)

        await runSeed(mockPrisma)

        expect(consoleLogSpy).toHaveBeenCalledWith('Seeding DB...')
        // Ensure upserts were called
        expect(mockPrisma.role.upsert).toHaveBeenCalled()
        expect(mockPrisma.profile.upsert).toHaveBeenCalled()
        // Ensure books created include status default
        expect(mockPrisma.book.upsert).toHaveBeenCalled()
        expect(mockPrisma.book.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: 'NOT_STARTED' }) }))
    })

    it('seeding sets default status for books', async () => {
        mockPrisma.role.findUnique.mockResolvedValue(null)
        mockPrisma.book.upsert = vi.fn().mockResolvedValue({ id: 42 })

        await runSeed(mockPrisma)

        expect(mockPrisma.book.upsert).toHaveBeenCalled()
        mockPrisma.book.upsert.mock.calls.forEach(call => {
            const arg = call[0]
            expect(arg).toHaveProperty('create')
            expect(arg.create).toHaveProperty('status', 'NOT_STARTED')
        })
    })

    it('handles existing movie with same iasn but different id without throwing', async () => {
        // Simulate a DB row that already exists with the same IASN but different id
        mockPrisma.role.findUnique.mockResolvedValue(null)
        mockPrisma.movie.upsert = vi.fn().mockResolvedValue({ id: 99, iasn: 'IASN-001' })

        await expect(runSeed(mockPrisma)).resolves.not.toThrow()
        expect(mockPrisma.movie.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { iasn: 'IASN-001' } }))
    })

    it('continues to seed when presence check throws (surfaces errors via log)', async () => {
        mockPrisma.role.findUnique.mockRejectedValue(new Error('table missing'))

        await runSeed(mockPrisma)

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(consoleLogSpy).toHaveBeenCalledWith('Seeding DB...')
        expect(mockPrisma.role.upsert).toHaveBeenCalled()
    })
})