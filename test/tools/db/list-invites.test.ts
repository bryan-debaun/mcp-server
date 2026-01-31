import { describe, it, expect, vi } from 'vitest'

// Mock prisma invite.findMany
vi.mock('../../../src/db/index', () => ({ prisma: { invite: { findMany: async () => [{ id: 1, email: 'invite@example.com' }] } } }))

import { registerListInvitesTool } from '../../../src/tools/db/list-invites.js'

describe('db list-invites tool', () => {
    it('returns invites', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerListInvitesTool(fake)

        const result = await fake.handler({})
        expect(result.content[0].text).toContain('invite@example.com')
    })
})