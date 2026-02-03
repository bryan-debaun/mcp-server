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
        expect(email.sendMagicLinkEmail).toHaveBeenCalledWith('u@example.com', 'tkn')
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
})