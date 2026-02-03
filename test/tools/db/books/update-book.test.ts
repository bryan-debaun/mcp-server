import { describe, it, expect, vi } from 'vitest'

// Mock prisma book.update
vi.mock('../../../../src/db/index', () => ({ prisma: { book: { update: vi.fn(async (args: any) => ({ id: args.where.id, ...args.data })) } } }))

import { registerUpdateBookTool } from '../../../../src/tools/db/books/update-book.js'

describe('db update-book tool', () => {
    it('normalizes flexible status input on update', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerUpdateBookTool(fake)

        const result = await fake.handler({ id: 5, status: 'Finished' })

        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.status).toBe('COMPLETED')
        expect(parsed.id).toBe(5)
    })
})