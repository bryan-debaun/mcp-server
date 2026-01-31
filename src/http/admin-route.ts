import { Application, Request, Response } from 'express'
import { jwtMiddleware } from '../auth/jwt.js'
import { requireAdmin } from '../auth/requireAdmin.js'
import { sendInviteEmail } from "../email.js"
import { prisma } from '../db/index.js'
import { adminDebugRequestsTotal } from './metrics-route.js'

export function registerAdminRoute(app: Application) {
    const base = '/api/admin'

    app.get(`${base}/users`, jwtMiddleware, requireAdmin, async (_req: Request, res: Response) => {
        // Use local db tool to list users so DB access flows through MCP tools
        const { callTool } = await import('../tools/local.js')
        const users = await callTool('list-users', {})
        res.json(users)
    })

    app.post(`${base}/users`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const { email } = req.body
        if (!email) return res.status(400).json({ error: 'email is required' })
        const invitedBy = (req as any).user?.sub ? undefined : undefined

        // Use local db tool to create invite; this routes through MCP tool implementation
        const { callTool } = await import('../tools/local.js')
        let invite: any
        try {
            invite = await callTool('create-invite', { email, invitedBy })
        } catch (err: any) {
            console.error('create invite tool failed', err)
            return res.status(500).json({ error: 'failed to create invite' })
        }

        // attempt to send invite email; don't fail the request if sending fails
        try {
            await sendInviteEmail(email, invite.token)
        } catch (err) {
            console.error('failed to send invite email', err)
        }

        // Safety: don't expose the invite token in production responses by default
        const resp: any = { id: invite.id, email: invite.email }
        if (process.env.SHOW_INVITE_TOKEN === '1') {
            resp.token = invite.token
        }

        res.status(201).json(resp)
    })

    app.patch(`${base}/users/:id`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const { role } = req.body
        if (!role) return res.status(400).json({ error: 'role is required' })
        const actorId = (req as any).user?.sub ? Number((req as any).user.sub) : undefined
        const { setUserRole } = await import('../services/admin-service.js')
        const user = await setUserRole(id, role, actorId)
        res.json(user)
    })

    app.get(`${base}/access-requests`, jwtMiddleware, requireAdmin, async (_req: Request, res: Response) => {
        const { listAccessRequests } = await import('../services/admin-service.js')
        const r = await listAccessRequests()
        res.json(r)
    })

    app.post(`${base}/access-requests/:id/approve`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const reviewerId = (req as any).user?.sub ? Number((req as any).user.sub) : undefined
        const { approveAccessRequest } = await import('../services/admin-service.js')
        const r = await approveAccessRequest(id, reviewerId!)
        res.json(r)
    })

    // Debug endpoint to help diagnose gateway/auth issues on preview hosts.
    // Protected with the same admin checks (jwtMiddleware + requireAdmin).
    if (process.env.ADMIN_DEBUG_ENABLED === '1') {
        app.get(`${base}/_debug/headers`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
            const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim()
            const internalKeyPresent = !!req.headers['x-internal-key']
            const jwksUrl = process.env.SUPABASE_JWKS_URL
            let jwksStatus: any = null
            if (jwksUrl) {
                try {
                    const r = await fetch(jwksUrl, { method: 'GET' })
                    jwksStatus = { status: r.status, ok: r.ok }
                } catch (err) {
                    jwksStatus = { error: (err as any)?.message || String(err) }
                }
            }

            try {
                await prisma.auditLog.create({ data: { action: 'admin-debug', metadata: { ip, path: req.path } } })
            } catch (e) { /* noop */ }

            try { adminDebugRequestsTotal.inc() } catch (e) { /* noop */ }

            res.json({ ip, internalKeyPresent, jwksUrl: !!jwksUrl, jwksStatus })
        })
    }
}
