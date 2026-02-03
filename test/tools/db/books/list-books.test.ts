import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../../src/db/index'

import { registerListBooksTool } from '../../../../src/tools/db/books/list-books.js'

describe('db list-books tool', () => {
    it('normalizes status query and passes canonical value to prisma.findMany', async () => {
        // Spy on prisma.book.findMany
        const findManyMock = vi.fn(async (_args: any) => [])
            ; (prisma as any).book = { findMany: findManyMock }

        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerListBooksTool(fake)

        await fake.handler({ status: 'Not started' })

        // ensure findMany was called with where.status = 'NOT_STARTED'
        expect(findManyMock).toHaveBeenCalled()
        const callArg = findManyMock.mock.calls[0][0]
        expect(callArg.where).toHaveProperty('status', 'NOT_STARTED')
    })
})