import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../../src/db/index'
import { registerDeleteRatingTool } from '../../../../src/tools/db/ratings/delete-rating.js'

describe('delete-rating tool', () => {
    it('deletes rating and updates book aggregates transactionally', async () => {
        const deletedRating = { id: 5, bookId: 11, rating: 7 }
        const deleteMock = vi.fn(async () => deletedRating)
        const aggregateMock = vi.fn(async () => ({ _count: { _all: 2 }, _avg: { rating: 8.5 } }))
        const bookUpdateMock = vi.fn(async () => ({}))

        const tx = {
            rating: { delete: deleteMock, aggregate: aggregateMock },
            book: { update: bookUpdateMock },
            $executeRaw: vi.fn(async () => ({}))
        }

        const transactionMock = vi.fn(async (fn: any) => await fn(tx))
            ; (prisma as any).$transaction = transactionMock

        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }
        registerDeleteRatingTool(fake)

        const res = await fake.handler({ id: 5 })

        expect(transactionMock).toHaveBeenCalled()
        expect(deleteMock).toHaveBeenCalledWith({ where: { id: 5 } })
        expect(aggregateMock).toHaveBeenCalled()
        expect(bookUpdateMock).toHaveBeenCalledWith({ where: { id: 11 }, data: { ratingCount: 2, averageRating: 8.5 } })
        expect(res.content).toBeDefined()
        expect(String(res.content[0].text)).toContain('"id": 5')
    })
})
