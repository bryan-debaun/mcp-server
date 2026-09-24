import type { Server } from 'node:http'
import {
    After,
    setDefaultTimeout,
    setWorldConstructor,
    World,
} from '@cucumber/cucumber'
import { config } from '../../src/config.js'
import { startHttpServer } from '../../src/http/server.js'

setDefaultTimeout(30_000)

/**
 * The BDD run is DB-free by construction. `config` loads `.env.local` on a
 * developer machine, which may carry a real DATABASE_URL; clearing it here,
 * before the first server starts, puts Prisma into its documented stub mode so
 * the scenarios describe the same server on a laptop, in CI, and on a fresh
 * clone. DB-backed scenarios are follow-on work behind a tag.
 */
;(config as { database: { url: string | undefined } }).database.url = undefined

/**
 * Same reasoning for the Spotify adapter: with credentials in `.env.local` the
 * server auto-starts a polling loop that keeps the process alive after the
 * run and floods the log. Nothing here exercises Spotify.
 */
const spotify = config.spotify as {
    enabled: boolean
    clientId: string | undefined
    clientSecret: string | undefined
    refreshToken: string | undefined
}
spotify.enabled = false
spotify.clientId = undefined
spotify.clientSecret = undefined
spotify.refreshToken = undefined

/** What the process started with; every scenario restores it. */
const ORIGINAL = {
    mcpApiKey: config.security.mcpApiKey,
    publicBaseUrl: config.oauth.publicBaseUrl,
    resourceIdentifier: config.oauth.resourceIdentifier,
}

type Mutable = {
    security: { mcpApiKey: string | undefined }
    oauth: {
        publicBaseUrl: string | undefined
        resourceIdentifier: string | undefined
    }
}

export const mutableConfig = config as unknown as Mutable

type Json = Record<string, unknown>

/** Pull the JSON-RPC message out of an MCP response, whether JSON or SSE. */
function parseRpc(contentType: string | null, text: string): Json | undefined {
    if (contentType?.includes('text/event-stream')) {
        const data = text
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice('data:'.length).trim())
        return data.length > 0
            ? (JSON.parse(data[data.length - 1]) as Json)
            : undefined
    }
    try {
        return JSON.parse(text) as Json
    } catch {
        return undefined
    }
}

/** What a scenario has set up and what it last observed. */
export class ServerWorld extends World {
    server: Server | undefined
    baseUrl = ''
    response: Response | undefined
    body: Json | undefined
    /** The JSON-RPC message parsed out of the last MCP response. */
    rpc: Json | undefined

    async start(): Promise<void> {
        if (this.server) return
        this.server = await startHttpServer(0, '127.0.0.1')
        const address = this.server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        this.baseUrl = `http://127.0.0.1:${port}`
    }

    async stop(): Promise<void> {
        const server = this.server
        if (!server) return
        this.server = undefined
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
    }

    async request(
        method: string,
        path: string,
        headers: Record<string, string> = {},
        body?: string,
    ): Promise<void> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: body
                ? { 'content-type': 'application/json', ...headers }
                : headers,
            body,
        })
        this.response = response
        this.rpc = undefined
        const text = await response.text()
        this.body = parseRpc(response.headers.get('content-type'), text)
    }

    /** POST one JSON-RPC request to the Streamable HTTP transport. */
    async mcp(
        method: string,
        params: Json,
        headers: Record<string, string> = {},
    ): Promise<void> {
        const response = await fetch(`${this.baseUrl}/mcp`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                ...headers,
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        })
        this.response = response
        const text = await response.text()
        this.body = undefined
        this.rpc = parseRpc(response.headers.get('content-type'), text)
    }

    responded(): Response {
        if (!this.response) throw new Error('no request has been made yet')
        return this.response
    }

    result(): Json {
        const result = this.rpc?.result
        if (!result) {
            throw new Error(
                `no JSON-RPC result in the last MCP response: ${JSON.stringify(this.rpc)}`,
            )
        }
        return result as Json
    }
}

setWorldConstructor(ServerWorld)

After(async function (this: ServerWorld) {
    await this.stop()
    mutableConfig.security.mcpApiKey = ORIGINAL.mcpApiKey
    mutableConfig.oauth.publicBaseUrl = ORIGINAL.publicBaseUrl
    mutableConfig.oauth.resourceIdentifier = ORIGINAL.resourceIdentifier
})
