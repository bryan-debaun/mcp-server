import { Request, Response, NextFunction } from 'express'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

const jwksUrl = process.env.SUPABASE_JWKS_URL

if (!jwksUrl) {
    console.warn('SUPABASE_JWKS_URL not set; JWT middleware will not validate tokens')
}

export async function verifySupabaseJwt(token: string): Promise<JWTPayload> {
    const _jwksUrl = process.env.SUPABASE_JWKS_URL
    const _issuer = process.env.SUPABASE_ISS
    const _audience = process.env.SUPABASE_AUD

    if (!_jwksUrl) throw new Error('JWKS URL not configured')
    if (!_issuer || !_audience) throw new Error('SUPABASE_ISS and SUPABASE_AUD must be set')

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
