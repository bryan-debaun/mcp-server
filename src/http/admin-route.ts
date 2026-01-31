import { Application, Request, Response } from 'express'
import { jwtMiddleware } from '../auth/jwt.js'
import { requireAdmin } from '../auth/requireAdmin.js'
import { sendInviteEmail } from "../email.js"

export function registerAdminRoute(app: Application) {
    const base = '/api/admin'

    app.get(`${base}/users`, jwtMiddleware, requireAdmin, async (_req: Request, res: Response) => {
        const { listUsers } = await import('../services/admin-service.js')
        const users = await listUsers()
        res.json(users)
    })

    app.post(`${base}/users`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const { email } = req.body
        if (!email) return res.status(400).json({ error: 'email is required' })
        const invitedBy = (req as any).user?.sub ? undefined : undefined
        const { createInvite } = await import('../services/admin-service.js')
        const invite = await createInvite(email, invitedBy)

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
}
