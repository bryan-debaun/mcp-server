import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runSeed } from '../prisma/seed'

/** Minimal mock of the Prisma models runSeed touches. */
function makeDb() {
    return {
        profile: {
            findUnique: vi.fn().mockResolvedValue(null),
            upsert: vi.fn().mockResolvedValue({ id: 'uuid' }),
        },
        author: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
        book: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
        bookAuthor: { upsert: vi.fn().mockResolvedValue({}) },
        movie: {
            upsert: vi.fn().mockResolvedValue({ id: 1, iasn: 'IASN-001' }),
        },
        videoGame: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
        contentCreator: { upsert: vi.fn().mockResolvedValue({ id: 1 }) },
        article: {
            upsert: vi.fn().mockResolvedValue({ id: 1, slug: 'cptsd' }),
        },
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    }
}

describe('seed: canonical content always ensured (#120 / migrate-on-deploy)', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => vi.restoreAllMocks())

    it('upserts the CPTSD article even when the DB is already seeded (sample data skipped)', async () => {
        const db = makeDb()
        // Simulate an already-seeded DB: the admin profile exists.
        db.profile.findUnique.mockResolvedValue({
            id: 'x',
            email: 'brn.dbn@gmail.com',
        })

        await runSeed(db)

        expect(db.article.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ where: { slug: 'cptsd' } }),
        )
        // Bulk sample data must be short-circuited (ADR-0008).
        expect(db.book.upsert).not.toHaveBeenCalled()
        expect(db.profile.upsert).not.toHaveBeenCalled()
    })

    it('seeds the article AND sample data on a fresh DB', async () => {
        const db = makeDb() // profile.findUnique → null (not seeded)

        await runSeed(db)

        expect(db.article.upsert).toHaveBeenCalled()
        expect(db.book.upsert).toHaveBeenCalled()
        expect(db.profile.upsert).toHaveBeenCalled()
    })

    it('does not throw if the Article table is not migrated yet', async () => {
        const db = makeDb()
        db.profile.findUnique.mockResolvedValue({ id: 'x' })
        db.article.upsert.mockRejectedValue(
            new Error('relation "Article" does not exist'),
        )

        await expect(runSeed(db)).resolves.not.toThrow()
    })
})
