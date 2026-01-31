import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/index.js'
import { serviceRoleBypassTotal } from '../http/metrics-route.js'

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user

    // If the request was authenticated using the service role (jwtMiddleware marks it with user.service=true),
    // perform hardened checks: require BOTH internal header key and IP to be allowlisted (Option A).
    if (user && user.service) {
        const internalKey = process.env.INTERNAL_ADMIN_KEY
        const allowlist = (process.env.ADMIN_IP_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean)
        const clientIp = ((req.headers['x-forwarded-for'] || req.ip) as string).toString().split(',')[0].trim()

        const headerOk = internalKey ? req.headers['x-internal-key'] === internalKey : false
        const ipOk = allowlist.length > 0 ? allowlist.includes(clientIp) : false

        if (!(headerOk && ipOk)) {
            console.warn('Service role access denied: missing internal header or IP not allowlisted', { ip: clientIp })
            return res.status(403).json({ error: 'forbidden' })
        }

        // Audit and metrics for service role bypass
        try {
            prisma.auditLog.create({ data: { action: 'service-role-bypass', metadata: { ip: clientIp, path: req.path, method: req.method } } }).catch(() => { /* noop */ })
        } catch (e) {
            console.error('failed to write audit log for service-role-bypass', e)
        }

        try { serviceRoleBypassTotal.inc() } catch (e) { /* noop */ }

        return next()
    }

    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'forbidden' })
    }

    return next()
}
