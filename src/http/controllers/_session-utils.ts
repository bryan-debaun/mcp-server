import { config } from '../../config.js'
import { logger } from "../../logger.js";

export function setSessionCookie(res: any, payload: Record<string, any>) {
    const secret = config.auth.sessionJwtSecret
    const maxAge = config.auth.sessionCookieMaxAgeSec
    if (!secret) {
        logger.warn('SESSION_JWT_SECRET not set; session cookie will not be signed')
        const token = Buffer.from(JSON.stringify(payload)).toString('base64')
        res.cookie('session', token, { httpOnly: true, secure: config.isProduction, sameSite: 'lax', maxAge })
        return
    }
    const encoder = new TextEncoder().encode(secret)
    return import('jose').then(({ SignJWT }) =>
        new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${maxAge}s`).sign(encoder as any)
    ).then((token: string) => {
        res.cookie('session', token, { httpOnly: true, secure: config.isProduction, sameSite: 'lax', maxAge })
    }).catch((err: any) => {
        logger.error('failed to sign session token', err)
    })
}
