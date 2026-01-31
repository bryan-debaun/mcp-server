import { describe, it, expect, vi } from 'vitest'

// Mock admin-service createInvite
vi.mock('../../../src/services/admin-service', () => ({
    createInvite: async (email: string, invitedBy?: number) => ({ id: 1, email, token: 'invite-token', invitedBy })
}))

import { registerCreateInviteTool } from '../../../src/tools/db/create-invite.js'

describe('db create-invite tool', () => {
    it('registers tool and returns invite on success', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerCreateInviteTool(fake)

        const result = await fake.handler({ email: 'new@example.com' })
        expect(result.content).toHaveLength(1)
        expect(result.content[0].text).toContain('new@example.com')
    })

    it('returns error result when service throws', async () => {
        // swap mock to throw
        const admin = await import('../../../src/services/admin-service.js') as any
        admin.createInvite = async () => { throw new Error('boom') }

        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }
        registerCreateInviteTool(fake)

        const result = await fake.handler({ email: 'bad@example.com' })
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('Error: boom')
    })
})