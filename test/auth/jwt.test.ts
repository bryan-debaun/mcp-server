import express from 'express'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import request from 'supertest'
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import {
    __resetAuthCaches,
    jwtMiddleware,
    verifySupabaseJwt,
} from '../../src/auth/jwt'
import { requireAdmin } from '../../src/auth/requireAdmin'
import { config } from '../../src/config.js'

let publicJwk: any
let privateKey: CryptoKey
const jwksUrl = 'https://example.local/.well-known/jwks.json'
const issuer = 'https://nanodcvcpklffksxofbm.supabase.co'
const audience = 'authenticated'

let origJwksUrl: string | undefined
let origIss: string | undefined
let origAud: string | undefined
let origSvcKey: string | undefined
let origAnonKey: string | undefined
let origJwksFromEnv: boolean
let origIssFromEnv: boolean
let origAdminIpAllowlist: string[]
let origInternalAdminKey: string | undefined

beforeAll(async () => {
    // Save originals
    origJwksUrl = config.auth.supabaseJwksUrl
    origIss = config.auth.supabaseIss
    origAud = config.auth.supabaseAud
    origSvcKey = config.auth.supabaseServiceRoleKey
    origAnonKey = config.auth.supabaseAnonKey
    origJwksFromEnv = config.auth.supabaseJwksUrlFromEnv
    origIssFromEnv = config.auth.supabaseIssFromEnv
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

    // Set config values used by middleware (replaces process.env.* reads). Pin the
    // JWKS/issuer as explicit env overrides so verification uses them directly
    // (discovery is exercised separately below).
    config.auth.supabaseJwksUrl = jwksUrl
    config.auth.supabaseIss = issuer
    config.auth.supabaseAud = audience
    config.auth.supabaseJwksUrlFromEnv = true
    config.auth.supabaseIssFromEnv = true
})

afterAll(() => {
    config.auth.supabaseJwksUrl = origJwksUrl
    config.auth.supabaseIss = origIss
    config.auth.supabaseAud = origAud
    config.auth.supabaseServiceRoleKey = origSvcKey
    config.auth.supabaseAnonKey = origAnonKey
    config.auth.supabaseJwksUrlFromEnv = origJwksFromEnv
    config.auth.supabaseIssFromEnv = origIssFromEnv
    config.security.adminIpAllowlist = origAdminIpAllowlist
    config.security.internalAdminKey = origInternalAdminKey
    __resetAuthCaches()
    vi.unstubAllGlobals()
})

