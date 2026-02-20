import { describe, it, expect, vi } from 'vitest'

// Mock prisma book.create - include authors relation
vi.mock('../../../../src/db/index', () => ({
    prisma: {
        book: {
            create: vi.fn(async (args: any) => ({
                id: 1,
                ...args.data,
                authors: args.data?.authors?.create ? args.data.authors.create.map((a: any, i: number) => ({
                    authorId: a.authorId,
                    author: { id: a.authorId, name: `Author ${i + 1}` }
                })) : []
            }))
        }
    }
}))

import { registerCreateBookTool } from '../../../../src/tools/db/books/create-book.js'

describe('db create-book tool', () => {
    it('normalizes flexible status input and creates book with canonical status', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerCreateBookTool(fake)

        const result = await fake.handler({ title: 'My Book', status: 'In progress' })

        // parse returned JSON
        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.status).toBe('IN_PROGRESS')
        expect(parsed.title).toBe('My Book')
    })
})