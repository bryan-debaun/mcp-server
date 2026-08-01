import { NextFunction, Request, Response } from 'express'
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose'
import { config, legacyAuthEnvNames } from '../config.js'
import { prisma } from '../db/index.js'
import {
    setDbContextClaims,
    TRUSTED_SERVICE_CONTEXT,
} from '../db/request-context.js'
import { authSubjectUnresolvedTotal } from '../http/metrics-route.js'
import { logger } from '../logger.js'

if (!config.auth.oidc.jwksUrl) {
    logger.warn(
        'OIDC_JWKS_URL not set; JWT middleware will not validate tokens',
    )
}

if (legacyAuthEnvNames.length > 0) {
    logger.warn(
        `auth config uses legacy Supabase-prefixed env names (#150); rename in the deployment env: ${legacyAuthEnvNames.join(', ')}`,
    )
}

/** Resolved OIDC access-token verification parameters. */
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
 *   1. Explicit env overrides (OIDC_JWKS_URL + OIDC_ISSUER) — operator escape hatch.
 *   2. OIDC discovery (`<base>/.well-known/openid-configuration`) — the authoritative
 *      source for `jwks_uri`/`issuer`, so we track provider path changes automatically
 *      rather than hardcoding them. This is the primary path and the reason no
 *      `IIdentityProvider` abstraction is warranted: discovery already *is* the
 *      vendor-neutral interface.
 *   3. Values derived from the discovery base — used if discovery is unreachable.
 */
async function resolveAuthConfig(): Promise<AuthVerifyConfig> {
    const audience = config.auth.oidc.audience
    if (!audience) throw new Error('OIDC_AUDIENCE must be set')

    if (
        config.auth.oidc.jwksUrlFromEnv &&
        config.auth.oidc.issuerFromEnv &&
        config.auth.oidc.jwksUrl &&
        config.auth.oidc.issuer
    ) {
        return {
            jwksUrl: config.auth.oidc.jwksUrl,
            issuer: config.auth.oidc.issuer,
            audience,
        }
    }

    const base = config.auth.oidc.discoveryBase
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
                    'OIDC discovery doc missing jwks_uri/issuer; using derived config',
                )
            } else {
                logger.warn(
                    `OIDC discovery returned ${res.status}; using derived config`,
                )
            }
        } catch (err: any) {
            logger.warn(
                'OIDC discovery fetch failed; using derived config',
                err?.message ?? err,
            )
        }
    }

    if (config.auth.oidc.jwksUrl && config.auth.oidc.issuer) {
        return {
            jwksUrl: config.auth.oidc.jwksUrl,
            issuer: config.auth.oidc.issuer,
            audience,
        }
    }
    throw new Error(
        'OIDC auth not configured: set OIDC_DISCOVERY_BASE (or PUBLIC_SUPABASE_URL) or OIDC_JWKS_URL/OIDC_ISSUER',
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

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
    const { jwksUrl, issuer, audience } = await getAuthConfig()
    const { payload } = await jwtVerify(token, getJwks(jwksUrl), {
        issuer,
        audience,
    })
    return payload
}

/** Read a dotted claim path (`app_metadata.role`) out of a token payload. */
function readClaimPath(payload: any, path: string): unknown {
    return path
        .split('.')
        .reduce<any>(
            (acc, key) => (acc == null ? undefined : acc[key]),
            payload,
        )
}

/**
 * Resolve an application role baked into the token, if present.
 *
 * Which claims to consult is configuration (`OIDC_ROLE_CLAIM_PATH`), defaulting
 * to `app_metadata.role` then `user_role` — the previous hardcoded behaviour.
 *
 * NOTE: Supabase always sets a top-level `role` claim, but it is the Postgres
 * role (`anon` | `authenticated` | `service_role`) — NOT an application role, so
 * it is deliberately absent from the default paths.
 */
function roleFromToken(payload: any): string | undefined {
    for (const path of config.auth.oidc.roleClaimPaths) {
        const value = readClaimPath(payload, path)
        if (typeof value === 'string' && value.length > 0) return value
    }
    return undefined
}

