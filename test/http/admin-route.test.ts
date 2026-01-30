import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock jwt middleware so we can control authenticated user
vi.mock('../../src/auth/jwt', () => ({
    jwtMiddleware: (req, _res, next) => { next() },
    verifySupabaseJwt: async () => { return {} }
}))

// Mock admin service to avoid hitting a real database
vi.mock('../../src/services/admin-service', () => ({
    listUsers: async () => [{ id: 1, email: 'admin@example.com' }],
    createInvite: async (email, invitedBy) => ({ id: 1, email, token: 'invite-token', invitedBy }),
    setUserRole: async (id, role) => ({ id, role }),
    listAccessRequests: async () => [],
    approveAccessRequest: async () => ({ id: 1, reviewed: true })
}))

import { registerAdminRoute } from '../../src/http/admin-route'

// Simple stub to inject an admin user
function adminStub(req, _res, next) {
    req.user = { sub: 1, role: 'admin' }
    next()
}

function userStub(req, _res, next) {
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
})