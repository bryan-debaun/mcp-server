import { describe, expect, it, vi } from 'vitest'

const ERROR_MSG = 'simulated import failure'

describe('createHttpApp import failure behavior', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    // Generous timeout: this dynamically imports the whole server module graph
    // (express, tsoa-routes, MCP transport), which can exceed Vitest's default
    // 5s under machine load — a flake unrelated to what's being asserted.
    it('does not throw if mcp-http import fails', async () => {
        vi.doMock('../../src/http/mcp-http', () => {
            throw new Error(ERROR_MSG)
        })
        const { createHttpApp } = await import('../../src/http/server')
        await expect(createHttpApp()).resolves.toBeTruthy()
    }, 30_000)
})
