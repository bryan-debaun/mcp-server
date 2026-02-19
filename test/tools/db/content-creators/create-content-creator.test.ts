import { describe, it, expect, vi } from 'vitest'

// Mock prisma contentCreator.create
vi.mock('../../../../src/db/index', () => ({ prisma: { contentCreator: { create: vi.fn(async (args: any) => ({ id: 1, ...args.data })) } } }))

import { registerCreateContentCreatorTool } from '../../../../src/tools/db/content-creators/create-content-creator.js'

describe('db create-content-creator tool', () => {
    it('creates a content creator', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerCreateContentCreatorTool(fake)

        const result = await fake.handler({ name: 'Creator', description: 'desc' })

        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.name).toBe('Creator')
        expect(parsed.description).toBe('desc')
    })
})