import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../src/auth/jwt', () => ({
    jwtMiddleware: (_req: any, _res: any, next: any) => { next() },
    verifySupabaseJwt: async () => { return {} }
}))

// Mock requireAdmin to allow/service role path
vi.mock('../../src/auth/requireAdmin', () => ({
    requireAdmin: (_req: any, _res: any, next: any) => { next() }
}))

import { registerAdminRoute } from '../../src/http/admin-route'

describe('Admin debug endpoint', () => {
    it('returns ip and jwks status when enabled and records audit/metric', async () => {
        // stub fetch to return ok
        vi.stubGlobal('fetch', async () => ({ ok: true, status: 200 }))
        process.env.SUPABASE_JWKS_URL = 'https://example.local/.well-known/jwks.json'
        process.env.ADMIN_DEBUG_ENABLED = '1'

        // Mock prisma.auditLog.create and spy metric
        const p = await import('../../src/db/index.js') as any
        p.prisma.auditLog = { create: vi.fn().mockResolvedValue({ id: 1 }) }
        const m = await import('../../src/http/metrics-route.js') as any
        const incSpy = vi.spyOn(m.adminDebugRequestsTotal, 'inc').mockImplementation(() => { })

        const app = express()
        app.use(express.json())
        registerAdminRoute(app)

        const res = await request(app).get('/api/admin/_debug/headers')
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty('ip')
        expect(res.body.jwksStatus).toEqual({ status: 200, ok: true })
        expect(p.prisma.auditLog.create).toHaveBeenCalled()
        expect(incSpy).toHaveBeenCalled()

        delete process.env.SUPABASE_JWKS_URL
        delete process.env.ADMIN_DEBUG_ENABLED
        vi.unstubAllGlobals()
    })

    it('is not registered when ADMIN_DEBUG_ENABLED is not set', async () => {
        delete process.env.ADMIN_DEBUG_ENABLED

        const app = express()
        app.use(express.json())
        registerAdminRoute(app)

        const res = await request(app).get('/api/admin/_debug/headers')
        expect(res.status).toBe(404)
    })
})