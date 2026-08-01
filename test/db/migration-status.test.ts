import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/db/index.js', () => ({
    prisma: { $queryRaw: vi.fn() },
}))

vi.mock('node:fs', async (orig) => {
    const actual = await orig<typeof import('node:fs')>()
    return { ...actual, readdirSync: vi.fn() }
})

import { readdirSync } from 'node:fs'
import { prisma } from '../../src/db/index.js'
import { getMigrationStatus } from '../../src/db/migration-status.js'

const mockQuery = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>
const mockReaddir = readdirSync as unknown as ReturnType<typeof vi.fn>

/** `readdirSync(..., { withFileTypes: true })` shape. */
const dirs = (...names: string[]) =>
    names.map((name) => ({ name, isDirectory: () => true }))

beforeEach(() => {
    mockQuery.mockReset()
    mockReaddir.mockReset()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('getMigrationStatus', () => {
    it('reports no pending migrations when disk and DB agree', async () => {
        mockReaddir.mockReturnValue(dirs('20260101_a', '20260102_b'))
        mockQuery.mockResolvedValue([
            { migration_name: '20260101_a' },
            { migration_name: '20260102_b' },
        ])

        expect(await getMigrationStatus()).toEqual({
            checked: true,
            pending: [],
        })
    })

    // The exact production condition: migrations merged and shipped, never applied.
    it('reports migrations present on disk but missing from the database', async () => {
        mockReaddir.mockReturnValue(
            dirs('20260101_a', '20260703_resume', '20260731_profile'),
        )
        mockQuery.mockResolvedValue([{ migration_name: '20260101_a' }])

        const status = await getMigrationStatus()
        expect(status.checked).toBe(true)
        expect(status.pending).toEqual(['20260703_resume', '20260731_profile'])
    })

    it('treats an unfinished/rolled-back migration as pending via the SQL filter', async () => {
        mockReaddir.mockReturnValue(dirs('20260101_a'))
        mockQuery.mockResolvedValue([]) // filtered out by finished_at/rolled_back_at
        const status = await getMigrationStatus()
        expect(status.pending).toEqual(['20260101_a'])

        const sql = String(mockQuery.mock.calls[0][0])
        expect(sql).toContain('finished_at IS NOT NULL')
        expect(sql).toContain('rolled_back_at IS NULL')
    })

    // Never claim a clean schema we failed to verify â€” that is the silent
    // success this module exists to prevent.
    it('reports checked:false (not "no pending") when the query fails', async () => {
        mockReaddir.mockReturnValue(dirs('20260101_a'))
        mockQuery.mockRejectedValue(new Error('connection refused'))

        const status = await getMigrationStatus()
        expect(status.checked).toBe(false)
        expect(status.pending).toEqual([])
        expect(status.reason).toContain('connection refused')
    })

    it('reports checked:false when the migrations directory is unreadable', async () => {
        mockReaddir.mockImplementation(() => {
            throw new Error('ENOENT')
        })
        const status = await getMigrationStatus()
        expect(status.checked).toBe(false)
        expect(status.reason).toContain('ENOENT')
    })

    it('reports checked:false against the DB-less stub client', async () => {
        ;(prisma as any).$queryRaw = undefined
        const status = await getMigrationStatus()
        expect(status).toMatchObject({
            checked: false,
            reason: 'no database client',
        })
        ;(prisma as any).$queryRaw = mockQuery
    })

    it('ignores non-directory entries in the migrations folder', async () => {
        mockReaddir.mockReturnValue([
            { name: '20260101_a', isDirectory: () => true },
            { name: 'migration_lock.toml', isDirectory: () => false },
        ])
        mockQuery.mockResolvedValue([{ migration_name: '20260101_a' }])
        expect((await getMigrationStatus()).pending).toEqual([])
    })
})
