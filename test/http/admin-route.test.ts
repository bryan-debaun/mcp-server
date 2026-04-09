import { describe, it, expect, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { registerAdminRoute } from '../../src/http/admin-route.js'
import { config } from '../../src/config.js'

const origAdminDebugEnabled = config.security.adminDebugEnabled
const origIsProduction = config.isProduction

afterEach(() => {
    config.security.adminDebugEnabled = origAdminDebugEnabled
    config.isProduction = origIsProduction
})

describe('Admin debug endpoint production block', () => {
    it('does not register the debug endpoint when NODE_ENV=production, even with ADMIN_DEBUG_ENABLED=true', async () => {
        config.security.adminDebugEnabled = true
        config.isProduction = true

        const app = express()
        registerAdminRoute(app)

        const res = await request(app).get('/api/admin/_debug/headers')
        // Route not registered → Express returns 404
        expect(res.status).toBe(404)
    })

    it('registers the debug endpoint in non-production when ADMIN_DEBUG_ENABLED=true', async () => {
        config.security.adminDebugEnabled = true
        config.isProduction = false

        const app = express()
        registerAdminRoute(app)

        const routes: string[] = (app as any)._router?.stack
            ?.filter((l: any) => l.route)
            .map((l: any) => l.route.path) ?? []
        expect(routes).toContain('/api/admin/_debug/headers')
    })

    it('does not register the debug endpoint when ADMIN_DEBUG_ENABLED=false', async () => {
        config.security.adminDebugEnabled = false
        config.isProduction = false

        const app = express()
        registerAdminRoute(app)

        const routes: string[] = (app as any)._router?.stack
            ?.filter((l: any) => l.route)
            .map((l: any) => l.route.path) ?? []
        expect(routes).not.toContain('/api/admin/_debug/headers')
    })
})
