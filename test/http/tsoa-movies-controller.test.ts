import type { Server } from 'http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Mock the tool layer so these controller-wiring tests are deterministic and
// independent of database availability. (Previously they relied on the
// controllers swallowing DB errors into an empty 200 — that masking is gone.)
vi.mock('../../src/tools/local.js', () => ({
    callTool: vi.fn(async (name: string) => {
        if (name === 'list-movies') return { movies: [], total: 0 }
        if (name === 'get-movie') throw new Error('Movie not found')
        return {}
    }),
}))

import { startHttpServer } from '../../src/http/server.js'

describe('tsoa movies controller', () => {
    let server: Server
    let baseUrl: string

    beforeAll(async () => {
        server = await startHttpServer(0, '127.0.0.1')
        const address = server.address()
        const port =
            typeof address === 'object' && address !== null ? address.port : 0
        baseUrl = `http://127.0.0.1:${port}`
    })

    const authHeaders: HeadersInit | undefined = process.env.MCP_API_KEY
        ? { Authorization: `Bearer ${process.env.MCP_API_KEY}` }
        : undefined

    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()))
    })

    it('should return movies via tsoa controller GET /api/movies', async () => {
        const response = await fetch(`${baseUrl}/api/movies`, {
            headers: authHeaders,
        })
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data).toHaveProperty('movies')
        expect(data).toHaveProperty('total')
        expect(Array.isArray(data.movies)).toBe(true)
    })

    it('should accept query parameters for GET /api/movies', async () => {
        const response = await fetch(
            `${baseUrl}/api/movies?limit=10&offset=0`,
            { headers: authHeaders },
        )
        expect(response.status).toBe(200)

        const data = await response.json()
        expect(data).toHaveProperty('movies')
        expect(data).toHaveProperty('total')
    })

    it('should return 404 for a missing movie via GET /api/movies/:id', async () => {
        const response = await fetch(`${baseUrl}/api/movies/1`, {
            headers: authHeaders,
        })
        expect(response.status).toBe(404)
    })
})
