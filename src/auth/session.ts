import { jwtVerify } from 'jose'
import { config } from '../config.js'

export interface SessionPayload {
    sub?: string
    userId?: number
    // allow arbitrary additional claims
    [key: string]: any
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
    const secret = config.auth.sessionJwtSecret
    if (!token) throw new Error('missing token')

    if (!secret) {
        // Development mode: token is base64(JSON)
        try {
            const buf = Buffer.from(token, 'base64')
            const s = buf.toString('utf8')
            return JSON.parse(s) as SessionPayload
        } catch (err) {
            throw new Error('invalid token')
        }
    }

    try {
        const encoder = new TextEncoder().encode(secret)
        const { payload } = await jwtVerify(token, encoder as any)
        // jose returns payload values as strings/numbers; normalize
        return payload as unknown as SessionPayload
    } catch (err: any) {
        throw new Error('invalid token: ' + (err?.message || String(err)))
    }
}
