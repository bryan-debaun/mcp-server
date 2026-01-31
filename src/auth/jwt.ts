import { Request, Response, NextFunction } from 'express'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { prisma } from '../db/index.js'

const jwksUrl = process.env.SUPABASE_JWKS_URL

if (!jwksUrl) {
    console.warn('SUPABASE_JWKS_URL not set; JWT middleware will not validate tokens')
}

function getRequestIp(req: Request): string {
    const xff = (req.headers['x-forwarded-for'] || '') as string
    if (xff) return xff.split(',')[0].trim()
    return req.ip || 'unknown'
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
        if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })

        // Allow service role key to bypass JWT signature verification for server-to-server calls.
        // Hardening: require either an internal header key OR the request IP to be in ADMIN_IP_ALLOWLIST.
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const internalKey = process.env.INTERNAL_ADMIN_KEY
        const allowlist = (process.env.ADMIN_IP_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean)

        if (serviceRoleKey && auth === `Bearer ${serviceRoleKey}`) {
            const clientIp = getRequestIp(req)
            const headerOk = internalKey ? req.headers['x-internal-key'] === internalKey : false
            const ipOk = allowlist.length > 0 ? allowlist.includes(clientIp) : false

            if (!headerOk && !ipOk) {
                console.warn('Service role key used from disallowed source', { ip: clientIp })
                return res.status(401).json({ error: 'Unauthorized' })
            }

            // Audit the service key usage
            try {
                await prisma.auditLog.create({ data: { action: 'service-role-bypass', metadata: { ip: clientIp, path: req.path, method: req.method } } })
            } catch (e) {
                console.error('failed to write audit log for service-role-bypass', e)
            }

            (req as any).user = { sub: 'service', role: 'admin', service: true }
            return next()
        }

        const token = auth.slice('Bearer '.length)
        const payload = await verifySupabaseJwt(token)
            // attach a minimal user object
            ; (req as any).user = { sub: payload.sub, ...payload }
        return next()
    } catch (err: any) {
        console.warn('JWT validation failed', err?.message ?? err)
        return res.status(401).json({ error: 'Unauthorized' })
    }
}
