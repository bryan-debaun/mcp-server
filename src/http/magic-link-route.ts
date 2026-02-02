import { Application, Request, Response } from 'express'
import { z } from 'zod'
import { generateMagicLinkToken, verifyMagicLinkToken } from '../auth/magic-link.js'
import { sendMagicLinkEmail } from '../email.js'
import { Counter } from 'prom-client'

const magicLinkSent = new Counter({ name: 'magic_link_sent_total', help: 'Total magic link emails sent' })
const magicLinkFailed = new Counter({ name: 'magic_link_failed_total', help: 'Total magic link send failures' })
const magicLinkVerified = new Counter({ name: 'magic_link_verified_total', help: 'Total magic link verifications' })
const magicLinkReplayed = new Counter({ name: 'magic_link_replayed_total', help: 'Total magic link replay attempts' })

// Rate limiting maps
const ipRateMap: Map<string, { count: number; reset: number }> = new Map()
const emailRateMap: Map<string, { count: number; reset: number }> = new Map()
const EMAIL_LIMIT = Number(process.env.MAGIC_LINK_PER_EMAIL_LIMIT ?? 5)
const WINDOW_MS = 60 * 60 * 1000 // 1 hour

function rateLimitIp(req: Request): boolean {
    const ip = req.ip || 'unknown'
    const now = Date.now()
    const entry = ipRateMap.get(ip)
    if (!entry || entry.reset < now) {
        ipRateMap.set(ip, { count: 1, reset: now + WINDOW_MS })
        return false
    }
    if (entry.count >= EMAIL_LIMIT) return true
    entry.count += 1
    ipRateMap.set(ip, entry)
    return false
}

function rateLimitEmail(email: string): boolean {
    const now = Date.now()
    const entry = emailRateMap.get(email)
    if (!entry || entry.reset < now) {
        emailRateMap.set(email, { count: 1, reset: now + WINDOW_MS })
        return false
    }
    if (entry.count >= EMAIL_LIMIT) return true
    entry.count += 1
    emailRateMap.set(email, entry)
    return false
}

function setSessionCookie(res: Response, payload: Record<string, any>) {
    const secret = process.env.SESSION_JWT_SECRET
    const maxAge = Number(process.env.SESSION_COOKIE_MAX_AGE_SEC ?? 60 * 60 * 24 * 7) // 7 days
    if (!secret) {
        console.warn('SESSION_JWT_SECRET not set; session cookie will not be signed')
        // Create a naive unsigned cookie as fallback for local dev (not recommended)
        const token = Buffer.from(JSON.stringify(payload)).toString('base64')
        res.cookie('session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge })
        return
    }
    // Sign a JWT with HS256
    const encoder = new TextEncoder().encode(secret)
    // Use jose SignJWT dynamically to avoid top-level import cost in some test environments
    return import('jose').then(({ SignJWT }) =>
        new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${maxAge}s`).sign(encoder as any)
    ).then((token: string) => {
        res.cookie('session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge })
    }).catch((err: any) => {
        console.error('failed to sign session token', err)
    })
}

export function registerMagicLinkRoutes(app: Application) {
    const base = '/api/auth/magic-link'

    app.post(base, async (req: Request, res: Response) => {
        try {
            if (rateLimitIp(req)) return res.status(429).json({ error: 'rate limit exceeded' })
            const schema = z.object({ email: z.string().email() })
            const parsed = schema.safeParse(req.body)
            if (!parsed.success) return res.status(400).json({ error: 'invalid body' })
            const email = parsed.data.email.toLowerCase()
            if (rateLimitEmail(email)) return res.status(429).json({ error: 'rate limit exceeded' })

            // Generate token and send email. Do not reveal whether a user exists.
            try {
                const { token } = await generateMagicLinkToken(email)
                await sendMagicLinkEmail(email, token)
                magicLinkSent.inc()
                console.info('magic_link.sent', { email })
            } catch (err) {
                const msg = (err as any)?.message ?? String(err)
                console.error('magic link send failed', msg)
                // Record metric failure
                magicLinkFailed.inc()
                console.info('magic_link.failed', { email })
                // Still return 202 to avoid revealing details
            }

            return res.status(202).json({ status: 'accepted' })
        } catch (err) {
            console.error('magic-link POST error', err)
            return res.status(500).json({ error: 'internal error' })
        }
    })

    app.get(`${base}/verify`, async (req: Request, res: Response) => {
        const token = String(req.query.token || '')
        if (!token) return res.status(400).json({ error: 'token required' })
        try {
            const info = await verifyMagicLinkToken(token)
            // Issue session cookie and redirect to success URL
            await setSessionCookie(res, { sub: info.email, userId: info.userId })
            magicLinkVerified.inc()
            console.info('magic_link.verified', { email: info.email })
            const redirect = process.env.MAGIC_LINK_SUCCESS_URL ?? (process.env.MAGIC_LINK_FRONTEND_URL ?? '/')
            return res.redirect(String(redirect))
        } catch (err: any) {
            if (err.message === 'expired token') return res.status(410).json({ error: 'expired token' })
            if (err.message === 'replayed token') { magicLinkReplayed.inc(); return res.status(410).json({ error: 'replayed token' }) }
            return res.status(404).json({ error: 'invalid token' })
        }
    })

    app.post(`${base}/verify`, async (req: Request, res: Response) => {
        const token = String(req.body.token || '')
        if (!token) return res.status(400).json({ error: 'token required' })
        try {
            const info = await verifyMagicLinkToken(token)
            await setSessionCookie(res, { sub: info.email, userId: info.userId })
            magicLinkVerified.inc()
            console.info('magic_link.verified', { email: info.email })
            return res.status(200).json({ status: 'ok' })
        } catch (err: any) {
            if (err.message === 'expired token') return res.status(410).json({ error: 'expired token' })
            if (err.message === 'replayed token') { magicLinkReplayed.inc(); return res.status(410).json({ error: 'replayed token' }) }
            return res.status(404).json({ error: 'invalid token' })
        }
    })
}

// Test helper: clear internal rate limit maps
export function _testResetRateLimits() {
    ipRateMap.clear()
    emailRateMap.clear()
}
