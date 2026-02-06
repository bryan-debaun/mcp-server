import { Controller, Route, Tags, Get, Request, Response } from 'tsoa'
import type { Request as ExpressRequest } from 'express'
import { verifySessionToken } from '../../auth/session.js'
import { prisma } from '../../db/index.js'
import { Counter } from 'prom-client'

const sessionRequestsTotal = new Counter({ name: 'session_requests_total', help: 'Total session endpoint requests' })
const sessionRateLimitedTotal = new Counter({ name: 'session_rate_limited_total', help: 'Total session endpoint rate limited' })

// Simple per-IP rate limiting
const ipRateMap: Map<string, { count: number; reset: number }> = new Map()
function rateLimitIp(req: ExpressRequest): boolean {
    // Read limits dynamically so tests can override env vars at runtime
    const limit = Number(process.env.SESSION_RATE_LIMIT_PER_IP ?? 60)
    const windowMs = Number(process.env.SESSION_RATE_LIMIT_WINDOW_MS ?? 60 * 1000)

    // Normalize IP so IPv4-mapped IPv6 addresses match the IPv4 representation
    const rawIp = req.ip || 'unknown'
    const ip = String(rawIp).replace(/^.*:/, '')
    const now = Date.now()
    const entry = ipRateMap.get(ip)
    if (!entry || entry.reset < now) {
        ipRateMap.set(ip, { count: 1, reset: now + windowMs })
        return false
    }
    if (entry.count >= limit) return true
    entry.count += 1
    ipRateMap.set(ip, entry)
    return false
}

@Route('api/auth/session')
@Tags('Auth')
export class SessionController extends Controller {
    /** Returns current user session (based on `session` cookie). */
    @Get()
    @Response('401', 'Unauthorized')
    @Response('429', 'Rate limited')
    public async get(@Request() req?: ExpressRequest): Promise<any> {
        sessionRequestsTotal.inc()

        const request = req as ExpressRequest
        if (rateLimitIp(request)) {
            sessionRateLimitedTotal.inc();
            (request as any).res.status(429).json({ error: 'rate limit exceeded' })
            this.setStatus(429)
            return
        }

        const cookieHeader = String(request.headers.cookie || '')
        const match = cookieHeader.match(/(?:^|; )session=([^;]+)/)
        const token = match ? match[1] : undefined
        if (!token) { (request as any).res.status(401).json({ error: 'missing session' }); this.setStatus(401); return }

        let payload
        try {
            payload = await verifySessionToken(token)
        } catch (err: any) {
            (request as any).res.status(401).json({ error: 'invalid session' })
            this.setStatus(401)
            return
        }

        // Identify user: prefer numeric userId, then external_id (UUID-like), then email (sub)
        let user: any = null
        try {
            if (payload.userId) {
                user = await prisma.user.findUnique({ where: { id: Number(payload.userId) } as any, include: { role: true } })
            }
            if (!user && payload.sub && /^[0-9a-fA-F-]{36}$/.test(String(payload.sub))) {
                user = await prisma.user.findUnique({ where: { external_id: String(payload.sub) } as any, include: { role: true } })
            }
            if (!user && payload.sub) {
                user = await prisma.user.findUnique({ where: { email: String(payload.sub) } as any, include: { role: true } })
            }
        } catch (err) {
            console.error('failed to lookup user for session', err)
        }

        if (!user) { (request as any).res.status(401).json({ error: 'user not found' }); this.setStatus(401); return }

        const roleName = user.role?.name ?? (user.isAdmin ? 'admin' : 'user')

        const resp: any = {
            id: user.id,
            email: user.email,
            role: roleName,
            isAdmin: Boolean(user.isAdmin)
        }
        if (user.external_id) resp.external_id = user.external_id

        this.setStatus(200)
        return resp
    }
}
