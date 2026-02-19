import { describe, it, expect, vi } from 'vitest'

// Mock prisma movie.create
vi.mock('../../../../src/db/index', () => ({ prisma: { movie: { create: vi.fn(async (args: any) => ({ id: 1, ...args.data })) } } }))

import { registerCreateMovieTool } from '../../../../src/tools/db/movies/create-movie.js'

describe('db create-movie tool', () => {
    it('creates a movie and normalizes status', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerCreateMovieTool(fake)

        const result = await fake.handler({ title: 'My Movie', status: 'In progress' })

        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.status).toBe('IN_PROGRESS')
        expect(parsed.title).toBe('My Movie')
    })
})