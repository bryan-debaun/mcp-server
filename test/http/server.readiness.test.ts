import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { startHttpServer } from '../../src/http/server'
import * as db from '../../src/db/index'
import { resetReady } from '../../src/http/readiness'

describe('startHttpServer readiness', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        resetReady()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns 503 on /readyz until db init completes', async () => {
        // Mock initPrisma to delay
        const wait = () => new Promise((r) => setTimeout(r, 150))
        const initMock = vi.spyOn(db, 'initPrisma').mockImplementation(async () => { await wait(); })

        // Start server with earlyStart to ensure it binds immediately while db init is delayed
        const srv = await startHttpServer(0, '127.0.0.1', { earlyStart: true })
        const addr = srv.address() as any
        const port = addr.port

        // Immediately check readiness - should be 503
        const res1 = await request(`http://127.0.0.1:${port}`).get('/readyz')
        expect(res1.status).toBe(503)

        // Wait for init to finish and background registration to set readiness
        await new Promise((r) => setTimeout(r, 200))
        const res2 = await request(`http://127.0.0.1:${port}`).get('/readyz')
        expect(res2.status).toBe(200)

        srv.close()
        initMock.mockRestore()
    })
})