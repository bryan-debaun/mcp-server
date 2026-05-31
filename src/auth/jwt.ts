import { Request, Response, NextFunction } from 'express'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { verifySessionToken } from './session.js'
import { prisma } from '../db/index.js'
import { config } from '../config.js'

if (!config.auth.supabaseJwksUrl) {
    console.warn('SUPABASE_JWKS_URL not set; JWT middleware will not validate tokens')
}

export async function verifySupabaseJwt(token: string): Promise<JWTPayload> {
    let _jwksUrl = config.auth.supabaseJwksUrl
    const _issuer = config.auth.supabaseIss
    const _audience = config.auth.supabaseAud

    if (!_jwksUrl) throw new Error('JWKS URL not configured')
    if (!_issuer || !_audience) throw new Error('SUPABASE_ISS and SUPABASE_AUD must be set')

    // Attempt to fetch the JWKS URL to validate it's reachable and returns 200 OK.
    try {
        const res = await fetch(_jwksUrl, { method: 'GET' })
        if (!res.ok) {
            // Try fallback using publishable key (PUBLIC_SUPABASE_PUBLISHABLE_KEY) or legacy SUPABASE_ANON_KEY
            const publishable = config.auth.supabaseAnonKey
            if (publishable) {
                const fallback = `${_issuer.replace(/\/$/, '')}/auth/v1/keys?apikey=${publishable}`
                const res2 = await fetch(fallback, { method: 'GET' })
                if (res2.ok) {
                    _jwksUrl = fallback
                } else {
                    const text1 = typeof res.text === 'function' ? await res.text().catch(() => '') : (typeof res.json === 'function' ? JSON.stringify(await res.json().catch(() => ({}))) : '')
                    const text2 = typeof res2.text === 'function' ? await res2.text().catch(() => '') : (typeof res2.json === 'function' ? JSON.stringify(await res2.json().catch(() => ({}))) : '')
                    throw new Error(`JWKS fetch failed: primary ${res.status} ${res.statusText} (${text1}), fallback ${res2.status} ${res2.statusText} (${text2})`)
                }
            } else {
                const txt = typeof res.text === 'function' ? await res.text().catch(() => '') : (typeof res.json === 'function' ? JSON.stringify(await res.json().catch(() => ({}))) : '')
                throw new Error(`JWKS fetch failed: ${res.status} ${res.statusText} (${txt})`)
            }
        }
    } catch (err: any) {
        // Propagate meaningful message
        throw new Error(err?.message ?? String(err))
    }

    const jwks = createRemoteJWKSet(new URL(_jwksUrl))

    const { payload } = await jwtVerify(token, jwks, {
        issuer: _issuer,
        audience: _audience,
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
    return typeof appRole === 'string' && appRole.length > 0 ? appRole : undefined
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
    if (emailToTry) return prisma.profile.findUnique({ where: { email: emailToTry } })
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
        return { role: tokenRole, isAdmin: tokenRole === 'admin', localUserId: payload?.sub }
    }

    const profile = await findLocalProfileBySub(
        payload?.sub ? String(payload.sub) : '',
        typeof payload?.email === 'string' ? payload.email : undefined
    )
    if (profile) {
        return { role: profile.isAdmin ? 'admin' : 'user', isAdmin: Boolean(profile.isAdmin), localUserId: profile.id }
    }

    // No app role and no local profile: preserve the token's (Postgres) role
    // claim so non-admin authenticated users still pass non-admin guards.
    return { role: typeof payload?.role === 'string' ? payload.role : 'user', isAdmin: false }
}

/** Resolve authz for a request and mutate `req.user` in place. */
async function resolveUserAuthz(req: any, payload: any) {
    const { role, isAdmin, localUserId } = await resolveAppRole(payload)
    req.user.role = role
    req.user.isAdmin = isAdmin
    if (localUserId !== undefined) req.user.localUserId = localUserId
}

function parseCookies(header?: string) {
    if (!header) return {}
    return Object.fromEntries(
        header
            .split(';')
            .map((c) => c.trim())
            .filter(Boolean)
            .map((s) => {
                const i = s.indexOf('=')
                return [s.slice(0, i), s.slice(i + 1)]
            })
    )
}

export async function jwtMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const auth = req.headers.authorization
        const serviceRoleKey = config.auth.supabaseServiceRoleKey

        if (auth) {
            // If Authorization header exists it must be a Bearer token
            if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })

            if (serviceRoleKey && auth === `Bearer ${serviceRoleKey}`) {
                // Mark the request as coming from a service role. Authorization checks (header + IP allowlist)
                // are enforced in the `requireAdmin` middleware which will reject with 403 if the request
                // is not allowed. We avoid writing audit logs here to centralize auditing/metrics in one place.
                (<any>req).user = { sub: 'service', role: 'admin', service: true }
                return next()
            }

            const token = auth.slice('Bearer '.length)
            const payload = await verifySupabaseJwt(token);

            // attach a minimal user object (from token)
            (<any>req).user = Object.assign({ sub: payload.sub }, payload);

            // Resolve application role (token claim preferred, local Profile fallback)
            try {
                await resolveUserAuthz(req as any, payload)
            } catch (err) {
                console.debug('jwtMiddleware: failed to resolve authz for token sub', err)
            }

            return next()
        }

        // No Authorization header: try session cookie
        const cookies = parseCookies(req.headers.cookie)
        const sessionToken = (cookies as any).session
        if (sessionToken) {
            const payload = await verifySessionToken(sessionToken)
                ; (req as any).user = Object.assign({ sub: payload.sub ?? payload.userId }, payload)

            try {
                await resolveUserAuthz(req as any, (req as any).user)
            } catch (err) {
                console.debug('jwtMiddleware: failed to resolve authz for session payload', err)
            }

            return next()
        }

        return res.status(401).json({ error: 'Missing token' })
    } catch (err: any) {
        console.warn('JWT validation failed', err?.message ?? err)
        return res.status(401).json({ error: 'Unauthorized' })
    }
}
