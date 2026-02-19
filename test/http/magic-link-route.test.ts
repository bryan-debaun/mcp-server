import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../src/auth/magic-link.ts', () => ({
    generateMagicLinkToken: vi.fn(),
    verifyMagicLinkToken: vi.fn(),
}))
vi.mock('../../src/email.ts', () => ({
    sendMagicLinkEmail: vi.fn(),
}))

import { RegisterRoutes } from '../../src/http/tsoa-routes.js'

describe('magic-link routes', () => {
    beforeEach(async () => {
        // Reset mocks and rate limits
        const mod: any = await import('../../src/http/controllers/MagicLinkController.ts')
        mod._testResetRateLimits()
    })

    it('POST /api/auth/magic-link returns 202 and sends email', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const auth: any = await import('../../src/auth/magic-link.ts')
        auth.generateMagicLinkToken.mockResolvedValue({ token: 'tkn', jti: 'j1' })
        const email: any = await import('../../src/email.ts')
        email.sendMagicLinkEmail.mockResolvedValue(undefined)

        const res = await request(app).post('/api/auth/magic-link').send({ email: 'u@example.com' })
        expect(res.status).toBe(202)
        expect(auth.generateMagicLinkToken).toHaveBeenCalledWith('u@example.com')
        expect(email.sendMagicLinkEmail).toHaveBeenCalledWith('u@example.com', 'tkn', expect.any(String))
    })

    it('POST /api/auth/magic-link rate limits per email', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const auth: any = await import('../../src/auth/magic-link.ts')
        auth.generateMagicLinkToken.mockResolvedValue({ token: 'tkn', jti: 'j1' })
        const email: any = await import('../../src/email.ts')
        email.sendMagicLinkEmail.mockResolvedValue(undefined)

        for (let i = 0; i < 5; i++) {
            const res = await request(app).post('/api/auth/magic-link').send({ email: 'r@example.com' })
            expect(res.status).toBe(202)
        }
        const res2 = await request(app).post('/api/auth/magic-link').send({ email: 'r@example.com' })
        expect(res2.status).toBe(429)
    })

    it('GET /api/auth/magic-link/verify sets cookie and redirects on success', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const auth: any = await import('../../src/auth/magic-link.ts')
        auth.verifyMagicLinkToken.mockResolvedValue({ jti: 'j1', email: 'u@example.com', userId: null })

        const res = await request(app).get('/api/auth/magic-link/verify').query({ token: 'tkn' })
        // Should redirect (302) to success URL
        expect([302, 301, 307, 308]).toContain(res.status)
        // Cookie should be set
        expect(res.headers['set-cookie']).toBeDefined()
    })

    it('GET /api/auth/magic-link/verify returns 404 for invalid token and 410 for expired token', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const auth: any = await import('../../src/auth/magic-link.ts')
        auth.verifyMagicLinkToken.mockRejectedValueOnce(new Error('invalid token'))

        const resInvalid = await request(app).get('/api/auth/magic-link/verify').query({ token: 'bad' })
        expect(resInvalid.status).toBe(404)
        expect(resInvalid.body).toEqual({ error: 'invalid token' })

        auth.verifyMagicLinkToken.mockRejectedValueOnce(new Error('expired token'))
        const resExpired = await request(app).get('/api/auth/magic-link/verify').query({ token: 'expired' })
        expect(resExpired.status).toBe(410)
        expect(resExpired.body).toEqual({ error: 'expired token' })
    })

    it('POST /api/auth/magic-link/verify returns 404 for invalid token and 410 for expired token', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const auth: any = await import('../../src/auth/magic-link.ts')
        auth.verifyMagicLinkToken.mockRejectedValueOnce(new Error('invalid token'))

        const resInvalid = await request(app).post('/api/auth/magic-link/verify').send({ token: 'bad' })
        expect(resInvalid.status).toBe(404)
        expect(resInvalid.body).toEqual({ error: 'invalid token' })

        auth.verifyMagicLinkToken.mockRejectedValueOnce(new Error('expired token'))
        const resExpired = await request(app).post('/api/auth/magic-link/verify').send({ token: 'expired' })
        expect(resExpired.status).toBe(410)
        expect(resExpired.body).toEqual({ error: 'expired token' })
    })

    it('GET /api/auth/magic-link/verify remains public when MCP_API_KEY set', async () => {
        const orig = process.env.MCP_API_KEY
        process.env.MCP_API_KEY = 'testkey'

        const { mcpAuthMiddleware } = await import('../../src/http/middleware/mcp-auth.js')
        const app = express()
        app.use(express.json())
        app.use(mcpAuthMiddleware)
        RegisterRoutes(app)

        const auth: any = await import('../../src/auth/magic-link.ts')
        auth.verifyMagicLinkToken.mockResolvedValue({ jti: 'j1', email: 'u@example.com', userId: null })

        const res = await request(app).get('/api/auth/magic-link/verify').query({ token: 'tkn' })
        expect([302, 301, 307, 308]).toContain(res.status)
        expect(res.headers['set-cookie']).toBeDefined()

        if (typeof orig === 'undefined') delete process.env.MCP_API_KEY
        else process.env.MCP_API_KEY = orig
    })

    it('POST /api/auth/magic-link/verify remains public when MCP_API_KEY set', async () => {
        const orig = process.env.MCP_API_KEY
        process.env.MCP_API_KEY = 'testkey'

        const { mcpAuthMiddleware } = await import('../../src/http/middleware/mcp-auth.js')
        const app = express()
        app.use(express.json())
        app.use(mcpAuthMiddleware)
        RegisterRoutes(app)

        const auth: any = await import('../../src/auth/magic-link.ts')
        auth.verifyMagicLinkToken.mockResolvedValue({ jti: 'j1', email: 'u@example.com', userId: null })

        const res = await request(app).post('/api/auth/magic-link/verify').send({ token: 'tkn' })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ status: 'ok' })

        if (typeof orig === 'undefined') delete process.env.MCP_API_KEY
        else process.env.MCP_API_KEY = orig
    })

    it('POST /api/auth/register without password creates user and sends magic link', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const svc: any = await import('../../src/services/admin-service.js')
        vi.spyOn(svc as any, 'registerUser').mockResolvedValue({ id: 9, email: 'reg@example.com' })

        const auth: any = await import('../../src/auth/magic-link.ts')
        auth.generateMagicLinkToken.mockResolvedValue({ token: 'tkn', jti: 'j1' })
        const email: any = await import('../../src/email.ts')
        email.sendMagicLinkEmail.mockResolvedValue(undefined)

        const res = await request(app).post('/api/auth/magic-link/register').send({ email: 'reg@example.com', name: 'Reg' })
        expect(res.status).toBe(201)
        expect(svc.registerUser).toHaveBeenCalledWith('reg@example.com', 'Reg', undefined)
        expect(auth.generateMagicLinkToken).toHaveBeenCalledWith('reg@example.com', 9)
        expect(email.sendMagicLinkEmail).toHaveBeenCalledWith('reg@example.com', 'tkn', expect.any(String))
    })

    it('POST /api/auth/register with password unsupported returns JSON 400', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const svc: any = await import('../../src/services/admin-service.js')
        vi.spyOn(svc as any, 'registerUser').mockRejectedValue(new Error('password not supported'))

        const res = await request(app).post('/api/auth/magic-link/register').send({ email: 'x@example.com', password: 'secret' })
        expect(res.status).toBe(400)
        expect(res.headers['content-type']).toMatch(/json/)
        expect(res.body).toEqual({ error: 'password not supported' })
    })

    it('POST /api/auth/magic-link/register returns JSON on validation failure', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        // Install JSON error handler like the real server so template/validation
        // errors are returned as structured JSON in tests.
        app.use((err: any, _req: any, res: any, _next: any) => {
            const status = (res.statusCode && res.statusCode >= 400) ? res.statusCode : (err?.status || 500)
            res.status(status).json({ error: err?.message ?? 'internal error' })
        })

        const res = await request(app).post('/api/auth/magic-link/register').send({})
        expect(res.status).toBe(400)
        expect(res.headers['content-type']).toMatch(/json/)
        expect(res.body).toHaveProperty('error')
    })

    it('POST /api/auth/magic-link/register existing user returns JSON 400', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const svc: any = await import('../../src/services/admin-service.js')
        vi.spyOn(svc as any, 'registerUser').mockRejectedValue(new Error('user already exists'))

        const res = await request(app).post('/api/auth/magic-link/register').send({ email: 'exists@example.com' })
        expect(res.status).toBe(400)
        expect(res.headers['content-type']).toMatch(/json/)
        expect(res.body).toEqual({ error: 'user already exists' })
    })

    it('POST /api/auth/magic-link/register supabase provisioning failure returns JSON 502', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const svc: any = await import('../../src/services/admin-service.js')
        vi.spyOn(svc as any, 'registerUser').mockRejectedValue(new Error('supabase provisioning failed'))

        const res = await request(app).post('/api/auth/magic-link/register').send({ email: 's@example.com' })
        expect(res.status).toBe(502)
        expect(res.headers['content-type']).toMatch(/json/)
        expect(res.body).toEqual({ error: 'supabase provisioning failed' })
    })
})