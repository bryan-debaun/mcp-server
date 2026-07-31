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
    verifyAccessToken,
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
    origJwksUrl = config.auth.oidc.jwksUrl
    origIss = config.auth.oidc.issuer
    origAud = config.auth.oidc.audience
    origSvcKey = config.auth.serviceRoleKey
    origAnonKey = config.auth.anonKey
    origJwksFromEnv = config.auth.oidc.jwksUrlFromEnv
    origIssFromEnv = config.auth.oidc.issuerFromEnv
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
    config.auth.oidc.jwksUrl = jwksUrl
    config.auth.oidc.issuer = issuer
    config.auth.oidc.audience = audience
    config.auth.oidc.jwksUrlFromEnv = true
    config.auth.oidc.issuerFromEnv = true
})

afterAll(() => {
    config.auth.oidc.jwksUrl = origJwksUrl
    config.auth.oidc.issuer = origIss
    config.auth.oidc.audience = origAud
    config.auth.serviceRoleKey = origSvcKey
    config.auth.anonKey = origAnonKey
    config.auth.oidc.jwksUrlFromEnv = origJwksFromEnv
    config.auth.oidc.issuerFromEnv = origIssFromEnv
    config.security.adminIpAllowlist = origAdminIpAllowlist
    config.security.internalAdminKey = origInternalAdminKey
    __resetAuthCaches()
    vi.unstubAllGlobals()
})

