export function setSessionCookie(res: any, payload: Record<string, any>) {
    const secret = process.env.SESSION_JWT_SECRET
    const maxAge = Number(process.env.SESSION_COOKIE_MAX_AGE_SEC ?? 60 * 60 * 24 * 7) // 7 days
    if (!secret) {
        console.warn('SESSION_JWT_SECRET not set; session cookie will not be signed')
        const token = Buffer.from(JSON.stringify(payload)).toString('base64')
        res.cookie('session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge })
        return
    }
    const encoder = new TextEncoder().encode(secret)
    return import('jose').then(({ SignJWT }) =>
        new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${maxAge}s`).sign(encoder as any)
    ).then((token: string) => {
        res.cookie('session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge })
    }).catch((err: any) => {
        console.error('failed to sign session token', err)
    })
}
