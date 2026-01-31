import { describe, it, expect, vi } from 'vitest'

const ERROR_MSG = 'simulated import failure'

describe('createHttpApp import failure behavior', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    it('does not throw if mcp-http import fails', async () => {
        vi.doMock('../../src/http/mcp-http', () => { throw new Error(ERROR_MSG) })
        const { createHttpApp } = await import('../../src/http/server')
        await expect(createHttpApp()).resolves.toBeTruthy()
    })
})