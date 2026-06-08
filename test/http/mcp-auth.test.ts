import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'

// /api/books is served by the TSOA controller (which no longer swallows DB
// errors), so mock the tool layer to keep these auth-middleware tests
// deterministic and independent of database availability.
vi.mock('../../src/tools/local.js', () => ({
    callTool: vi.fn(async () => ({ books: [], total: 0 })),
}))

import { registerDbDependentRoutes } from '../../src/http/server.js'
import { mcpAuthFailuresTotal } from '../../src/http/metrics-route.js'
import { config } from '../../src/config.js'

function getCounterValue(counter: any) {
    try {
        // prom-client Counter exposes get().values
        const metrics = counter.get?.().values as any[] | undefined
        if (metrics && metrics.length) return metrics[0].value
        // Fallback to hashMap
        const hm = counter.hashMap
        if (hm) {
            const keys = Object.keys(hm)
            if (keys.length) return hm[keys[0]].value
        }
    } catch { /* noop */ }
    return 0
}

describe('MCP auth middleware', () => {
    const origMcpApiKey = config.security.mcpApiKey

    beforeEach(() => {
        // Ensure clean state — config is the source of truth now
        config.security.mcpApiKey = undefined
    })

    afterEach(() => {
        config.security.mcpApiKey = origMcpApiKey
    })

    it('does not enforce auth when MCP_API_KEY unset', async () => {
        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)
        const res = await request(app).get('/api/books')
        expect(res.status).toBe(200)
    })

    it('returns 401 for GET /api/books when MCP_API_KEY set and no Authorization', async () => {
        config.security.mcpApiKey = 'testkey'
        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)

        const res = await request(app).get('/api/books')
        expect(res.status).toBe(401)
        expect(res.body.error).toBe('Unauthorized')
    })

    it('accepts Authorization: Bearer <key>', async () => {
        config.security.mcpApiKey = 'testkey'
        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)

        const res = await request(app).get('/api/books').set('Authorization', 'Bearer testkey')
        expect(res.status).toBe(200)
    })

    it('accepts X-Mcp-Api-Key as a first-class second factor', async () => {
        config.security.mcpApiKey = 'testkey'
        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)

        const res = await request(app).get('/api/books').set('x-mcp-api-key', 'testkey')
        expect(res.status).toBe(200)
    })

    it('rejects a wrong X-Mcp-Api-Key', async () => {
        config.security.mcpApiKey = 'testkey'
        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)

        const res = await request(app).get('/api/books').set('x-mcp-api-key', 'wrong')
        expect(res.status).toBe(401)
    })

    it('increments metric on auth failure', async () => {
        config.security.mcpApiKey = 'testkey'
        const app = express()
        app.use(express.json())

        const before = getCounterValue(mcpAuthFailuresTotal)
        await registerDbDependentRoutes(app)
        await request(app).get('/api/books')
        const after = getCounterValue(mcpAuthFailuresTotal)
        expect(after).toBeGreaterThan(before)
    })
})