afterEach(() => {
    // Restore per-test mutations between tests
    config.auth.supabaseServiceRoleKey = origSvcKey
    config.auth.supabaseAnonKey = origAnonKey
    config.auth.supabaseJwksUrl = jwksUrl
    config.auth.supabaseIss = issuer
    config.auth.supabaseJwksUrlFromEnv = true
    config.auth.supabaseIssFromEnv = true
    config.security.adminIpAllowlist = origAdminIpAllowlist
    config.security.internalAdminKey = origInternalAdminKey
    // Clear memoized auth config + JWKS so the next test re-resolves from config.
    __resetAuthCaches()
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

        const res = await request(app)
            .get('/whoami')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.user.sub).toBe('user-1')
    })

    it('rejects invalid token', async () => {
        const app = express()
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app)
            .get('/whoami')
            .set('Authorization', `Bearer invalid-token`)
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

    it('resolves jwks_uri and issuer from the OpenID discovery document when not pinned via env', async () => {
        const discoBase = 'https://disco.local/auth/v1'
        const discoJwks = `${discoBase}/.well-known/jwks.json`
        const discoIssuer = discoBase

        const prevFetch = (global as any).fetch
        const prevAuthBase = config.auth.supabaseAuthBase
        vi.stubGlobal('fetch', async (url: string) => {
            const u = url.toString()
            if (u === `${discoBase}/.well-known/openid-configuration`) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        jwks_uri: discoJwks,
                        issuer: discoIssuer,
                    }),
                }
            }
            if (u.startsWith(discoJwks)) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ keys: [publicJwk] }),
                }
            }
            return { ok: false, status: 404 }
        })

        // Force the discovery path: no explicit env pin, drive off the auth base.
        config.auth.supabaseJwksUrlFromEnv = false
        config.auth.supabaseIssFromEnv = false
        config.auth.supabaseAuthBase = discoBase
        __resetAuthCaches()

        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(discoIssuer)
            .setAudience(audience)
            .setSubject('user-disco')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        const payload = await verifySupabaseJwt(token)
        expect(String((payload as any).sub)).toBe('user-disco')

        // restore (afterEach also re-pins env + resets caches)
        ;(global as any).fetch = prevFetch
        config.auth.supabaseAuthBase = prevAuthBase
    })

    it('rejects service role key when not allowed by header or IP allowlist', async () => {
        const app = express()
        const serviceKey = 'super-secret-service-key'
        config.auth.supabaseServiceRoleKey = serviceKey
        app.get('/whoami', jwtMiddleware, (req, res) =>
            res.json({ user: (req as any).user }),
        )

        // requireAdmin is applied; without proper header/IP it should be forbidden
        app.get('/admin', jwtMiddleware, requireAdmin, (req, res) =>
            res.json({ ok: true }),
        )

        const res = await request(app)
            .get('/admin')
            .set('Authorization', `Bearer ${serviceKey}`)
        expect(res.status).toBe(403)
    })

    it('allows service key when ip is allowlisted and header present and writes audit log + metric', async () => {
        const app = express()
        const serviceKey = 'super-secret-service-key'
        config.auth.supabaseServiceRoleKey = serviceKey

        // Mock prisma.auditLog.create and metric
        const p = (await import('../../src/db/index.js')) as any
        p.prisma.auditLog = { create: vi.fn().mockResolvedValue({ id: 1 }) }

        config.security.adminIpAllowlist = ['::ffff:127.0.0.1']
        const m = (await import('../../src/http/metrics-route.js')) as any
        const incSpy = vi
            .spyOn(m.serviceRoleBypassTotal, 'inc')
            .mockImplementation(() => {})

        app.get('/admin', jwtMiddleware, requireAdmin, (req, res) =>
            res.json({ ok: true }),
        )

        const res = await request(app)
            .get('/admin')
            .set('Authorization', `Bearer ${serviceKey}`)
            .set('x-internal-key', 'my-internal-key')
        expect(res.status).toBe(403)

        // Now set internal key as well
        config.security.internalAdminKey = 'my-internal-key'
        const res2 = await request(app)
            .get('/admin')
            .set('Authorization', `Bearer ${serviceKey}`)
            .set('x-internal-key', 'my-internal-key')
        expect(res2.status).toBe(200)
        expect(p.prisma.auditLog.create).toHaveBeenCalled()
        expect(incSpy).toHaveBeenCalled()
    })

    // --- Issue #90: JWT admin auth resolution -------------------------------

    it('grants admin by matching a UUID sub to a local admin Profile by id (issue #90)', async () => {
        const supabaseSub = '00b72aac-2286-48e5-955a-c8012cceb9c5'
        const token = await new SignJWT({
            role: 'authenticated',
            email: 'brn.dbn@gmail.com',
        })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject(supabaseSub)
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        const p = (await import('../../src/db/index.js')) as any
        const findUnique = vi.fn().mockResolvedValue({
            id: supabaseSub,
            email: 'brn.dbn@gmail.com',
            isAdmin: true,
        })
        p.prisma.profile = { findUnique }

        const app = express()
        app.get('/admin', jwtMiddleware, requireAdmin, (_req, res) =>
            res.json({ ok: true }),
        )

        const res = await request(app)
            .get('/admin')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        // Regression guard: lookup must be by `id`, not the nonexistent `external_id`
        expect(findUnique).toHaveBeenCalledWith({ where: { id: supabaseSub } })
    })

    it('falls back to email lookup when the UUID id lookup misses (issue #90)', async () => {
        const supabaseSub = '11111111-2222-3333-4444-555555555555'
        const email = 'brn.dbn@gmail.com'
        const token = await new SignJWT({ role: 'authenticated', email })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject(supabaseSub)
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        const p = (await import('../../src/db/index.js')) as any
        const findUnique = vi
            .fn()
            .mockResolvedValueOnce(null) // id miss (stored Profile.id not yet reconciled)
            .mockResolvedValueOnce({
                id: 'stored-random-uuid',
                email,
                isAdmin: true,
            }) // email hit
        p.prisma.profile = { findUnique }

        const app = express()
        app.get('/admin', jwtMiddleware, requireAdmin, (_req, res) =>
            res.json({ ok: true }),
        )

        const res = await request(app)
            .get('/admin')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(findUnique).toHaveBeenNthCalledWith(1, {
            where: { id: supabaseSub },
        })
        expect(findUnique).toHaveBeenNthCalledWith(2, { where: { email } })
    })

    it('grants admin from app_metadata.role in the token without any DB lookup (hybrid)', async () => {
        const token = await new SignJWT({
            role: 'authenticated',
            app_metadata: { role: 'admin' },
        })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject('00b72aac-2286-48e5-955a-c8012cceb9c5')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        const p = (await import('../../src/db/index.js')) as any
        const findUnique = vi.fn()
        p.prisma.profile = { findUnique }

        const app = express()
        app.get('/admin', jwtMiddleware, requireAdmin, (req, res) =>
            res.json({ ok: true, user: (req as any).user }),
        )

        const res = await request(app)
            .get('/admin')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.user.role).toBe('admin')
        expect(res.body.user.isAdmin).toBe(true)
        expect(findUnique).not.toHaveBeenCalled() // stateless: token claim trusted, no DB hit
    })

    it('does not grant admin when the token app role is non-admin', async () => {
        const token = await new SignJWT({
            role: 'authenticated',
            app_metadata: { role: 'user' },
        })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject('00b72aac-2286-48e5-955a-c8012cceb9c5')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        const p = (await import('../../src/db/index.js')) as any
        p.prisma.profile = { findUnique: vi.fn() }

        const app = express()
        app.get('/admin', jwtMiddleware, requireAdmin, (_req, res) =>
            res.json({ ok: true }),
        )

        const res = await request(app)
            .get('/admin')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(403)
    })
})
