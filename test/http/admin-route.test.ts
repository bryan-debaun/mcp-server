import { describe, it, expect, vi } from 'vitest'
import express, { Request, Response, NextFunction } from 'express'
import request from 'supertest'

// Mock jwt middleware so we can control authenticated user
vi.mock('../../src/auth/jwt', () => ({
    jwtMiddleware: (_req: Request, _res: Response, next: NextFunction) => { next() },
    verifySupabaseJwt: async () => { return {} }
}))

// Mock local tool client
vi.mock('../../src/tools/local', () => ({
    callTool: async (name: string, args: any) => {
        if (name === 'db/list-users') return [{ id: 1, email: 'admin@example.com' }]
        if (name === 'db/create-invite') return { id: 1, email: args.email, token: 'invite-token', invitedBy: args.invitedBy }
        throw new Error('tool unknown')
    }
}))

// Mock email sender so tests don't actually attempt to send mail
vi.mock('../../src/email', () => ({
    sendInviteEmail: vi.fn()
}))

import { registerAdminRoute } from '../../src/http/admin-route'

// Simple stub to inject an admin user
function adminStub(req: Request, _res: Response, next: NextFunction) {
    req.user = { sub: 1, role: 'admin' }
    next()
}

function userStub(req: Request, _res: Response, next: NextFunction) {
    req.user = { sub: 2, role: 'user' }
    next()
}

describe('Admin routes', () => {
    it('allows admin to get users', async () => {
        const app = express()
        app.use(express.json())
        // Inject our admin user before the route
        app.use(adminStub)
        registerAdminRoute(app)

        const res = await request(app).get('/api/admin/users')
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    it('forbids non-admin', async () => {
        const app = express()
        app.use(express.json())
        app.use(userStub)
        registerAdminRoute(app)

        const res = await request(app).get('/api/admin/users')
        expect(res.status).toBe(403)
    })

    it('allows admin to invite user and sends email (no token returned by default)', async () => {
        const app = express()
        app.use(express.json())
        app.use(adminStub)
        registerAdminRoute(app)

        const emailModule = await import('../../src/email.js')
        const sendInviteEmail = (emailModule as any).sendInviteEmail
        if (sendInviteEmail.mockClear) sendInviteEmail.mockClear()

        const res = await request(app).post('/api/admin/users').send({ email: 'new@example.com' })
        expect(res.status).toBe(201)
        expect(sendInviteEmail).toHaveBeenCalledWith('new@example.com', 'invite-token')
        expect(res.body.email).toBe('new@example.com')
        expect(res.body.token).toBeUndefined()
    })

    it('forbids non-admin from creating invites', async () => {
        const app = express()
        app.use(express.json())
        app.use(userStub)
        registerAdminRoute(app)

        const res = await request(app).post('/api/admin/users').send({ email: 'nope@example.com' })
        expect(res.status).toBe(403)
    })

    it('includes token when SHOW_INVITE_TOKEN=1', async () => {
        process.env.SHOW_INVITE_TOKEN = '1'
        const app = express()
        app.use(express.json())
        app.use(adminStub)
        registerAdminRoute(app)

        const res = await request(app).post('/api/admin/users').send({ email: 'another@example.com' })
        expect(res.status).toBe(201)
        expect(res.body.token).toBe('invite-token')
        delete process.env.SHOW_INVITE_TOKEN
    })
})