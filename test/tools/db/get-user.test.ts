import { describe, it, expect, vi } from 'vitest'

// Mock prisma user.findUnique
vi.mock('../../../src/db/index', () => ({ prisma: { profile: { findUnique: async () => ({ id: 2, email: 'found@example.com' }) } } }))

import { registerGetUserTool } from '../../../src/tools/db/get-user.js'

describe('db get-user tool', () => {
    it('returns a user when id provided', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerGetUserTool(fake)

        const result = await fake.handler({ id: 2 })
        expect(result.content[0].text).toContain('found@example.com')
    })

    it('errors when missing params', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerGetUserTool(fake)

        const result = await fake.handler({})
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('id or email is required')
    })
})