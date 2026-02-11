import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../../src/db/index'
import { registerCreateOrUpdateRatingTool } from '../../../../src/tools/db/ratings/create-or-update-rating.js'

describe('create-or-update-rating tool', () => {
    it('performs upsert and updates book aggregates transactionally', async () => {
        // Prepare mocks
        const upsertMock = vi.fn(async () => ({ id: 1, bookId: 11, userId: 2, rating: 8 }))
        const aggregateMock = vi.fn(async () => ({ _count: { _all: 3 }, _avg: { rating: 8.3333333333 } }))
        const bookUpdateMock = vi.fn(async () => ({}))

        const tx = {
            rating: { upsert: upsertMock, aggregate: aggregateMock },
            book: { update: bookUpdateMock, findUnique: vi.fn(async () => ({ id: 11, title: 'RLS Test Book' })) },
            ratingAggregate: { upsert: vi.fn(async () => ({})) },
            $executeRaw: vi.fn(async () => ({}))
        }

        const transactionMock = vi.fn(async (fn: any) => await fn(tx))
            ; (prisma as any).$transaction = transactionMock

        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }
        registerCreateOrUpdateRatingTool(fake)

        const res = await fake.handler({ bookId: 11, userId: 2, rating: 8 })

        expect(transactionMock).toHaveBeenCalled()
        expect(upsertMock).toHaveBeenCalled()
        expect(aggregateMock).toHaveBeenCalled()
        expect(bookUpdateMock).toHaveBeenCalledWith({ where: { id: 11 }, data: { ratingCount: 3, averageRating: 8.33 } })
        expect((tx as any).ratingAggregate.upsert).toHaveBeenCalledWith({ where: { entityType_entityId: { entityType: 'book', entityId: 11 } }, create: { entityType: 'book', entityId: 11, ratingCount: 3, averageRating: 8.33 }, update: { ratingCount: 3, averageRating: 8.33 } })
        expect(res.content).toBeDefined()
        expect(String(res.content[0].text)).toContain('"id": 1')
    })
})
