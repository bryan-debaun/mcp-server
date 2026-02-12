import { describe, it, expect, vi } from 'vitest'

// Mock prisma movie.findMany
vi.mock('../../../../src/db/index', () => ({ prisma: { movie: { findMany: vi.fn(async (_args: any) => [{ id: 1, title: 'A' }, { id: 2, title: 'B' }]) } } }))

import { registerListMoviesTool } from '../../../../src/tools/db/movies/list-movies.js'

describe('db list-movies tool', () => {
    it('returns movies and paging info', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerListMoviesTool(fake)

        const result = await fake.handler({ limit: 10, offset: 0 })
        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.movies.length).toBe(2)
        expect(parsed.total).toBe(2)
    })
})