afterEach(() => {
    // Restore per-test mutations between tests
    config.auth.serviceRoleKey = origSvcKey
    config.auth.anonKey = origAnonKey
    config.auth.oidc.jwksUrl = jwksUrl
    config.auth.oidc.issuer = issuer
    config.auth.oidc.jwksUrlFromEnv = true
    config.auth.oidc.issuerFromEnv = true
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

    it('verifyAccessToken fails for expired token', async () => {
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

        await expect(verifyAccessToken(token)).rejects.toThrow()
    })

    it('resolves jwks_uri and issuer from the OpenID discovery document when not pinned via env', async () => {
        const discoBase = 'https://disco.local/auth/v1'
        const discoJwks = `${discoBase}/.well-known/jwks.json`
        const discoIssuer = discoBase

        const prevFetch = (global as any).fetch
        const prevAuthBase = config.auth.oidc.discoveryBase
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
        config.auth.oidc.jwksUrlFromEnv = false
        config.auth.oidc.issuerFromEnv = false
        config.auth.oidc.discoveryBase = discoBase
        __resetAuthCaches()

        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(discoIssuer)
            .setAudience(audience)
            .setSubject('user-disco')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        const payload = await verifyAccessToken(token)
        expect(String((payload as any).sub)).toBe('user-disco')

        // restore (afterEach also re-pins env + resets caches)
        ;(global as any).fetch = prevFetch
        config.auth.oidc.discoveryBase = prevAuthBase
    })

    it('rejects service role key when not allowed by header or IP allowlist', async () => {
        const app = express()
        const serviceKey = 'super-secret-service-key'
        config.auth.serviceRoleKey = serviceKey
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
        config.auth.serviceRoleKey = serviceKey

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

    // --- Issues #90 / #151: JWT admin auth resolution -----------------------

    /** Sign a token for `sub` against the pinned test issuer/audience. */
    const signFor = async (sub: string, claims: Record<string, unknown> = {}) =>
        new SignJWT({ role: 'authenticated', ...claims })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject(sub)
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

    /** Tiny app exposing an admin-gated route through the real middleware. */
    const adminApp = () => {
        const app = express()
        app.get('/admin', jwtMiddleware, requireAdmin, (_req, res) =>
            res.json({ ok: true }),
        )
        return app
    }

    it('grants admin by matching a UUID sub to a local admin Profile (issue #90)', async () => {
        const sub = '00b72aac-2286-48e5-955a-c8012cceb9c5'
        const token = await signFor(sub, { email: 'brn.dbn@gmail.com' })

        const p = (await import('../../src/db/index.js')) as any
        const findMany = vi.fn().mockResolvedValue([
            {
                id: 'local-surrogate-id',
                issuer: null,
                externalId: sub,
                email: 'brn.dbn@gmail.com',
                isAdmin: true,
            },
        ])
        p.prisma.profile = { findMany, findUnique: vi.fn() }

        const res = await request(adminApp())
            .get('/admin')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        // Identity is matched on externalId scoped to the minting issuer, with a
        // NULL-issuer (pre-migration) row still accepted.
        expect(findMany).toHaveBeenCalledWith({
            where: {
                externalId: sub,
                OR: [{ issuer }, { issuer: null }],
            },
        })
    })

    // The #151 bug in one test: this subject is not UUID-shaped, so the old
    // regex-gated lookup skipped the DB entirely and reported isAdmin: false.
    it('grants admin for a NON-UUID subject with an admin profile (issue #151)', async () => {
        const logtoStyleSub = 'x7k2p9qm4n'
        const token = await signFor(logtoStyleSub)

        const p = (await import('../../src/db/index.js')) as any
        const findMany = vi.fn().mockResolvedValue([
            {
                id: 'local-surrogate-id',
                issuer,
                externalId: logtoStyleSub,
                email: 'brn.dbn@gmail.com',
                isAdmin: true,
            },
        ])
        p.prisma.profile = { findMany, findUnique: vi.fn() }

        const res = await request(adminApp())
            .get('/admin')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(findMany).toHaveBeenCalled()
    })

    it('prefers the issuer-attributed row over a legacy NULL-issuer row (issue #151)', async () => {
        const sub = 'shared-subject-value'
        const token = await signFor(sub)

        const p = (await import('../../src/db/index.js')) as any
        // Returned in the "wrong" order on purpose: selection must not depend on
        // the order Postgres happens to hand rows back in.
        const findMany = vi.fn().mockResolvedValue([
            { id: 'legacy', issuer: null, externalId: sub, isAdmin: false },
            { id: 'migrated', issuer, externalId: sub, isAdmin: true },
        ])
        p.prisma.profile = { findMany, findUnique: vi.fn() }

        const res = await request(adminApp())
            .get('/admin')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
    })

    it('falls back to email lookup when the subject lookup misses (issue #90)', async () => {
        const sub = '11111111-2222-3333-4444-555555555555'
        const email = 'brn.dbn@gmail.com'
        const token = await signFor(sub, { email })

        const p = (await import('../../src/db/index.js')) as any
        const findMany = vi.fn().mockResolvedValue([]) // no identity row yet
        const findUnique = vi.fn().mockResolvedValue({
            id: 'stored-random-uuid',
            email,
            isAdmin: true,
        })
        p.prisma.profile = { findMany, findUnique }

        const res = await request(adminApp())
            .get('/admin')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(findUnique).toHaveBeenCalledWith({ where: { email } })
    })

    it('counts and logs an unresolvable subject distinctly from a resolved non-admin (issue #151)', async () => {
        const { resolveAppRole } = await import('../../src/auth/jwt.js')
        const m = (await import('../../src/http/metrics-route.js')) as any
        const { logger } = (await import('../../src/logger.js')) as any
        const p = (await import('../../src/db/index.js')) as any

        const incSpy = vi
            .spyOn(m.authSubjectUnresolvedTotal, 'inc')
            .mockImplementation(() => {})
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})

        // 1. Resolved, but not an admin — an ordinary answer. Silent.
        p.prisma.profile = {
            findMany: vi
                .fn()
                .mockResolvedValue([
                    { id: 'p1', issuer, externalId: 'known', isAdmin: false },
                ]),
            findUnique: vi.fn(),
        }
        const resolved = await resolveAppRole({ sub: 'known', iss: issuer })
        expect(resolved).toMatchObject({ isAdmin: false, role: 'user' })
        expect(resolved.unresolvedSubject).toBeUndefined()
        expect(incSpy).not.toHaveBeenCalled()

        // 2. Nothing matched — an identity problem, not an authorization answer.
        p.prisma.profile = {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
        }
        const unresolved = await resolveAppRole({
            sub: 'ghost',
            iss: issuer,
            role: 'authenticated',
        })
        expect(unresolved).toMatchObject({
            isAdmin: false,
            unresolvedSubject: true,
        })
        expect(incSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy).toHaveBeenCalledWith(
            'auth: token verified but no local profile resolved',
            expect.objectContaining({ sub: 'ghost', issuer }),
        )

        incSpy.mockRestore()
        warnSpy.mockRestore()
    })

    it('reads the app role from a configured custom claim path (#150)', async () => {
        const { resolveAppRole } = await import('../../src/auth/jwt.js')
        const orig = config.auth.oidc.roleClaimPaths
        const p = (await import('../../src/db/index.js')) as any
        const findMany = vi.fn()
        p.prisma.profile = { findMany, findUnique: vi.fn() }

        try {
            config.auth.oidc.roleClaimPaths = ['realm_access.app_role']
            const resolved = await resolveAppRole({
                sub: 'user-x',
                realm_access: { app_role: 'admin' },
                // The default paths are present but must be ignored now.
                app_metadata: { role: 'user' },
            })
            expect(resolved).toMatchObject({ role: 'admin', isAdmin: true })
            expect(findMany).not.toHaveBeenCalled() // still stateless
        } finally {
            config.auth.oidc.roleClaimPaths = orig
        }
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
