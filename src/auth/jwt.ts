import { NextFunction, Request, Response } from 'express'
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose'
import { config } from '../config.js'
import { prisma } from '../db/index.js'
import { logger } from '../logger.js'

if (!config.auth.supabaseJwksUrl) {
    logger.warn(
        'SUPABASE_JWKS_URL not set; JWT middleware will not validate tokens',
    )
}

/** Resolved Supabase JWT verification parameters. */
interface AuthVerifyConfig {
    jwksUrl: string
    issuer: string
    audience: string
}

// Memoize the resolved auth config (one discovery fetch per process) and the
// remote JWKS set (jose fetches + caches keys, with rotation, behind this).
let _authConfigPromise: Promise<AuthVerifyConfig> | null = null
let _jwks:
    | { url: string; set: ReturnType<typeof createRemoteJWKSet> }
    | undefined

/** Test-only: clear memoized discovery + JWKS so config changes take effect. */
export function __resetAuthCaches(): void {
    _authConfigPromise = null
    _jwks = undefined
}

function getJwks(url: string) {
    if (!_jwks || _jwks.url !== url) {
        _jwks = { url, set: createRemoteJWKSet(new URL(url)) }
    }
    return _jwks.set
}

/**
 * Resolve the JWKS URL + issuer to verify against, in priority order:
 *   1. Explicit env overrides (SUPABASE_JWKS_URL + SUPABASE_ISS) — operator escape hatch.
 *   2. OpenID discovery (`<supabase>/auth/v1/.well-known/openid-configuration`) — the
 *      authoritative source for `jwks_uri`/`issuer`, so we track Supabase path changes
 *      automatically rather than hardcoding them.
 *   3. Values derived from PUBLIC_SUPABASE_URL under `/auth/v1` — used if discovery is
 *      unreachable.
 */
async function resolveAuthConfig(): Promise<AuthVerifyConfig> {
    const audience = config.auth.supabaseAud
    if (!audience) throw new Error('SUPABASE_AUD must be set')

    if (
        config.auth.supabaseJwksUrlFromEnv &&
        config.auth.supabaseIssFromEnv &&
        config.auth.supabaseJwksUrl &&
        config.auth.supabaseIss
    ) {
        return {
            jwksUrl: config.auth.supabaseJwksUrl,
            issuer: config.auth.supabaseIss,
            audience,
        }
    }

    const base = config.auth.supabaseAuthBase
    if (base) {
        try {
            const res = await fetch(`${base}/.well-known/openid-configuration`)
            if (res.ok) {
                const doc = (await res.json()) as {
                    jwks_uri?: string
                    issuer?: string
                }
                if (doc.jwks_uri && doc.issuer) {
                    return {
                        jwksUrl: doc.jwks_uri,
                        issuer: doc.issuer,
                        audience,
                    }
                }
                logger.warn(
                    'OpenID discovery doc missing jwks_uri/issuer; using derived config',
                )
            } else {
                logger.warn(
                    `OpenID discovery returned ${res.status}; using derived config`,
                )
            }
        } catch (err: any) {
            logger.warn(
                'OpenID discovery fetch failed; using derived config',
                err?.message ?? err,
            )
        }
    }

    if (config.auth.supabaseJwksUrl && config.auth.supabaseIss) {
        return {
            jwksUrl: config.auth.supabaseJwksUrl,
            issuer: config.auth.supabaseIss,
            audience,
        }
    }
    throw new Error(
        'Supabase auth not configured: set PUBLIC_SUPABASE_URL or SUPABASE_JWKS_URL/SUPABASE_ISS',
    )
}

function getAuthConfig(): Promise<AuthVerifyConfig> {
    // Don't cache a rejection — a transient discovery failure shouldn't wedge auth forever.
    if (!_authConfigPromise) {
        _authConfigPromise = resolveAuthConfig().catch((err) => {
            _authConfigPromise = null
            throw err
        })
    }
    return _authConfigPromise
}

export async function verifySupabaseJwt(token: string): Promise<JWTPayload> {
    const { jwksUrl, issuer, audience } = await getAuthConfig()
    const { payload } = await jwtVerify(token, getJwks(jwksUrl), {
        issuer,
        audience,
    })
    return payload
}