/**
 * Look up the local Profile for an authenticated subject.
 *
 * The subject is treated as an **opaque string** (#151). It used to be gated on
 * a UUID-shaped regex because `Profile.id` doubled as the Supabase Auth user id;
 * any issuer minting non-UUID subjects (Logto uses short alphanumeric ids) fell
 * straight through that gate to the email fallback or to no profile at all —
 * and `resolveAppRole` reports `isAdmin: false` when no profile is found, so an
 * admin was silently downgraded rather than erroring loudly.
 *
 * Identity now lives in an explicit `(issuer, externalId)` pair, so a subject is
 * attributable to the issuer that minted it and two issuers can coexist during a
 * migration. Resolution order:
 *
 *   1. A row explicitly attributed to this token's issuer.
 *   2. A pre-migration row (`issuer` NULL, `externalId` backfilled from `id`).
 *   3. Email from the JWT — retained per #90, but no longer load-bearing.
 */
async function findLocalProfileBySub(
    sub: string,
    issuer?: string,
    email?: string,
) {
    const s = sub ? String(sub) : ''

    if (s) {
        // One round trip for both candidates; prefer the issuer-attributed row
        // so a legacy unattributed row can't shadow a migrated one.
        const candidates = await prisma.profile.findMany({
            where: {
                externalId: s,
                OR: [{ issuer: issuer ?? null }, { issuer: null }],
            },
        })
        const attributed = candidates.find((p: any) => p.issuer === issuer)
        if (attributed) return attributed
        const legacy = candidates.find((p: any) => p.issuer === null)
        if (legacy) return legacy
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
    /**
     * True when the token verified but no local Profile could be matched to its
     * subject. Distinguishes "we know who this is, they are not an admin" from
     * "we could not identify this user at all" — the two used to be
     * indistinguishable, which is what made the #151 downgrade silent.
     */
    unresolvedSubject?: boolean
}

/**
 * Hybrid authorization resolution: prefer an app role baked into the token
 * (stateless, no DB hit — the standard/scalable path); otherwise fall back to
 * the local Profile (by issuer+subject, then email). Pure — returns the
 * resolution so both the Express middleware and the TSOA authentication handler
 * can share it.
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

    const sub = payload?.sub ? String(payload.sub) : ''
    const issuer = typeof payload?.iss === 'string' ? payload.iss : undefined
    const profile = await findLocalProfileBySub(
        sub,
        issuer,
        typeof payload?.email === 'string' ? payload.email : undefined,
    )
    if (profile) {
        return {
            role: profile.isAdmin ? 'admin' : 'user',
            isAdmin: Boolean(profile.isAdmin),
            localUserId: profile.id,
        }
    }

    // No app role and no local profile. This still fails closed on admin, but it
    // is now loud: a valid token whose subject we cannot map to a profile is an
    // identity problem, not an authorization answer, and it should never again
    // look the same as an ordinary non-admin user in the logs.
    try {
        authSubjectUnresolvedTotal.inc()
    } catch {
        /* metrics must never break auth */
    }
    logger.warn('auth: token verified but no local profile resolved', {
        sub,
        issuer,
        hasEmailClaim: typeof payload?.email === 'string',
    })

    // Preserve the token's (Postgres) role claim so non-admin authenticated
    // users still pass non-admin guards.
    return {
        role: typeof payload?.role === 'string' ? payload.role : 'user',
        isAdmin: false,
        unresolvedSubject: true,
    }
}

/** Resolve authz for a request and mutate `req.user` in place. */
async function resolveUserAuthz(req: any, payload: any) {
    const { role, isAdmin, localUserId } = await resolveAppRole(payload)
    req.user.role = role
    req.user.isAdmin = isAdmin
    if (localUserId !== undefined) req.user.localUserId = localUserId

    // Hand the resolved identity to the database layer so RLS policies can see
    // it. `role` here is the *application* role, which is what the policies key
    // on — deliberately not the Postgres role claim.
    setDbContextClaims({
        role,
        email: typeof payload?.email === 'string' ? payload.email : undefined,
        sub: payload?.sub ? String(payload.sub) : undefined,
    })
}

export async function jwtMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const auth = req.headers.authorization
        const serviceRoleKey = config.auth.serviceRoleKey

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
                // `requireAdmin` still demands INTERNAL_ADMIN_KEY + an allowlisted
                // IP before this path can do anything; granting admin claims here
                // keeps the DB layer consistent with that existing decision.
                setDbContextClaims(TRUSTED_SERVICE_CONTEXT)
                return next()
            }

            const token = auth.slice('Bearer '.length)
            const payload = await verifyAccessToken(token)

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

        // No Authorization header — an OIDC bearer token is the only accepted
        // credential (custom session-cookie auth was removed).
        return res.status(401).json({ error: 'Missing token' })
    } catch (err: any) {
        logger.warn('JWT validation failed', err?.message ?? err)
        return res.status(401).json({ error: 'Unauthorized' })
    }
}
