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

import { setSessionCookie } from './_session-utils.js'

export interface SendMagicLinkRequest { email: string }
export interface RegisterRequest { email: string; name?: string; password?: string }

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

                // Compute environment-aware base for magic link URL
                // Priority: explicit env override -> X-Forwarded headers -> request host/protocol -> fallback
                const envBase = process.env.MAGIC_LINK_BASE_URL
                let requestBase: string | undefined
                try {
                    const xfProto = (request as any)?.headers?.['x-forwarded-proto']
                    const xfHost = (request as any)?.headers?.['x-forwarded-host']
                    if (envBase) {
                        requestBase = envBase
                    } else if (xfProto && (xfHost || (request as any)?.headers?.host)) {
                        requestBase = `${String(xfProto)}://${String(xfHost ?? (request as any).headers.host)}`
                    } else if ((request as any)?.protocol && (request as any).get) {
                        requestBase = `${(request as any).protocol}://${(request as any).get('host')}`
                    }
                } catch (e) { /* ignore */ }

                const base = requestBase ?? process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:3000'

                await sendMagicLinkEmail(email, token, base)
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

    /** Public registration endpoint */

    @Post('register')
    @Response('400', 'Invalid request')
    @Response('502', 'Supabase provisioning failed')
    public async register(@Body() body: RegisterRequest, @Request() request?: ExpressRequest): Promise<any> {
        if (!body || !body.email) { this.setStatus(400); throw new Error('Invalid request') }
        try {
            const email = String(body.email).toLowerCase()
            const name = body.name
            const password = body.password

            const { registerUser } = await import('../../services/admin-service.js')
            let user: any
            try {
                user = await registerUser(email, name, password)
            } catch (err: any) {
                if (err.message === 'user already exists' || err.message === 'password not supported' || err.message === 'SUPABASE_ISS missing' || err.message === 'PUBLIC_SUPABASE_URL or SUPABASE_ISS missing') {
                    try { (request as any).res.status(400).json({ error: err.message }) } catch (e) { /* noop */ }
                    return
                }
                if (err.message === 'supabase provisioning failed') {
                    try { (request as any).res.status(502).json({ error: 'supabase provisioning failed' }) } catch (e) { /* noop */ }
                    return
                }
                throw err
            }

            // If password not provided, send magic link to allow immediate sign-in
            if (!password) {
                try {
                    const { token } = await generateMagicLinkToken(email, user.id)

                    // Compute base similar to send()
                    const envBase = process.env.MAGIC_LINK_BASE_URL
                    let requestBase: string | undefined
                    try {
                        const xfProto = (request as any)?.headers?.['x-forwarded-proto']
                        const xfHost = (request as any)?.headers?.['x-forwarded-host']
                        if (envBase) {
                            requestBase = envBase
                        } else if (xfProto && (xfHost || (request as any)?.headers?.host)) {
                            requestBase = `${String(xfProto)}://${String(xfHost ?? (request as any).headers.host)}`
                        } else if ((request as any)?.protocol && (request as any).get) {
                            requestBase = `${(request as any).protocol}://${(request as any).get('host')}`
                        }
                    } catch (e) { /* ignore */ }

                    const base = requestBase ?? process.env.MAGIC_LINK_BASE_URL ?? 'http://localhost:3000'
                    await sendMagicLinkEmail(email, token, base)
                } catch (err: any) {
                    console.error('failed to send magic link after register', err)
                }
            }

            this.setStatus(201)
            return user
        } catch (err: any) {
            if (this.getStatus() === 400 || this.getStatus() === 502) throw err
            console.error('register error', err)
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
        const res = (request as any).res
        if (!token) { res.status(400).json({ error: 'token required' }); return }
        try {
            const info = await verifyMagicLinkToken(token)
            await setSessionCookie(res, { sub: info.email, userId: info.userId })
            magicLinkVerified.inc()
            console.info('magic_link.verified', { email: info.email })
            const redirect = process.env.MAGIC_LINK_SUCCESS_URL ?? (process.env.MAGIC_LINK_FRONTEND_URL ?? '/')
            try {
                res.redirect(String(redirect))
                return
            } catch (err) {
                console.error('redirect failed', err)
                res.status(500).json({ error: 'redirect failed' })
                return
            }
        } catch (err: any) {
            if (err.message === 'expired token') { res.status(410).json({ error: 'expired token' }); return }
            if (err.message === 'replayed token') { magicLinkReplayed.inc(); res.status(410).json({ error: 'replayed token' }); return }
            res.status(404).json({ error: 'invalid token' }); return
        }
    }

    /** Verify a magic link token (POST JSON style) */
    @Post('verify')
    @Response('400', 'token required')
    @Response('410', 'expired')
    @Response('404', 'invalid')
    public async verifyPost(@Body() body: { token?: string }, @Request() request?: ExpressRequest): Promise<{ status: 'ok' }> {
        const token = String(body?.token || '')
        const res = (request as any).res
        if (!token) { res.status(400).json({ error: 'token required' }); return undefined as any }
        try {
            const info = await verifyMagicLinkToken(token)
            await setSessionCookie((request as any).res, { sub: info.email, userId: info.userId })
            magicLinkVerified.inc()
            console.info('magic_link.verified', { email: info.email })
            return { status: 'ok' }
        } catch (err: any) {
            if (err.message === 'expired token') { res.status(410).json({ error: 'expired token' }); return undefined as any }
            if (err.message === 'replayed token') { magicLinkReplayed.inc(); res.status(410).json({ error: 'replayed token' }); return undefined as any }
            res.status(404).json({ error: 'invalid token' }); return undefined as any
        }
    }

}

// Test helper: clear internal rate limit maps
export function _testResetRateLimits() {
    ipRateMap.clear()
    emailRateMap.clear()
}
