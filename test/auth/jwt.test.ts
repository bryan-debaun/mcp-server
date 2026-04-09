import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { jwtMiddleware, verifySupabaseJwt } from '../../src/auth/jwt'
import { requireAdmin } from '../../src/auth/requireAdmin'
import express from 'express'
import request from 'supertest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { config } from '../../src/config.js'

let publicJwk: any
let privateKey: CryptoKey
const jwksUrl = 'https://example.local/.well-known/jwks.json'
const issuer = 'https://nanodcvcpklffksxofbm.supabase.co'
const audience = 'authenticated'

let origJwksUrl: string | undefined
let origIss: string | undefined
let origAud: string | undefined
let origSessionSecret: string | undefined
let origSvcKey: string | undefined
let origAnonKey: string | undefined
let origAdminIpAllowlist: string[]
let origInternalAdminKey: string | undefined

beforeAll(async () => {
    // Save originals
    origJwksUrl = config.auth.supabaseJwksUrl
    origIss = config.auth.supabaseIss
    origAud = config.auth.supabaseAud
    origSessionSecret = config.auth.sessionJwtSecret
    origSvcKey = config.auth.supabaseServiceRoleKey
    origAnonKey = config.auth.supabaseAnonKey
    origAdminIpAllowlist = config.security.adminIpAllowlist
    origInternalAdminKey = config.security.internalAdminKey

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

    // Set config values used by middleware (replaces process.env.* reads)
    config.auth.supabaseJwksUrl = jwksUrl
    config.auth.supabaseIss = issuer
    config.auth.supabaseAud = audience
})

afterAll(() => {
    config.auth.supabaseJwksUrl = origJwksUrl
    config.auth.supabaseIss = origIss
    config.auth.supabaseAud = origAud
    config.auth.sessionJwtSecret = origSessionSecret
    config.auth.supabaseServiceRoleKey = origSvcKey
    config.auth.supabaseAnonKey = origAnonKey
    config.security.adminIpAllowlist = origAdminIpAllowlist
    config.security.internalAdminKey = origInternalAdminKey
    vi.unstubAllGlobals()
})

