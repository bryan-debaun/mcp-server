import { Application, Request, Response } from 'express'
import { z } from 'zod'

// Simple IP-based rate limiter for invite acceptance to help prevent brute force
const rateMap: Map<string, { count: number; reset: number }> = new Map()
const LIMIT = 10
const WINDOW_MS = 60 * 60 * 1000 // 1 hour

export function registerInviteRoutes(app: Application) {
    const base = '/api/invites'

    function rateLimit(req: Request, _res: Response): boolean {
        const ip = req.ip || 'unknown'
        const now = Date.now()
        const entry = rateMap.get(ip)
        if (!entry || entry.reset < now) {
            rateMap.set(ip, { count: 1, reset: now + WINDOW_MS })
            return false
        }
        if (entry.count >= LIMIT) return true
        entry.count += 1
        rateMap.set(ip, entry)
        return false
    }

    app.post(`${base}/accept`, async (req: Request, res: Response) => {
        if (rateLimit(req, res)) return res.status(429).json({ error: 'rate limit exceeded' })

        const schema = z.object({ token: z.string(), name: z.string().optional(), password: z.string().optional() })
        const parsed = schema.safeParse(req.body)
        if (!parsed.success) return res.status(400).json({ error: 'invalid body' })

        try {
            const { callTool } = await import('../tools/local.js')
            const user = await callTool('db/accept-invite', { token: parsed.data.token, name: parsed.data.name, password: parsed.data.password })
            return res.status(201).json({ user })
        } catch (err: any) {
            if (err.message === 'invalid token') return res.status(404).json({ error: 'invalid token' })
            if (err.message === 'already accepted') return res.status(400).json({ error: 'already accepted' })
            if (err.message === 'expired token') return res.status(400).json({ error: 'expired token' })
            if (err.message === 'user already exists') return res.status(400).json({ error: 'user already exists' })
            if (err.message === 'supabase provisioning failed') return res.status(502).json({ error: 'provisioning failed' })
            console.error('accept invite error', err)
            return res.status(500).json({ error: 'internal error' })
        }
    })

    // Support GET flow for token-only acceptance (e.g., magic link redirects)
    app.get(`${base}/accept`, async (req: Request, res: Response) => {
        if (rateLimit(req, res)) return res.status(429).json({ error: 'rate limit exceeded' })
        const token = String(req.query.token || '')
        if (!token) return res.status(400).json({ error: 'token is required' })
        try {
            const { callTool } = await import('../tools/local.js')
            const user = await callTool('db/accept-invite', { token })
            return res.status(200).json({ user })
        } catch (err: any) {
            if (err.message === 'invalid token') return res.status(404).json({ error: 'invalid token' })
            if (err.message === 'already accepted') return res.status(400).json({ error: 'already accepted' })
            if (err.message === 'expired token') return res.status(400).json({ error: 'expired token' })
            if (err.message === 'user already exists') return res.status(400).json({ error: 'user already exists' })
            if (err.message === 'supabase provisioning failed') return res.status(502).json({ error: 'provisioning failed' })
            console.error('accept invite error', err)
            return res.status(500).json({ error: 'internal error' })
        }
    })
}
