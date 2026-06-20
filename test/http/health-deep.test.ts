import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the DB module so the deep check is deterministic without a real Postgres.
vi.mock('../../src/db/index.js', () => ({
    initPrisma: vi.fn(async () => {}),
    prisma: { $queryRaw: vi.fn() },
}))

import { config } from '../../src/config.js'
import { initPrisma, prisma } from '../../src/db/index.js'
import { registerHealthRoute } from '../../src/http/health-route'

const mockQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>
const mockInitPrisma = initPrisma as unknown as ReturnType<typeof vi.fn>

const makeApp = () => {
    const app = express()
    registerHealthRoute(app)
    return app
}

const ORIGINAL_DB_URL = config.database.url
const setDbUrl = (url: string | undefined) => {
    ;(config as any).database.url = url
}

describe('GET /healthz?deep=1 (#119 keep-alive deep check)', () => {
    beforeEach(() => {
        mockQueryRaw.mockReset()
        mockInitPrisma.mockClear()
    })
    afterEach(() => {
        setDbUrl(ORIGINAL_DB_URL)
    })

    it('default /healthz stays dependency-free (no DB query, even with DB configured)', async () => {
        setDbUrl('postgres://example')
        const res = await request(makeApp()).get('/healthz').expect(200)
        expect(res.body).toMatchObject({ status: 'ok' })
        expect(res.body).not.toHaveProperty('db')
        expect(mockQueryRaw).not.toHaveBeenCalled()
    })

    it('skips the query and stays 200 when DATABASE_URL is unset', async () => {
        setDbUrl(undefined)
        const res = await request(makeApp()).get('/healthz?deep=1').expect(200)
        expect(res.body).toMatchObject({ status: 'ok', db: 'skipped' })
        expect(mockQueryRaw).not.toHaveBeenCalled()
        expect(mockInitPrisma).not.toHaveBeenCalled()
    })

    it('runs SELECT 1 and reports latency when DB is configured', async () => {
        setDbUrl('postgres://example')
        mockQueryRaw.mockResolvedValueOnce([{ ok: 1 }])
        const res = await request(makeApp()).get('/healthz?deep=1').expect(200)
        expect(res.body).toMatchObject({ status: 'ok', db: 'ok' })
        expect(typeof res.body.db_latency_ms).toBe('number')
        expect(mockQueryRaw).toHaveBeenCalledOnce()
        expect(mockInitPrisma).toHaveBeenCalledOnce()
    })

    it('returns 503 degraded when the configured DB query fails', async () => {
        setDbUrl('postgres://example')
        mockQueryRaw.mockRejectedValueOnce(new Error('connection refused'))
        const res = await request(makeApp()).get('/healthz?deep=1').expect(503)
        expect(res.body).toMatchObject({ status: 'degraded', db: 'error' })
    })

    it('also accepts deep=true', async () => {
        setDbUrl(undefined)
        const res = await request(makeApp())
            .get('/healthz?deep=true')
            .expect(200)
        expect(res.body).toMatchObject({ db: 'skipped' })
    })
})
