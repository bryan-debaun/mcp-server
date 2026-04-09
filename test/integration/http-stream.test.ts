/**
 * Integration test: HTTP Stream transport — discovery & tool invocation
 *
 * Simulates VS Code-style MCP client behaviour against the real HTTP Stream
 * transport (`POST /mcp`, bidirectional NDJSON) without hitting a database or
 * external service.
 *
 * Gate: gated by `RUN_TRANSPORT_INTEGRATION=true` to keep CI fast by default.
 * Run locally: RUN_TRANSPORT_INTEGRATION=true npx vitest run test/integration/http-stream.test.ts
 */

import { describe, it, expect, afterEach } from 'vitest'
import * as http from 'http'
import express from 'express'
import { registerMcpHttp } from '../../src/http/mcp-http.js'
import { config } from '../../src/config.js'

const RUN = process.env.RUN_TRANSPORT_INTEGRATION === 'true'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Start an Express server on a random port and return it + its base URL. */
function startServer(): Promise<{ server: http.Server; baseUrl: string }> {
    return new Promise((resolve) => {
        const app = express()
        app.use(express.json())
        registerMcpHttp(app)
        const server = app.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as { port: number }
            resolve({ server, baseUrl: `http://127.0.0.1:${port}` })
        })
    })
}

/**
 * Open a POST /mcp stream, send NDJSON messages, and collect the first N
 * response lines. Resolves once `lineCount` non-empty lines are received or
 * the socket closes.
 */
function mcpStreamSession(
    baseUrl: string,
    messages: object[],
    lineCount: number,
    apiKey?: string,
): Promise<object[]> {
    return new Promise((resolve, reject) => {
        const url = new URL('/mcp', baseUrl)
        const body = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'

        const headers: Record<string, string> = {
            'Content-Type': 'application/x-ndjson',
            'Content-Length': String(Buffer.byteLength(body)),
        }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

        const req = http.request(
            { hostname: url.hostname, port: Number(url.port), method: 'POST', path: url.pathname, headers },
            (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Unexpected status ${res.statusCode}`))
                    req.destroy()
                    return
                }

                const lines: object[] = []
                let buf = ''

                res.on('data', (chunk: Buffer) => {
                    buf += chunk.toString()
                    let idx: number
                    while ((idx = buf.indexOf('\n')) !== -1) {
                        const line = buf.slice(0, idx).trim()
                        buf = buf.slice(idx + 1)
                        if (!line) continue
                        try {
                            lines.push(JSON.parse(line))
                        } catch {
                            // ignore keepalive newlines
                        }
                        if (lines.length >= lineCount) {
                            req.destroy()
                            resolve(lines)
                            return
                        }
                    }
                })

                res.on('end', () => resolve(lines))
                res.on('error', reject)
            },
        )

        req.on('error', (err: NodeJS.ErrnoException) => {
            // ECONNRESET is expected when we call req.destroy() after collecting enough lines
            if (err.code === 'ECONNRESET') {
                // already resolved above
            } else {
                reject(err)
            }
        })

        req.write(body)
        req.end()
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HTTP Stream transport integration', () => {
    if (!RUN) {
        it.skip('skipped — set RUN_TRANSPORT_INTEGRATION=true to run', () => { })
        return
    }

    const origMcpApiKey = config.security.mcpApiKey
    let server: http.Server

    afterEach(() => {
        config.security.mcpApiKey = origMcpApiKey
        server?.close()
    })

    it('responds to initialize with serverInfo and tool capabilities', async () => {
        config.security.mcpApiKey = undefined
            ; ({ server } = await startServer())
        const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`

        const initMsg = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                clientInfo: { name: 'test-client', version: '0.0.1' },
                capabilities: {},
            },
        }

        const lines = await mcpStreamSession(baseUrl, [initMsg], 1)

        expect(lines.length).toBeGreaterThanOrEqual(1)
        const reply = lines[0] as any
        expect(reply.jsonrpc).toBe('2.0')
        expect(reply.id).toBe(1)
        expect(reply.result).toBeDefined()
        expect(reply.result.serverInfo?.name).toBe('bryan-debaun-mcp-server')
        expect(reply.result.capabilities?.tools).toBeDefined()
    })

    it('lists tools after initialize and includes a known tool', async () => {
        config.security.mcpApiKey = undefined
            ; ({ server } = await startServer())
        const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`

        const initMsg = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                clientInfo: { name: 'test-client', version: '0.0.1' },
                capabilities: {},
            },
        }
        const notif = { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }
        const listMsg = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }

        // Expect 2 responses: one for initialize (id:1), one for tools/list (id:2)
        const lines = await mcpStreamSession(baseUrl, [initMsg, notif, listMsg], 2)

        const toolsReply = lines.find((l: any) => l.id === 2) as any
        expect(toolsReply).toBeDefined()
        expect(toolsReply.result?.tools).toBeInstanceOf(Array)
        expect(toolsReply.result.tools.length).toBeGreaterThan(0)

        const toolNames: string[] = toolsReply.result.tools.map((t: any) => t.name)
        expect(toolNames).toContain('create-issue')
    })

    it('returns 401 when MCP_API_KEY is set and auth header is missing', async () => {
        config.security.mcpApiKey = 'test-secret'
            ; ({ server } = await startServer())
        const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`

        await expect(
            mcpStreamSession(baseUrl, [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }], 1),
        ).rejects.toThrow('Unexpected status 401')
    })

    it('accepts a request when correct Bearer token is provided', async () => {
        config.security.mcpApiKey = 'test-secret'
            ; ({ server } = await startServer())
        const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`

        const initMsg = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                clientInfo: { name: 'test-client', version: '0.0.1' },
                capabilities: {},
            },
        }

        const lines = await mcpStreamSession(baseUrl, [initMsg], 1, 'test-secret')
        const reply = lines[0] as any
        expect(reply.id).toBe(1)
        expect(reply.result).toBeDefined()
    })
})
