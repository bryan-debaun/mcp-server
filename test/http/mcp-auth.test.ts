import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { registerDbDependentRoutes } from '../../src/http/server.js'
import { mcpAuthFailuresTotal } from '../../src/http/metrics-route.js'

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
    } catch (e) { /* noop */ }
    return 0
}

describe('MCP auth middleware', () => {
    const origMcp = process.env.MCP_API_KEY

    beforeEach(() => {
        // Ensure clean state
        delete process.env.MCP_API_KEY
    })

    afterEach(() => {
        if (typeof origMcp === 'undefined') delete process.env.MCP_API_KEY
        else process.env.MCP_API_KEY = origMcp
    })

    it('does not enforce auth when MCP_API_KEY unset', async () => {
        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)
        const res = await request(app).get('/api/books')
        expect(res.status).toBe(200)
    })

    it('returns 401 for GET /api/books when MCP_API_KEY set and no Authorization', async () => {
        process.env.MCP_API_KEY = 'testkey'
        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)

        const res = await request(app).get('/api/books')
        expect(res.status).toBe(401)
        expect(res.body.error).toBe('Unauthorized')
    })

    it('accepts Authorization: Bearer <key>', async () => {
        process.env.MCP_API_KEY = 'testkey'
        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)

        const res = await request(app).get('/api/books').set('Authorization', 'Bearer testkey')
        expect(res.status).toBe(200)
    })

    it('accepts x-mcp-api-key with deprecation warning', async () => {
        process.env.MCP_API_KEY = 'testkey'
        const app = express()
        app.use(express.json())

        const logs: any[] = []
        const origErr = console.error
        console.error = (...args: any[]) => logs.push(args)

        await registerDbDependentRoutes(app)
        const res = await request(app).get('/api/books').set('x-mcp-api-key', 'testkey')
        console.error = origErr

        expect(res.status).toBe(200)
        const found = logs.some((entry: any) => JSON.stringify(entry).toLowerCase().includes('deprecated') || JSON.stringify(entry).toLowerCase().includes('x-mcp-api-key'))
        expect(found).toBe(true)
    })

    it('increments metric on auth failure', async () => {
        process.env.MCP_API_KEY = 'testkey'
        const app = express()
        app.use(express.json())

        const before = getCounterValue(mcpAuthFailuresTotal)
        await registerDbDependentRoutes(app)
        await request(app).get('/api/books')
        const after = getCounterValue(mcpAuthFailuresTotal)
        expect(after).toBeGreaterThan(before)
    })
})
