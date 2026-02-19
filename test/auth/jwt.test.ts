import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { jwtMiddleware, verifySupabaseJwt } from '../../src/auth/jwt'
import { requireAdmin } from '../../src/auth/requireAdmin'
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

    it('verifies a valid session cookie and attaches user', async () => {
        process.env.SESSION_JWT_SECRET = 'session-secret'
        const sessionToken = await new SignJWT({ userId: 42 })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject('cookie-user')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(new TextEncoder().encode(process.env.SESSION_JWT_SECRET) as any)

        const app = express()
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app).get('/whoami').set('Cookie', `session=${sessionToken}`)
        expect(res.status).toBe(200)
        expect(res.body.user.sub).toBe('cookie-user')

        delete process.env.SESSION_JWT_SECRET
    })

    it('rejects invalid session cookie', async () => {
        const app = express()
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app).get('/whoami').set('Cookie', 'session=invalid-token')
        expect(res.status).toBe(401)
    })

    it('uses Authorization header when both header and session cookie are present', async () => {
        // build a supabase-signed token for the header
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject('user-header')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        // set session cookie with different sub
        process.env.SESSION_JWT_SECRET = 'session-secret'
        const sessionToken = await new SignJWT({ userId: 99 })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject('cookie-user')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(new TextEncoder().encode(process.env.SESSION_JWT_SECRET) as any)

        const app = express()
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app)
            .get('/whoami')
            .set('Authorization', `Bearer ${token}`)
            .set('Cookie', `session=${sessionToken}`)

        expect(res.status).toBe(200)
        expect(res.body.user.sub).toBe('user-header')

        delete process.env.SESSION_JWT_SECRET
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

    it('falls back to anon/publishable-key endpoint when primary JWKS URL returns non-200 (supports PUBLIC_SUPABASE_PUBLISHABLE_KEY)', async () => {
        // preserve and replace global.fetch for this test only
        const prevFetch = (global as any).fetch
        vi.stubGlobal('fetch', async (url: string) => {
            if (url.toString().startsWith('https://primary.local')) {
                return { ok: false, status: 401, statusText: 'Unauthorized', text: async () => 'nope' }
            }
            if (url.toString().includes('/auth/v1/keys')) {
                return { ok: true, status: 200, json: async () => ({ keys: [publicJwk] }) }
            }
            return { ok: false, status: 404 }
        })

        const prevJwksEnv = process.env.SUPABASE_JWKS_URL
        process.env.SUPABASE_JWKS_URL = 'https://primary.local/jwks'
        process.env.SUPABASE_ISS = issuer
        process.env.SUPABASE_AUD = audience
        process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key'

        const sig = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject('user-3')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        const payload = await verifySupabaseJwt(sig)
        if (!payload || String((payload as any).sub) !== 'user-3') {
            throw new Error(`unexpected payload from verifySupabaseJwt: ${JSON.stringify(payload)}`)
        }

        // cleanup - restore previous fetch and env
        (global as any).fetch = prevFetch
        delete process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
        process.env.SUPABASE_JWKS_URL = prevJwksEnv
    })

    it('throws helpful error when JWKS primary and fallback fail', async () => {
        const prevFetch = (global as any).fetch
        vi.stubGlobal('fetch', async (_url: string) => {
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
            ; (global as any).fetch = prevFetch
    })

    it('rejects service role key when not allowed by header or IP allowlist', async () => {
        const app = express()
        const serviceKey = 'super-secret-service-key'
        process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
        process.env.SUPABASE_SECRET_KEY = serviceKey
        app.get('/whoami', jwtMiddleware, (req, res) => res.json({ user: (req as any).user }))

        // requireAdmin is applied; without proper header/IP it should be forbidden
        app.get('/admin', jwtMiddleware, requireAdmin, (req, res) => res.json({ ok: true }))

        const res = await request(app).get('/admin').set('Authorization', `Bearer ${serviceKey}`)
        expect(res.status).toBe(403)
        delete process.env.SUPABASE_SERVICE_ROLE_KEY
        delete process.env.SUPABASE_SECRET_KEY
    })

    it('allows service key when ip is allowlisted and header present and writes audit log + metric', async () => {
        const app = express()
        const serviceKey = 'super-secret-service-key'
        process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
        process.env.SUPABASE_SECRET_KEY = serviceKey

        // Mock prisma.auditLog.create and metric
        const p = await import('../../src/db/index.js') as any
        p.prisma.auditLog = { create: vi.fn().mockResolvedValue({ id: 1 }) }

        process.env.ADMIN_IP_ALLOWLIST = '::ffff:127.0.0.1'
        const m = await import('../../src/http/metrics-route.js') as any
        const incSpy = vi.spyOn(m.serviceRoleBypassTotal, 'inc').mockImplementation(() => { })

        app.get('/admin', jwtMiddleware, requireAdmin, (req, res) => res.json({ ok: true }))

        const res = await request(app).get('/admin').set('Authorization', `Bearer ${serviceKey}`).set('x-internal-key', 'my-internal-key')
        expect(res.status).toBe(403)

        // Now set internal key as well
        process.env.INTERNAL_ADMIN_KEY = 'my-internal-key'
        const res2 = await request(app).get('/admin').set('Authorization', `Bearer ${serviceKey}`).set('x-internal-key', 'my-internal-key')
        expect(res2.status).toBe(200)
        expect(p.prisma.auditLog.create).toHaveBeenCalled()
        expect(incSpy).toHaveBeenCalled()

        delete process.env.SUPABASE_SERVICE_ROLE_KEY
        delete process.env.SUPABASE_SECRET_KEY
        delete process.env.ADMIN_IP_ALLOWLIST
        delete process.env.INTERNAL_ADMIN_KEY
    })

    it('maps a Supabase JWT sub (external_id) to local user and grants admin when local user is admin', async () => {
        const supabaseSub = '00b72aac-2286-48e5-955a-c8012cceb9c5'
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject(supabaseSub)
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        // stub verifySupabaseJwt to avoid network JWKS dependency and return the token payload
        const jwtMod = await import('../../src/auth/jwt.js') as any
        vi.spyOn(jwtMod, 'verifySupabaseJwt').mockResolvedValue({ sub: supabaseSub, iss: issuer, aud: audience } as any)

        // stub prisma user lookup by external_id
        const p = await import('../../src/db/index.js') as any
        p.prisma.profile = {
            findUnique: vi.fn().mockResolvedValue({
                id: 1,
                email: 'brn.dbn@gmail.com',
                external_id: supabaseSub,
                isAdmin: true,
                role: { name: 'admin' },
            })
        }

        const app = express()
        app.get('/admin', jwtMiddleware, requireAdmin, (req, res) => res.json({ ok: true }))

        const res = await request(app).get('/admin').set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(p.prisma.profile.findUnique).toHaveBeenCalled()
    })

    it('maps a Supabase JWT sub that is an email to local user and attaches role', async () => {
        const emailSub = 'brn.dbn@gmail.com'
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject(emailSub)
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        // stub verifySupabaseJwt to avoid network JWKS dependency and return the token payload
        const jwtMod = await import('../../src/auth/jwt.js') as any
        vi.spyOn(jwtMod, 'verifySupabaseJwt').mockResolvedValue({ sub: emailSub, iss: issuer, aud: audience } as any)

        // stub prisma user lookup by email
        const p = await import('../../src/db/index.js') as any
        p.prisma.profile = {
            findUnique: vi.fn().mockResolvedValue({
                id: 1,
                email: emailSub,
                external_id: '00b72aac-2286-48e5-955a-c8012cceb9c5',
                isAdmin: false,
                role: { name: 'user' },
            })
        }

        const app = express()
        app.get('/whoami', jwtMiddleware, (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app).get('/whoami').set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.user.role).toBe('user')
        expect(p.prisma.profile.findUnique).toHaveBeenCalled()
    })
})