/**
 * Resolve an application role baked into the token, if present.
 *
 * NOTE: Supabase always sets a top-level `role` claim, but it is the Postgres
 * role (`anon` | `authenticated` | `service_role`) — NOT an application role.
 * We deliberately ignore that claim and look for an app-level role under
 * `app_metadata.role` (admin-controlled, the standard Supabase RBAC location)
 * or a custom top-level `user_role` claim emitted by a custom access-token hook.
 */
function roleFromToken(payload: any): string | undefined {
    const appRole = payload?.app_metadata?.role ?? payload?.user_role
    return typeof appRole === 'string' && appRole.length > 0
        ? appRole
        : undefined
}

/**
 * Look up the local Profile for a Supabase user. `Profile.id` IS the Supabase
 * Auth `user.id` (UUID), so match on `id` first; fall back to `email` (from the
 * JWT) so admin auth still works when a stored Profile.id has not yet been
 * reconciled with the Supabase UUID. See issue #90.
 */
async function findLocalProfileBySub(sub: string, email?: string) {
    const s = sub ? String(sub) : ''
    if (s && /^[0-9a-fA-F-]{36}$/.test(s)) {
        const byId = await prisma.profile.findUnique({ where: { id: s } })
        if (byId) return byId
    }
    const emailToTry = s.includes('@') ? s : email
    if (emailToTry)
        return prisma.profile.findUnique({ where: { email: emailToTry } })
    return null
}

export interface ResolvedAuthz {
    role: string
    isAdmin: boolean
    localUserId?: unknown
}

/**
 * Hybrid authorization resolution: prefer an app role baked into the token
 * (stateless, no DB hit — the standard/scalable path); otherwise fall back to
 * the local Profile (by id, then email). Pure — returns the resolution so both
 * the Express middleware and the TSOA authentication handler can share it.
 */
export async function resolveAppRole(payload: any): Promise<ResolvedAuthz> {
    const tokenRole = roleFromToken(payload)
    if (tokenRole) {
        return {
            role: tokenRole,
            isAdmin: tokenRole === 'admin',
            localUserId: payload?.sub,
        }
    }

    const profile = await findLocalProfileBySub(
        payload?.sub ? String(payload.sub) : '',
        typeof payload?.email === 'string' ? payload.email : undefined,
    )
    if (profile) {
        return {
            role: profile.isAdmin ? 'admin' : 'user',
            isAdmin: Boolean(profile.isAdmin),
            localUserId: profile.id,
        }
    }

    // No app role and no local profile: preserve the token's (Postgres) role
    // claim so non-admin authenticated users still pass non-admin guards.
    return {
        role: typeof payload?.role === 'string' ? payload.role : 'user',
        isAdmin: false,
    }
}

/** Resolve authz for a request and mutate `req.user` in place. */
async function resolveUserAuthz(req: any, payload: any) {
    const { role, isAdmin, localUserId } = await resolveAppRole(payload)
    req.user.role = role
    req.user.isAdmin = isAdmin
    if (localUserId !== undefined) req.user.localUserId = localUserId
}

export async function jwtMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const auth = req.headers.authorization
        const serviceRoleKey = config.auth.supabaseServiceRoleKey

        if (auth) {
            // If Authorization header exists it must be a Bearer token
            if (!auth.startsWith('Bearer '))
                return res.status(401).json({ error: 'Missing token' })

            if (serviceRoleKey && auth === `Bearer ${serviceRoleKey}`) {
                // Mark the request as coming from a service role. Authorization checks (header + IP allowlist)
                // are enforced in the `requireAdmin` middleware which will reject with 403 if the request
                // is not allowed. We avoid writing audit logs here to centralize auditing/metrics in one place.
                ;(<any>req).user = {
                    sub: 'service',
                    role: 'admin',
                    service: true,
                }
                return next()
            }

            const token = auth.slice('Bearer '.length)
            const payload = await verifySupabaseJwt(token)

            // attach a minimal user object (from token)
            ;(<any>req).user = Object.assign({ sub: payload.sub }, payload)

            // Resolve application role (token claim preferred, local Profile fallback)
            try {
                await resolveUserAuthz(req as any, payload)
            } catch (err) {
                logger.debug(
                    'jwtMiddleware: failed to resolve authz for token sub',
                    err,
                )
            }

            return next()
        }

        // No Authorization header — a Supabase JWT bearer token is the only
        // accepted credential (custom session-cookie auth was removed).
        return res.status(401).json({ error: 'Missing token' })
    } catch (err: any) {
        logger.warn('JWT validation failed', err?.message ?? err)
        return res.status(401).json({ error: 'Unauthorized' })
    }
}
