import { Request, Response, NextFunction } from 'express'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { verifySessionToken } from './session.js'
import { prisma } from '../db/index.js'

const jwksUrl = process.env.SUPABASE_JWKS_URL

if (!jwksUrl) {
    console.warn('SUPABASE_JWKS_URL not set; JWT middleware will not validate tokens')
}


export async function verifySupabaseJwt(token: string): Promise<JWTPayload> {
    let _jwksUrl = process.env.SUPABASE_JWKS_URL ?? (process.env.PUBLIC_SUPABASE_URL ? `${String(process.env.PUBLIC_SUPABASE_URL).replace(/\/$/, '')}/.well-known/jwks.json` : undefined)
    const _issuer = process.env.SUPABASE_ISS ?? process.env.PUBLIC_SUPABASE_URL
    const _audience = process.env.SUPABASE_AUD

    if (!_jwksUrl) throw new Error('JWKS URL not configured')
    if (!_issuer || !_audience) throw new Error('SUPABASE_ISS and SUPABASE_AUD must be set')

    // Attempt to fetch the JWKS URL to validate it's reachable and returns 200 OK.
    try {
        const res = await fetch(_jwksUrl, { method: 'GET' })
        if (!res.ok) {
            // Try fallback using publishable key (PUBLIC_SUPABASE_PUBLISHABLE_KEY) or legacy SUPABASE_ANON_KEY
            const publishable = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
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

export async function jwtMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const auth = req.headers.authorization
        const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

        if (auth) {
            // If Authorization header exists it must be a Bearer token
            if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })

            if (serviceRoleKey && auth === `Bearer ${serviceRoleKey}`) {
                // Mark the request as coming from a service role. Authorization checks (header + IP allowlist)
                // are enforced in the `requireAdmin` middleware which will reject with 403 if the request
                // is not allowed. We avoid writing audit logs here to centralize auditing/metrics in one place.
                (req as any).user = { sub: 'service', role: 'admin', service: true }
                return next()
            }

            const token = auth.slice('Bearer '.length)
            const payload = await verifySupabaseJwt(token)

                // attach a minimal user object (from token)
                ; (req as any).user = { sub: payload.sub, ...payload }

            // If the token represents a Supabase user (sub is UUID or email), try to attach local role/isAdmin
            try {
                if (payload.sub) {
                    const sub = String(payload.sub)
                    console.debug('jwtMiddleware: payload.sub=', sub)
                    let localProfile: any = null
                    if (/^[0-9a-fA-F-]{36}$/.test(sub)) {
                        localProfile = await prisma.profile.findUnique({ where: { external_id: sub } as any, include: { role: true } })
                    } else if (sub.includes('@')) {
                        localProfile = await prisma.profile.findUnique({ where: { email: sub } as any, include: { role: true } })
                    }
                    console.debug('jwtMiddleware: localProfile=', localProfile)
                    if (localProfile) {
                        ; (req as any).user.role = localProfile.role?.name ?? (localProfile.isAdmin ? 'admin' : 'user')
                            ; (req as any).user.isAdmin = Boolean(localProfile.isAdmin)
                            ; (req as any).user.localUserId = localProfile.id
                            ; (req as any).user.external_id = localProfile.external_id
                    }
                }
            } catch (err) {
                console.debug('jwtMiddleware: failed to lookup local user for token sub', err)
            }

            return next()
        }

        // No Authorization header: try session cookie
        const cookieHeader = req.headers.cookie
        if (cookieHeader) {
            const cookies = Object.fromEntries(
                cookieHeader
                    .split(';')
                    .map((c) => c.trim())
                    .filter(Boolean)
                    .map((s) => {
                        const i = s.indexOf('=')
                        return [s.slice(0, i), s.slice(i + 1)] as [string, string]
                    })
            )
            const sessionToken = (cookies as any).session
            if (sessionToken) {
                const payload = await verifySessionToken(sessionToken)
                    ; (req as any).user = { sub: payload.sub ?? payload.userId, ...payload }
                return next()
            }
        }

        return res.status(401).json({ error: 'Missing token' })
    } catch (err: any) {
        console.warn('JWT validation failed', err?.message ?? err)
        return res.status(401).json({ error: 'Unauthorized' })
    }
}
