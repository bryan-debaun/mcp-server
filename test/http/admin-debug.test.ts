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
    it('returns ip and jwks status', async () => {
        // stub fetch to return ok
        vi.stubGlobal('fetch', async () => ({ ok: true, status: 200 }))
        process.env.SUPABASE_JWKS_URL = 'https://example.local/.well-known/jwks.json'

        const app = express()
        app.use(express.json())
        registerAdminRoute(app)

        const res = await request(app).get('/api/admin/_debug/headers')
        expect(res.status).toBe(200)
        expect(res.body).toHaveProperty('ip')
        expect(res.body.jwksStatus).toEqual({ status: 200, ok: true })

        delete process.env.SUPABASE_JWKS_URL
        vi.unstubAllGlobals()
    })
})