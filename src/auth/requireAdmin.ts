import { Request, Response, NextFunction } from 'express'

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user
    // Allow service role (used for server-to-server actions) as admin
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (serviceRoleKey && req.headers.authorization === `Bearer ${serviceRoleKey}`) {
        return next()
    }

    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'forbidden' })
    }

    return next()
}
