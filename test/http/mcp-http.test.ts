import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { config } from '../../src/config.js'
import { registerMcpHttp } from '../../src/http/mcp-http.js'
import { logger } from '../../src/logger.js'

describe('MCP HTTP endpoints', () => {
    const origMcpApiKey = config.security.mcpApiKey
    beforeEach(() => {
        config.security.mcpApiKey = undefined
    })
    afterEach(() => {
        config.security.mcpApiKey = origMcpApiKey
    })

    it('should reject POST /mcp without auth when MCP_API_KEY set', async () => {
        config.security.mcpApiKey = 'testkey'
        const app = express()
        app.use(express.json())
        registerMcpHttp(app)

        const res = await request(app).post('/mcp').send({})
        expect(res.status).toBe(401)
        expect(res.body.error).toBe('unauthorized')
    })

    it('should accept GET /mcp for SSE with correct auth', async () => {
        config.security.mcpApiKey = 'testkey'
        const app = express()
        app.use(express.json())
        registerMcpHttp(app)

        // Start the app on a real port so we can stream and abort after seeing initial data
        const server = app.listen(0)
        const port = (server.address() as any).port
        const http = await import('http')

        await new Promise<void>((resolve, reject) => {
            const opts = {
                method: 'GET',
                port,
                path: '/mcp',
                headers: { Authorization: 'Bearer testkey' },
            }
            const req = http.request(opts, (res: any) => {
                try {
                    expect(res.statusCode).toBe(200)
                    expect(res.headers['content-type']).toMatch(
                        /text\/event-stream/,
                    )

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
        config.security.mcpApiKey = 'testkey'
        const app = express()
        app.use(express.json())
        registerMcpHttp(app)

        // No auth
        const res1 = await request(app).post('/mcp/events').send({})
        expect(res1.status).toBe(401)

        // With auth but missing conn id
        const res2 = await request(app)
            .post('/mcp/events')
            .set('Authorization', 'Bearer testkey')
            .send({})
        expect(res2.status).toBe(400)
        expect(res2.body.error).toBe('missing conn id')
    })

    // `src/sentry.ts` bridges every `logger.error` to Sentry. These handlers used
    // to log the whole request lifecycle at `error`, so with a DSN configured
    // every ordinary MCP request would have raised a Sentry issue — burying real
    // failures. Guard the levels, not just the behaviour.
    describe('log levels (ORR gap: routine flow must not reach Sentry)', () => {
        it('logs nothing at error for a rejected (client-fault) request', async () => {
            const errorSpy = vi
                .spyOn(logger, 'error')
                .mockImplementation(() => {})
            config.security.mcpApiKey = 'testkey'
            const app = express()
            app.use(express.json())
            registerMcpHttp(app)

            await request(app).post('/mcp').send({}) // 401: bad auth
            await request(app)
                .post('/mcp/events')
                .set('Authorization', 'Bearer testkey')
                .send({}) // 400: missing conn id

            expect(errorSpy).not.toHaveBeenCalled()
            errorSpy.mockRestore()
        })

        it('logs a bad payload at warn, not error', async () => {
            const errorSpy = vi
                .spyOn(logger, 'error')
                .mockImplementation(() => {})
            const warnSpy = vi
                .spyOn(logger, 'warn')
                .mockImplementation(() => {})
            config.security.mcpApiKey = 'testkey'
            const app = express()
            app.use(express.json())
            registerMcpHttp(app)

            const res = await request(app)
                .post('/mcp/events')
                .set('Authorization', 'Bearer testkey')
                .set('X-MCP-Conn-Id', 'nope')
                .send({})

            expect(res.status).toBe(404)
            expect(warnSpy).toHaveBeenCalled()
            expect(errorSpy).not.toHaveBeenCalled()
            errorSpy.mockRestore()
            warnSpy.mockRestore()
        })
    })
})
