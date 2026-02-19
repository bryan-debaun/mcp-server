import { describe, it, expect, vi, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

import { RegisterRoutes } from '../../src/http/tsoa-routes.js'

describe('password routes', () => {
    const origUrl = process.env.PUBLIC_SUPABASE_URL
    const origKey = process.env.SUPABASE_SECRET_KEY

    afterEach(() => {
        if (typeof origUrl === 'undefined') delete process.env.PUBLIC_SUPABASE_URL
        else process.env.PUBLIC_SUPABASE_URL = origUrl
        if (typeof origKey === 'undefined') delete process.env.SUPABASE_SECRET_KEY
        else process.env.SUPABASE_SECRET_KEY = origKey
        vi.restoreAllMocks()
    })

    it('POST /api/auth/password/reset-request returns 400 when email missing', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        // Install JSON error handler like other tests so validation errors are returned
        app.use((err: any, _req: any, res: any, _next: any) => {
            const status = (res.statusCode && res.statusCode >= 400) ? res.statusCode : (err?.status || 500)
            res.status(status).json({ error: err?.message ?? 'internal error' })
        })

        const res = await request(app).post('/api/auth/password/reset-request').send({})
        expect(res.status).toBe(400)
        expect(res.headers['content-type']).toMatch(/json/)
        expect(res.body).toHaveProperty('error')

    })

    it('POST /api/auth/password/reset-request calls Supabase recover and returns 200', async () => {
        process.env.PUBLIC_SUPABASE_URL = 'https://supabase.example'
        process.env.SUPABASE_SECRET_KEY = 'srk'

        vi.stubGlobal('fetch', async (url: string, _opts?: any) => {
            expect(url).toMatch(/supabase.example\/auth\/v1\/recover$/)
            expect(_opts?.method).toBe('POST')
            const body = JSON.parse(_opts.body)
            expect(body.email).toBe('u@example.com')
            return { ok: true, status: 200, text: async () => '' }
        })

        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const res = await request(app).post('/api/auth/password/reset-request').send({ email: 'u@example.com' })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ status: 'ok' })
    })

    it('POST /api/auth/password/login returns 400 when missing fields', async () => {
        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        // Install JSON error handler so validation errors are returned as JSON
        app.use((err: any, _req: any, res: any, _next: any) => {
            const status = (res.statusCode && res.statusCode >= 400) ? res.statusCode : (err?.status || 500)
            res.status(status).json({ error: err?.message ?? 'internal error' })
        })

        const res = await request(app).post('/api/auth/password/login').send({})
        expect(res.status).toBe(400)
        expect(res.headers['content-type']).toMatch(/json/)
        expect(res.body).toHaveProperty('error')

    })

    it('POST /api/auth/password/login returns 401 on invalid credentials', async () => {
        process.env.PUBLIC_SUPABASE_URL = 'https://supabase.example'
        process.env.SUPABASE_SECRET_KEY = 'srk'

        vi.stubGlobal('fetch', async (url: string, _opts?: any) => {
            expect(url).toMatch(/supabase.example\/auth\/v1\/token\?grant_type=password$/)
            return { ok: false, status: 401, json: async () => ({ error: 'Invalid login' }) }
        })

        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const res = await request(app).post('/api/auth/password/login').send({ email: 'u@example.com', password: 'bad' })
        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: 'invalid credentials' })
    })

    it('POST /api/auth/password/login sets session cookie on success', async () => {
        process.env.PUBLIC_SUPABASE_URL = 'https://supabase.example'
        process.env.SUPABASE_SECRET_KEY = 'srk'

        vi.stubGlobal('fetch', async (url: string, _opts?: any) => {
            expect(url).toMatch(/supabase.example\/auth\/v1\/token\?grant_type=password$/)
            return { ok: true, status: 200, json: async () => ({ access_token: 'at', refresh_token: 'rt', user: { id: 'uuid', email: 'u@example.com' } }) }
        })

        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const res = await request(app).post('/api/auth/password/login').send({ email: 'u@example.com', password: 'secret' })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ status: 'ok' })
        expect(res.headers['set-cookie']).toBeDefined()
    })

    it('POST /api/auth/password/login returns 400 when SUPABASE not configured', async () => {
        delete process.env.PUBLIC_SUPABASE_URL
        delete process.env.SUPABASE_SECRET_KEY
        delete process.env.SUPABASE_ISS
        delete process.env.SUPABASE_ANON_KEY
        delete process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
        delete process.env.SUPABASE_SERVICE_ROLE_KEY

        const app = express()
        app.use(express.json())
        RegisterRoutes(app)

        const res = await request(app).post('/api/auth/password/login').send({ email: 'u@example.com', password: 'secret' })
        expect(res.status).toBe(400)
        expect(res.body).toEqual({ error: 'password not supported' })
    })
})