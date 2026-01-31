import { describe, it, expect, vi } from 'vitest'

// Mock admin-service acceptInvite
vi.mock('../../../src/services/admin-service', () => ({
    acceptInvite: async (_token: string, _opts?: any) => ({ id: 2, email: 'accepted@example.com' })
}))

import { registerAcceptInviteTool } from '../../../src/tools/db/accept-invite.js'

describe('db accept-invite tool', () => {
    it('registers tool and returns user on success', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerAcceptInviteTool(fake)

        const result = await fake.handler({ token: 'invite-token' })
        expect(result.content).toHaveLength(1)
        expect(result.content[0].text).toContain('accepted@example.com')
    })

    it('returns error result when service throws', async () => {
        // swap mock to throw
        const admin = await import('../../../src/services/admin-service.js') as any
        admin.acceptInvite = async () => { throw new Error('expired') }

        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }
        registerAcceptInviteTool(fake)

        const result = await fake.handler({ token: 'bad-token' })
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('Error: expired')
    })
})