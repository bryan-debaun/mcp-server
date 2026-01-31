import { describe, it, expect, vi } from 'vitest'

// Mock prisma auditLog.findMany
vi.mock('../../../src/db/index', () => ({ prisma: { auditLog: { findMany: async () => [{ id: 1, action: 'accept-invite' }] } } }))

import { registerListAuditLogsTool } from '../../../src/tools/db/list-audit-logs.js'

describe('db list-audit-logs tool', () => {
    it('returns logs', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerListAuditLogsTool(fake)

        const result = await fake.handler({ limit: 10 })
        expect(result.content[0].text).toContain('accept-invite')
    })
})