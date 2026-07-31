import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the DB module so the deep check is deterministic without a real Postgres.
vi.mock('../../src/db/index.js', () => ({
    initPrisma: vi.fn(async () => {}),
    prisma: { $queryRaw: vi.fn() },
}))

// Migration status is covered in depth in test/db/migration-status.test.ts;
// here we only drive its outcomes to check how health reports them.
vi.mock('../../src/db/migration-status.js', () => ({
    getMigrationStatus: vi.fn(async () => ({ checked: true, pending: [] })),
}))

import { config } from '../../src/config.js'
import { initPrisma, prisma } from '../../src/db/index.js'
import { getMigrationStatus } from '../../src/db/migration-status.js'
import { registerHealthRoute } from '../../src/http/health-route'

const mockQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>
const mockInitPrisma = initPrisma as unknown as ReturnType<typeof vi.fn>
const mockMigrationStatus = getMigrationStatus as unknown as ReturnType<
    typeof vi.fn
>

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

describe('GET /healthz?deep=1 capability reporting (#155)', () => {
    const ORIGINAL_GITHUB_TOKEN = config.github.token
    const setGithubToken = (t: string | undefined) => {
        ;(config as any).github.token = t
    }

    beforeEach(() => {
        mockQueryRaw.mockReset()
        mockInitPrisma.mockClear()
        setDbUrl(undefined)
    })
    afterEach(() => {
        setDbUrl(ORIGINAL_DB_URL)
        setGithubToken(ORIGINAL_GITHUB_TOKEN)
    })

    it('reports github: false when GITHUB_TOKEN is unset', async () => {
        setGithubToken(undefined)
        const res = await request(makeApp()).get('/healthz?deep=1').expect(200)
        expect(res.body.capabilities).toMatchObject({ github: false })
    })

    it('reports github: true when GITHUB_TOKEN is set', async () => {
        setGithubToken('ghp_test')
        const res = await request(makeApp()).get('/healthz?deep=1').expect(200)
        expect(res.body.capabilities).toMatchObject({ github: true })
    })

    it('stays 200 with a missing capability — degraded is not unhealthy', async () => {
        setGithubToken(undefined)
        await request(makeApp()).get('/healthz?deep=1').expect(200)
    })

    it('still reports capabilities alongside a 503 DB failure', async () => {
        setDbUrl('postgres://example')
        setGithubToken(undefined)
        mockQueryRaw.mockRejectedValueOnce(new Error('connection refused'))
        const res = await request(makeApp()).get('/healthz?deep=1').expect(503)
        expect(res.body).toMatchObject({ status: 'degraded', db: 'error' })
        expect(res.body.capabilities).toMatchObject({ github: false })
    })

    it('keeps the shallow probe free of capability detail (Render gate stays minimal)', async () => {
        setGithubToken(undefined)
        const res = await request(makeApp()).get('/healthz').expect(200)
        expect(res.body).not.toHaveProperty('capabilities')
    })
})

// The production condition this exists for: migrations merged and deployed but
// never applied, for a month, with nothing reporting it.
describe('GET /healthz?deep=1 unapplied-migration gate', () => {
    beforeEach(() => {
        mockQueryRaw.mockReset()
        mockInitPrisma.mockClear()
        setDbUrl(undefined)
        mockMigrationStatus.mockClear()
        mockMigrationStatus.mockResolvedValue({ checked: true, pending: [] })
    })
    afterEach(() => {
        setDbUrl(ORIGINAL_DB_URL)
        mockMigrationStatus.mockResolvedValue({ checked: true, pending: [] })
    })

    it('returns 503 degraded when migrations are unapplied', async () => {
        mockMigrationStatus.mockResolvedValue({
            checked: true,
            pending: ['20260703_resume', '20260731_profile'],
        })
        const res = await request(makeApp()).get('/healthz?deep=1').expect(503)
        expect(res.body.status).toBe('degraded')
        expect(res.body.migrations.pending).toBe(2)
        // Name them: "2 pending" is not actionable at 11pm, the names are.
        expect(res.body.migrations.names).toEqual([
            '20260703_resume',
            '20260731_profile',
        ])
    })

    it('returns 200 with pending: 0 when the schema is up to date', async () => {
        const res = await request(makeApp()).get('/healthz?deep=1').expect(200)
        expect(res.body.migrations).toEqual({ pending: 0 })
    })

    // Unverifiable must not read as verified-clean.
    it('reports pending: null with a reason when the check could not run', async () => {
        mockMigrationStatus.mockResolvedValue({
            checked: false,
            pending: [],
            reason: 'no database client',
        })
        const res = await request(makeApp()).get('/healthz?deep=1').expect(200)
        expect(res.body.migrations.pending).toBeNull()
        expect(res.body.migrations.reason).toBe('no database client')
    })

    it('leaves the shallow probe unaffected (Render must not flap on this)', async () => {
        mockMigrationStatus.mockResolvedValue({
            checked: true,
            pending: ['20260731_profile'],
        })
        const res = await request(makeApp()).get('/healthz').expect(200)
        expect(res.body).not.toHaveProperty('migrations')
        expect(mockMigrationStatus).not.toHaveBeenCalled()
    })
})
