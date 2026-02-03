import { describe, it, expect, vi } from 'vitest'

// Mock prisma book.create
vi.mock('../../../../src/db/index', () => ({ prisma: { book: { create: vi.fn(async (args: any) => ({ id: 1, ...args.data })) } } }))

import { registerCreateBookTool } from '../../../../src/tools/db/books/create-book.js'

describe('db create-book tool', () => {
    it('normalizes flexible status input and creates book with canonical status', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerCreateBookTool(fake)

        const result = await fake.handler({ title: 'My Book', status: 'In progress', createdBy: 2 })

        // parse returned JSON
        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.status).toBe('IN_PROGRESS')
        expect(parsed.title).toBe('My Book')
        expect(parsed.createdBy).toBe(2)
    })
})