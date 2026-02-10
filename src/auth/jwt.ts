import { Request, Response, NextFunction } from 'express'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { verifySessionToken } from './session'

const jwksUrl = process.env.SUPABASE_JWKS_URL

if (!jwksUrl) {
    console.warn('SUPABASE_JWKS_URL not set; JWT middleware will not validate tokens')
}


export async function verifySupabaseJwt(token: string): Promise<JWTPayload> {
    let _jwksUrl = process.env.SUPABASE_JWKS_URL
    const _issuer = process.env.SUPABASE_ISS
    const _audience = process.env.SUPABASE_AUD

    if (!_jwksUrl) throw new Error('JWKS URL not configured')
    if (!_issuer || !_audience) throw new Error('SUPABASE_ISS and SUPABASE_AUD must be set')

    // Attempt to fetch the JWKS URL to validate it's reachable and returns 200 OK.
    try {
        const res = await fetch(_jwksUrl, { method: 'GET' })
        if (!res.ok) {
            // Try fallback using SUPABASE_ANON_KEY against the /auth/v1/keys endpoint if available
            const anon = process.env.SUPABASE_ANON_KEY
            if (anon) {
                const fallback = `${_issuer.replace(/\/$/, '')}/auth/v1/keys?apikey=${anon}`
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
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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
                // attach a minimal user object
                ; (req as any).user = { sub: payload.sub, ...payload }
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
