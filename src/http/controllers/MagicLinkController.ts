import { Controller, Route, Tags, Post, Get, Body, Query, Request, SuccessResponse, Response } from 'tsoa'
import type { Request as ExpressRequest } from 'express'
import { generateMagicLinkToken, verifyMagicLinkToken } from '../../auth/magic-link.js'
import { sendMagicLinkEmail } from '../../email.js'
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

function rateLimitIp(req: ExpressRequest): boolean {
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

function setSessionCookie(res: any, payload: Record<string, any>) {
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

export interface SendMagicLinkRequest { email: string }

@Route('api/auth/magic-link')
@Tags('Auth')
export class MagicLinkController extends Controller {

    /** Send a magic link email (returns 202 accepted) */
    @Post()
    @SuccessResponse('202', 'Accepted')
    @Response('400', 'Invalid request')
    @Response('429', 'Rate limited')
    public async send(@Body() body: SendMagicLinkRequest, @Request() request?: ExpressRequest): Promise<{ status: 'accepted' }> {
        if (!body || !body.email) throw new Error('Invalid request')
        try {
            if (rateLimitIp(request!)) { (request as any).res.status(429).json({ error: 'rate limit exceeded' }); return { status: 'accepted' } as any }
            const email = body.email.toLowerCase()
            if (rateLimitEmail(email)) { (request as any).res.status(429).json({ error: 'rate limit exceeded' }); return { status: 'accepted' } as any }

            try {
                const { token } = await generateMagicLinkToken(email)
                await sendMagicLinkEmail(email, token)
                magicLinkSent.inc()
                console.info('magic_link.sent', { email })
            } catch (err: any) {
                const msg = err?.message ?? String(err)
                console.error('magic link send failed', msg)
                magicLinkFailed.inc()
            }

            this.setStatus(202)
            return { status: 'accepted' }
        } catch (err: any) {
            if (this.getStatus() === 429) throw new Error('rate limited')
            console.error('magic-link send error', err)
            this.setStatus(400)
            throw new Error('Invalid request')
        }
    }

    /** Verify a magic link token (GET redirect style) */
    @Get('verify')
    @Response('400', 'token required')
    @Response('410', 'expired')
    @Response('404', 'invalid')
    public async verifyGet(@Query() token: string, @Request() request?: ExpressRequest): Promise<void> {
        if (!token) { this.setStatus(400); throw new Error('token required') }
        try {
            const info = await verifyMagicLinkToken(token)
            const res = (request as any).res
            await setSessionCookie(res, { sub: info.email, userId: info.userId })
            magicLinkVerified.inc()
            console.info('magic_link.verified', { email: info.email })
            const redirect = process.env.MAGIC_LINK_SUCCESS_URL ?? (process.env.MAGIC_LINK_FRONTEND_URL ?? '/')
            try {
                res.redirect(String(redirect))
                console.error('after redirect headersSent=', res.headersSent, 'statusCode=', res.statusCode)
                return
            } catch (err) {
                console.error('redirect failed', err)
                this.setStatus(500)
                throw new Error('redirect failed')
            }
        } catch (err: any) {
            if (err.message === 'expired token') { this.setStatus(410); throw new Error('expired token') }
            if (err.message === 'replayed token') { magicLinkReplayed.inc(); this.setStatus(410); throw new Error('replayed token') }
            this.setStatus(404)
            throw new Error('invalid token')
        }
    }

    /** Verify a magic link token (POST JSON style) */
    @Post('verify')
    @Response('400', 'token required')
    @Response('410', 'expired')
    @Response('404', 'invalid')
    public async verifyPost(@Body() body: { token?: string }, @Request() request?: ExpressRequest): Promise<{ status: 'ok' }> {
        const token = String(body?.token || '')
        if (!token) { this.setStatus(400); throw new Error('token required') }
        try {
            const info = await verifyMagicLinkToken(token)
            await setSessionCookie((request as any).res, { sub: info.email, userId: info.userId })
            magicLinkVerified.inc()
            console.info('magic_link.verified', { email: info.email })
            return { status: 'ok' }
        } catch (err: any) {
            if (err.message === 'expired token') { this.setStatus(410); throw new Error('expired token') }
            if (err.message === 'replayed token') { magicLinkReplayed.inc(); this.setStatus(410); throw new Error('replayed token') }
            this.setStatus(404)
            throw new Error('invalid token')
        }
    }
}

// Test helper: clear internal rate limit maps
export function _testResetRateLimits() {
    ipRateMap.clear()
    emailRateMap.clear()
}
