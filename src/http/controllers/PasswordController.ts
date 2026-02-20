import { Controller, Route, Tags, Post, Body, Request, Response } from 'tsoa'
import type { Request as ExpressRequest } from 'express'
import { Counter } from 'prom-client'
import { setSessionCookie } from './_session-utils.js'

const passwordResetSent = new Counter({ name: 'password_reset_sent_total', help: 'Total password reset requests' })
const passwordLoginAttempts = new Counter({ name: 'password_login_attempts_total', help: 'Total password login attempts' })
const passwordLoginFailed = new Counter({ name: 'password_login_failed_total', help: 'Total password login failures' })

@Route('api/auth/password')
@Tags('Auth')
export class PasswordController extends Controller {
    /** Request a password reset (Supabase-backed) */
    @Post('reset-request')
    @Response('400', 'Invalid request')
    @Response('502', 'Supabase request failed')
    public async passwordResetRequest(@Body() body: { email?: string }, @Request() request?: ExpressRequest): Promise<{ status: 'ok' }> {
        const res = (request as any).res
        const email = String(body?.email || '').toLowerCase()
        if (!email) { res.status(400).json({ error: 'email required' }); return undefined as any }

        // Note: per-IP rate limiting is handled elsewhere (MagicLinkController).
        // Left here as a placeholder for future enhancement.

        const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_ISS
        const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
        if (!supabaseUrl || !supabaseKey) { res.status(400).json({ error: 'password not supported' }); return undefined as any }

        try {
            const r = await fetch(`${String(supabaseUrl).replace(/\/$/, '')}/auth/v1/recover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
                body: JSON.stringify({ email })
            })
            if (!r.ok) {
                const txt = await r.text().catch(() => '')
                console.error('supabase recover failed', r.status, txt)
                res.status(502).json({ error: 'supabase request failed' })
                return undefined as any
            }

            passwordResetSent.inc()
            return { status: 'ok' }
        } catch (err: any) {
            console.error('password reset request failed', err)
            res.status(502).json({ error: 'supabase request failed' })
            return undefined as any
        }
    }

    /** Server-side credential login (email + password, Supabase-backed) */
    @Post('login')
    @Response('400', 'Invalid request')
    @Response('401', 'Invalid credentials')
    public async passwordLogin(@Body() body: { email?: string; password?: string }, @Request() request?: ExpressRequest): Promise<{ status: 'ok' }> {
        const res = (request as any).res
        const email = String(body?.email || '').toLowerCase()
        const password = String(body?.password || '')
        if (!email || !password) { res.status(400).json({ error: 'email and password required' }); return undefined as any }

        const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_ISS
        const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
        if (!supabaseUrl || !supabaseKey) { res.status(400).json({ error: 'password not supported' }); return undefined as any }

        passwordLoginAttempts.inc()
        try {
            const r = await fetch(`${String(supabaseUrl).replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
                body: JSON.stringify({ email, password })
            })
            const bodyJson: any = await r.json().catch(() => ({}))
            if (!r.ok || !bodyJson?.access_token) {
                passwordLoginFailed.inc()
                res.status(401).json({ error: 'invalid credentials' })
                return undefined as any
            }

            // Set same session cookie shape used by magic-link verification
            await setSessionCookie(res, { sub: email })
            return { status: 'ok' }
        } catch (err: any) {
            console.error('password login failed', err)
            passwordLoginFailed.inc()
            res.status(401).json({ error: 'invalid credentials' })
            return undefined as any
        }
    }
}
