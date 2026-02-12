import { describe, it, expect, vi } from 'vitest'

// Mock prisma videoGame.create
vi.mock('../../../../src/db/index', () => ({ prisma: { videoGame: { create: vi.fn(async (args: any) => ({ id: 1, ...args.data })) } } }))

import { registerCreateVideoGameTool } from '../../../../src/tools/db/videogames/create-videogame.js'

describe('db create-videogame tool', () => {
    it('creates a videogame and normalizes status', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerCreateVideoGameTool(fake)

        const result = await fake.handler({ title: 'My Game', platform: 'PC', status: 'Completed', createdBy: 2 })

        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.status).toBe('COMPLETED')
        expect(parsed.title).toBe('My Game')
        expect(parsed.createdBy).toBe(2)
    })
})