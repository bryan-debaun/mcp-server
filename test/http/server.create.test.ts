import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/http/mcp-http', () => ({
    registerMcpHttp: (app: any) => {
        // Simulate registering the /mcp routes
        app.get('/mcp', () => { })
        app.post('/mcp', () => { })
    }
}))

import { createHttpApp } from '../../src/http/server'

describe('createHttpApp', () => {
    it('awaits and registers /mcp routes via registerMcpHttp', async () => {
        const app: any = await createHttpApp()
        const routes = (app as any)._router?.stack?.filter((l: any) => l.route).map((l: any) => l.route.path)
        expect(routes).toContain('/mcp')
    })
})