afterEach(() => {
    // Restore per-test mutations between tests
    config.auth.sessionJwtSecret = origSessionSecret
    config.auth.supabaseServiceRoleKey = origSvcKey
    config.auth.supabaseAnonKey = origAnonKey
    config.security.adminIpAllowlist = origAdminIpAllowlist
    config.security.internalAdminKey = origInternalAdminKey
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
        config.auth.sessionJwtSecret = 'session-secret'
        const sessionToken = await new SignJWT({ userId: 42 })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject('cookie-user')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(new TextEncoder().encode(config.auth.sessionJwtSecret) as any)

        const app = express()
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app).get('/whoami').set('Cookie', `session=${sessionToken}`)
        expect(res.status).toBe(200)
        expect(res.body.user.sub).toBe('cookie-user')
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
        config.auth.sessionJwtSecret = 'session-secret'
        const sessionToken = await new SignJWT({ userId: 99 })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject('cookie-user')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(new TextEncoder().encode(config.auth.sessionJwtSecret) as any)

        const app = express()
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app)
            .get('/whoami')
            .set('Authorization', `Bearer ${token}`)
            .set('Cookie', `session=${sessionToken}`)

        expect(res.status).toBe(200)
        expect(res.body.user.sub).toBe('user-header')
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

        const prevConfigJwksUrl = config.auth.supabaseJwksUrl
        const prevConfigAnonKey = config.auth.supabaseAnonKey
        config.auth.supabaseJwksUrl = 'https://primary.local/jwks'
        config.auth.supabaseAnonKey = 'publishable-key'

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

        // cleanup - restore previous fetch and config
        ; (global as any).fetch = prevFetch
        config.auth.supabaseJwksUrl = prevConfigJwksUrl
        config.auth.supabaseAnonKey = prevConfigAnonKey
    })

    it('throws helpful error when JWKS primary and fallback fail', async () => {
        const prevFetch = (global as any).fetch
        vi.stubGlobal('fetch', async (_url: string) => {
            return { ok: false, status: 404, statusText: 'Not Found', text: async () => 'notfound' }
        })

        const prevConfigJwksUrl2 = config.auth.supabaseJwksUrl
        config.auth.supabaseJwksUrl = 'https://primary.local/jwks'

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
        config.auth.supabaseJwksUrl = prevConfigJwksUrl2
    })

    it('rejects service role key when not allowed by header or IP allowlist', async () => {
        const app = express()
        const serviceKey = 'super-secret-service-key'
        config.auth.supabaseServiceRoleKey = serviceKey
        app.get('/whoami', jwtMiddleware, (req, res) => res.json({ user: (req as any).user }))

        // requireAdmin is applied; without proper header/IP it should be forbidden
        app.get('/admin', jwtMiddleware, requireAdmin, (req, res) => res.json({ ok: true }))

        const res = await request(app).get('/admin').set('Authorization', `Bearer ${serviceKey}`)
        expect(res.status).toBe(403)
    })

    it('allows service key when ip is allowlisted and header present and writes audit log + metric', async () => {
        const app = express()
        const serviceKey = 'super-secret-service-key'
        config.auth.supabaseServiceRoleKey = serviceKey

        // Mock prisma.auditLog.create and metric
        const p = await import('../../src/db/index.js') as any
        p.prisma.auditLog = { create: vi.fn().mockResolvedValue({ id: 1 }) }

        config.security.adminIpAllowlist = ['::ffff:127.0.0.1']
        const m = await import('../../src/http/metrics-route.js') as any
        const incSpy = vi.spyOn(m.serviceRoleBypassTotal, 'inc').mockImplementation(() => { })

        app.get('/admin', jwtMiddleware, requireAdmin, (req, res) => res.json({ ok: true }))

        const res = await request(app).get('/admin').set('Authorization', `Bearer ${serviceKey}`).set('x-internal-key', 'my-internal-key')
        expect(res.status).toBe(403)

        // Now set internal key as well
        config.security.internalAdminKey = 'my-internal-key'
        const res2 = await request(app).get('/admin').set('Authorization', `Bearer ${serviceKey}`).set('x-internal-key', 'my-internal-key')
        expect(res2.status).toBe(200)
        expect(p.prisma.auditLog.create).toHaveBeenCalled()
        expect(incSpy).toHaveBeenCalled()
    })

    it('maps a Supabase JWT sub (external_id) to local user and grants admin when local user is admin', async () => {
        const supabaseSub = '00b72aac-2286-48e5-955a-c8012cceb9c5'

        // Use a session cookie to exercise the mapping logic without JWKS/network dependence
        config.auth.sessionJwtSecret = 'session-secret'
        const sessionToken = await new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(supabaseSub)
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(new TextEncoder().encode(config.auth.sessionJwtSecret) as any)

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

        const res = await request(app).get('/admin').set('Cookie', `session=${sessionToken}`)
        expect(res.status).toBe(200)
        expect(p.prisma.profile.findUnique).toHaveBeenCalled()
    })

    it('maps a Supabase JWT sub that is an email to local user and attaches role', async () => {
        const emailSub = 'brn.dbn@gmail.com'

        // Use a session cookie to exercise the mapping logic without JWKS/network dependence
        config.auth.sessionJwtSecret = 'session-secret'
        const sessionToken = await new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(emailSub)
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(new TextEncoder().encode(config.auth.sessionJwtSecret) as any)

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

        const res = await request(app).get('/whoami').set('Cookie', `session=${sessionToken}`)
        expect(res.status).toBe(200)
        expect(res.body.user.role).toBe('user')
        expect(p.prisma.profile.findUnique).toHaveBeenCalled()
    })
})