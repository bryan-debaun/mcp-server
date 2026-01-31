import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { jwtMiddleware, verifySupabaseJwt } from '../../src/auth/jwt'
import express from 'express'
import request from 'supertest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'

let publicJwk: any
let privateKey: CryptoKey
const jwksUrl = 'https://example.local/.well-known/jwks.json'
const issuer = 'https://nanodcvcpklffksxofbm.supabase.co'
const audience = 'authenticated'

beforeAll(async () => {
    // generate keys for test
    const { publicKey, privateKey: pk } = await generateKeyPair('RS256')
    privateKey = pk
    publicJwk = await exportJWK(publicKey)
    publicJwk.kid = 'test-kid'

    // stub fetch used by createRemoteJWKSet
    vi.stubGlobal('fetch', async (url: string) => {
        if (url.toString().startsWith('https://example.local')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ keys: [publicJwk] }),
            }
        }
        return { ok: false, status: 404 }
    })

    // set env vars used by middleware
    process.env.SUPABASE_JWKS_URL = jwksUrl
    process.env.SUPABASE_ISS = issuer
    process.env.SUPABASE_AUD = audience
})

afterAll(() => {
    vi.unstubAllGlobals()
})

describe('JWT middleware', () => {
    it('verifies a valid token and attaches user', async () => {
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject('user-1')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        // create a tiny express app using the middleware
        const app = express()
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => {
            res.json({ user: (req as any).user })
        })

        const res = await request(app).get('/whoami').set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.user.sub).toBe('user-1')
    })

    it('rejects invalid token', async () => {
        const app = express()
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app).get('/whoami').set('Authorization', `Bearer invalid-token`)
        expect(res.status).toBe(401)
    })

    it('verifySupabaseJwt fails for expired token', async () => {
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject('user-2')
            .setIssuedAt()
            .setExpirationTime('1s')
            .sign(privateKey as any)

        // wait to expire
        await new Promise((r) => setTimeout(r, 1100))

        await expect(verifySupabaseJwt(token)).rejects.toThrow()
    })

    it('falls back to anon-key endpoint when primary JWKS URL returns non-200', async () => {
        // stub fetch: primary returns 401, fallback returns keys
        vi.stubGlobal('fetch', async (url: string) => {
            if (url.toString().startsWith('https://primary.local')) {
                return { ok: false, status: 401, statusText: 'Unauthorized', text: async () => 'nope' }
            }
            if (url.toString().includes('/auth/v1/keys')) {
                return { ok: true, status: 200, json: async () => ({ keys: [publicJwk] }) }
            }
            return { ok: false, status: 404 }
        })

        process.env.SUPABASE_JWKS_URL = 'https://primary.local/jwks'
        process.env.SUPABASE_ISS = issuer
        process.env.SUPABASE_AUD = audience
        process.env.SUPABASE_ANON_KEY = 'anon-key'

        const sig = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject('user-3')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        const payload = await verifySupabaseJwt(sig)
        expect(payload.sub).toBe('user-3')

        // cleanup
        delete process.env.SUPABASE_ANON_KEY
        vi.unstubAllGlobals()
    })

    it('throws helpful error when JWKS primary and fallback fail', async () => {
        vi.stubGlobal('fetch', async (url: string) => {
            return { ok: false, status: 404, statusText: 'Not Found', text: async () => 'notfound' }
        })

        process.env.SUPABASE_JWKS_URL = 'https://primary.local/jwks'
        process.env.SUPABASE_ISS = issuer
        process.env.SUPABASE_AUD = audience

        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject('user-4')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        await expect(verifySupabaseJwt(token)).rejects.toThrow(/JWKS fetch failed/)
        vi.unstubAllGlobals()
    })

    it('rejects service role key when not allowed by header or IP allowlist', async () => {
        const app = express()
        const serviceKey = 'super-secret-service-key'
        process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app).get('/whoami').set('Authorization', `Bearer ${serviceKey}`)
        expect(res.status).toBe(401)
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
    })

    it('allows service key when ip is allowlisted and writes audit log', async () => {
        const app = express()
        const serviceKey = 'super-secret-service-key'
        process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
        // Mock prisma.auditLog.create
        const p = await import('../../src/db/index.js') as any
        p.prisma.auditLog = { create: vi.fn().mockResolvedValue({ id: 1 }) }

        // allowlist the loopback IP used by supertest
        process.env.ADMIN_IP_ALLOWLIST = '::ffff:127.0.0.1'

        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app).get('/whoami').set('Authorization', `Bearer ${serviceKey}`)
        expect(res.status).toBe(200)
        expect(res.body.user.role).toBe('admin')
        expect(p.prisma.auditLog.create).toHaveBeenCalled()

        delete process.env.SUPABASE_SERVICE_ROLE_KEY
        delete process.env.ADMIN_IP_ALLOWLIST
    })

    it('allows service key when INTERNAL_ADMIN_KEY header is present and writes audit log', async () => {
        const app = express()
        const serviceKey = 'super-secret-service-key'
        const internalKey = 'my-internal-key'
        process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
        process.env.INTERNAL_ADMIN_KEY = internalKey

        const p = await import('../../src/db/index.js') as any
        p.prisma.auditLog = { create: vi.fn().mockResolvedValue({ id: 2 }) }

        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app).get('/whoami').set('Authorization', `Bearer ${serviceKey}`).set('x-internal-key', internalKey)
        expect(res.status).toBe(200)
        expect(res.body.user.role).toBe('admin')
        expect(p.prisma.auditLog.create).toHaveBeenCalled()

        delete process.env.SUPABASE_SERVICE_ROLE_KEY
        delete process.env.INTERNAL_ADMIN_KEY
    })
})