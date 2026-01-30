import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../../src/services/admin-service', () => ({
    acceptInvite: vi.fn()
}))

import { registerInviteRoutes } from '../../src/http/invite-route.js'

describe('invite routes', () => {
    it('POST /api/invites/accept happy path', async () => {
        const app = express()
        app.use(express.json())
        registerInviteRoutes(app)

        const svc: any = await import('../../src/services/admin-service')
        svc.acceptInvite.mockResolvedValue({ id: 5, email: 'x@example.com' })

        const res = await request(app).post('/api/invites/accept').send({ token: 't', name: 'Name' })
        expect(res.status).toBe(201)
        expect(res.body.user.email).toBe('x@example.com')
    })

    it('returns 404 for invalid token', async () => {
        const app = express()
        app.use(express.json())
        registerInviteRoutes(app)

        const svc: any = await import('../../src/services/admin-service')
        svc.acceptInvite.mockRejectedValue(new Error('invalid token'))

        const res = await request(app).post('/api/invites/accept').send({ token: 'bad' })
        expect(res.status).toBe(404)
    })

    it('GET /api/invites/accept with token', async () => {
        const app = express()
        app.use(express.json())
        registerInviteRoutes(app)

        const svc: any = await import('../../src/services/admin-service')
        svc.acceptInvite.mockResolvedValue({ id: 9, email: 'g@example.com' })

        const res = await request(app).get('/api/invites/accept').query({ token: 't' })
        expect(res.status).toBe(200)
        expect(res.body.user.email).toBe('g@example.com')
    })
})