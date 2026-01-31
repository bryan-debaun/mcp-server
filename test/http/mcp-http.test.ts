import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import { registerMcpHttp } from '../../src/http/mcp-http.js'

describe('MCP HTTP endpoints', () => {
    it('should reject POST /mcp without auth when MCP_API_KEY set', async () => {
        process.env.MCP_API_KEY = 'testkey'
        const app = express()
        app.use(express.json())
        registerMcpHttp(app)

        const res = await request(app).post('/mcp').send({})
        expect(res.status).toBe(401)
        expect(res.body.error).toBe('unauthorized')
    })

    it('should accept GET /mcp for SSE with correct auth', async () => {
        process.env.MCP_API_KEY = 'testkey'
        const app = express()
        app.use(express.json())
        registerMcpHttp(app)

        // Start the app on a real port so we can stream and abort after seeing initial data
        const server = app.listen(0)
        const port = (server.address() as any).port
        const http = await import('http')

        await new Promise<void>((resolve, reject) => {
            const opts = { method: 'GET', port, path: '/mcp', headers: { Authorization: 'Bearer testkey' } }
            const req = http.request(opts, (res: any) => {
                try {
                    expect(res.statusCode).toBe(200)
                    expect(res.headers['content-type']).toMatch(/text\/event-stream/)

                    let got = ''
                    res.on('data', (chunk: any) => {
                        got += chunk.toString()
                        if (got.includes('connected')) {
                            req.abort()
                            resolve()
                        }
                    })
                } catch (err) {
                    reject(err)
                }
            })
            req.on('error', (_err: any) => {
                // abort will trigger an error; ignore if we already resolved
                // but if we didn't resolve, reject
                // Minor race - ignore by design for this test
            })
            req.end()
        })

        server.close()
    })

    it('should require auth for POST /mcp/events and validate conn id', async () => {
        process.env.MCP_API_KEY = 'testkey'
        const app = express()
        app.use(express.json())
        registerMcpHttp(app)

        // No auth
        const res1 = await request(app).post('/mcp/events').send({})
        expect(res1.status).toBe(401)

        // With auth but missing conn id
        const res2 = await request(app).post('/mcp/events').set('Authorization', 'Bearer testkey').send({})
        expect(res2.status).toBe(400)
        expect(res2.body.error).toBe('missing conn id')
    })
})
