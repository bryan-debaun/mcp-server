import { describe, it, expect, vi } from 'vitest'

// Mock prisma user.findMany
vi.mock('../../../src/db/index', () => ({ prisma: { profile: { findMany: async () => [{ id: 1, email: 'u1@example.com' }] } } }))

import { registerListUsersTool } from '../../../src/tools/db/list-users.js'

describe('db list-users tool', () => {
    it('returns users', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerListUsersTool(fake)

        const result = await fake.handler({})
        expect(result.content).toHaveLength(1)
        expect(result.content[0].text).toContain('u1@example.com')
    })
})