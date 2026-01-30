import { Application, Request, Response } from 'express'
import { jwtMiddleware } from '../auth/jwt.js'
import { requireAdmin } from '../auth/requireAdmin.js'
import { listUsers, createInvite, setUserRole, listAccessRequests, approveAccessRequest } from '../services/admin-service.js'

export function registerAdminRoute(app: Application) {
    const base = '/api/admin'

    app.get(`${base}/users`, jwtMiddleware, requireAdmin, async (_req: Request, res: Response) => {
        const users = await listUsers()
        res.json(users)
    })

    app.post(`${base}/users`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const { email } = req.body
        if (!email) return res.status(400).json({ error: 'email is required' })
        const invitedBy = (req as any).user?.sub ? undefined : undefined
        const invite = await createInvite(email, invitedBy)
        // stubbed email flow: return token in response for dev only
        res.status(201).json({ invite })
    })

    app.patch(`${base}/users/:id`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const { role } = req.body
        if (!role) return res.status(400).json({ error: 'role is required' })
        const actorId = (req as any).user?.sub ? Number((req as any).user.sub) : undefined
        const user = await setUserRole(id, role, actorId)
        res.json(user)
    })

    app.get(`${base}/access-requests`, jwtMiddleware, requireAdmin, async (_req: Request, res: Response) => {
        const r = await listAccessRequests()
        res.json(r)
    })

    app.post(`${base}/access-requests/:id/approve`, jwtMiddleware, requireAdmin, async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const reviewerId = (req as any).user?.sub ? Number((req as any).user.sub) : undefined
        const r = await approveAccessRequest(id, reviewerId!)
        res.json(r)
    })
}
