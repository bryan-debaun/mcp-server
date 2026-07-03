import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the shared prisma object's `resumeDownloadRequest` model so tool handlers
// are deterministic without a database (mirrors the no-op stub contract).
vi.mock('../../../../src/db/index', () => ({
    prisma: {
        resumeDownloadRequest: {
            count: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}))

import { prisma } from '../../../../src/db/index.js'
import { registerApproveResumeDownloadRequestTool } from '../../../../src/tools/db/resume-download-requests/approve-resume-download-request.js'
import { registerCreateResumeDownloadRequestTool } from '../../../../src/tools/db/resume-download-requests/create-resume-download-request.js'
import { registerDenyResumeDownloadRequestTool } from '../../../../src/tools/db/resume-download-requests/deny-resume-download-request.js'
import { registerFulfillResumeDownloadRequestTool } from '../../../../src/tools/db/resume-download-requests/fulfill-resume-download-request.js'
import { registerGetResumeDownloadRequestTool } from '../../../../src/tools/db/resume-download-requests/get-resume-download-request.js'
import { registerListResumeDownloadRequestsTool } from '../../../../src/tools/db/resume-download-requests/list-resume-download-requests.js'

const rdr = (prisma as any).resumeDownloadRequest as Record<
    string,
    ReturnType<typeof vi.fn>
>

const handlers = new Map<string, (args: any) => Promise<any>>()
const fake: any = {
    registerTool: (name: string, _cfg: any, handler: any) =>
        handlers.set(name, handler),
}

const call = async (name: string, args: any) => {
    const res = await handlers.get(name)!(args)
    const text = res.content[0].text
    let data: any
    try {
        data = JSON.parse(text)
    } catch {
        data = text // error results carry a plain "Error: ..." string
    }
    return { isError: !!res.isError, data }
}

const future = () => new Date(Date.now() + 60 * 60 * 1000)
const past = () => new Date(Date.now() - 60 * 60 * 1000)

beforeAll(() => {
    registerCreateResumeDownloadRequestTool(fake)
    registerListResumeDownloadRequestsTool(fake)
    registerGetResumeDownloadRequestTool(fake)
    registerApproveResumeDownloadRequestTool(fake)
    registerDenyResumeDownloadRequestTool(fake)
    registerFulfillResumeDownloadRequestTool(fake)
})

beforeEach(() => {
    for (const fn of Object.values(rdr)) fn.mockReset()
})

describe('resume-download-request tools — create (quota)', () => {
    it('creates a pending request when under quota', async () => {
        rdr.count.mockResolvedValueOnce(2)
        rdr.create.mockImplementation(async ({ data }: any) => ({
            id: 'r1',
            ...data,
        }))
        const { isError, data } = await call('create-resume-download-request', {
            userId: 'u1',
            userEmail: 'u1@example.com',
            reason: 'applying',
        })
        expect(isError).toBe(false)
        expect(data.status).toBe('pending')
        expect(data.userId).toBe('u1')
        // Quota counts this user's requests within a trailing window.
        const where = rdr.count.mock.calls[0][0].where
        expect(where.userId).toBe('u1')
        expect(where.createdAt.gte).toBeInstanceOf(Date)
    })

    it('rejects with a quota error at the limit (3 in 30 days)', async () => {
        rdr.count.mockResolvedValueOnce(3)
        const { isError, data } = await call('create-resume-download-request', {
            userId: 'u1',
            userEmail: 'u1@example.com',
        })
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/quota exceeded/i)
        expect(rdr.create).not.toHaveBeenCalled()
    })
})

describe('resume-download-request tools — list (lazy expiry)', () => {
    it('filters by stored status and maps an expired-approved row on output', async () => {
        rdr.findMany.mockResolvedValueOnce([
            { id: 'a', status: 'approved', expiresAt: past() },
            { id: 'b', status: 'pending', expiresAt: null },
        ])
        const { data } = await call('list-resume-download-requests', {
            status: 'approved',
        })
        expect(rdr.findMany.mock.calls[0][0].where).toMatchObject({
            status: 'approved',
        })
        expect(data.requests[0].status).toBe('expired') // approved + past window
        expect(data.requests[1].status).toBe('pending')
    })

    it('applies no status filter for status=all', async () => {
        rdr.findMany.mockResolvedValueOnce([])
        await call('list-resume-download-requests', { status: 'all' })
        expect(rdr.findMany.mock.calls[0][0].where.status).toBeUndefined()
    })
})

describe('resume-download-request tools — get', () => {
    it('404s a missing request', async () => {
        rdr.findUnique.mockResolvedValueOnce(null)
        const { isError, data } = await call('get-resume-download-request', {
            id: 'nope',
        })
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/not found/i)
    })

    it('reports an approved-but-expired request as expired', async () => {
        rdr.findUnique.mockResolvedValueOnce({
            id: 'x',
            status: 'approved',
            expiresAt: past(),
        })
        const { data } = await call('get-resume-download-request', { id: 'x' })
        expect(data.status).toBe('expired')
    })
})

describe('resume-download-request tools — approve/deny', () => {
    it('approve sets approvedAt + a 72h window on a pending request', async () => {
        rdr.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'pending' })
        rdr.update.mockImplementation(async ({ data }: any) => ({
            id: 'r1',
            ...data,
        }))
        const { data } = await call('approve-resume-download-request', {
            id: 'r1',
        })
        expect(data.status).toBe('approved')
        const window =
            new Date(data.expiresAt).getTime() -
            new Date(data.approvedAt).getTime()
        expect(window).toBe(72 * 60 * 60 * 1000)
    })

    it('approve rejects a non-pending request', async () => {
        rdr.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'approved' })
        const { isError, data } = await call(
            'approve-resume-download-request',
            { id: 'r1' },
        )
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/cannot approve/i)
        expect(rdr.update).not.toHaveBeenCalled()
    })

    it('deny marks a pending request denied', async () => {
        rdr.findUnique.mockResolvedValueOnce({ id: 'r1', status: 'pending' })
        rdr.update.mockImplementation(async ({ data }: any) => ({
            id: 'r1',
            ...data,
        }))
        const { data } = await call('deny-resume-download-request', {
            id: 'r1',
            adminNote: 'no',
        })
        expect(data.status).toBe('denied')
        expect(data.adminNote).toBe('no')
    })
})

describe('resume-download-request tools — fulfill (owner + window)', () => {
    it('404s when the request belongs to another user', async () => {
        rdr.findUnique.mockResolvedValueOnce({
            id: 'r1',
            userId: 'someone-else',
            status: 'approved',
            expiresAt: future(),
        })
        const { isError, data } = await call(
            'fulfill-resume-download-request',
            { id: 'r1', userId: 'u1' },
        )
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/not found/i)
        expect(rdr.update).not.toHaveBeenCalled()
    })

    it('rejects a request that is not approved', async () => {
        rdr.findUnique.mockResolvedValueOnce({
            id: 'r1',
            userId: 'u1',
            status: 'pending',
            expiresAt: future(),
        })
        const { isError, data } = await call(
            'fulfill-resume-download-request',
            { id: 'r1', userId: 'u1' },
        )
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/not approved/i)
    })

    it('rejects once the download window has expired', async () => {
        rdr.findUnique.mockResolvedValueOnce({
            id: 'r1',
            userId: 'u1',
            status: 'approved',
            expiresAt: past(),
        })
        const { isError, data } = await call(
            'fulfill-resume-download-request',
            { id: 'r1', userId: 'u1' },
        )
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/window has expired/i)
    })

    it('records a download: increments count and flips to fulfilled', async () => {
        rdr.findUnique.mockResolvedValueOnce({
            id: 'r1',
            userId: 'u1',
            status: 'approved',
            expiresAt: future(),
        })
        rdr.update.mockImplementation(async ({ data }: any) => ({
            id: 'r1',
            userId: 'u1',
            ...data,
        }))
        const { isError, data } = await call(
            'fulfill-resume-download-request',
            { id: 'r1', userId: 'u1' },
        )
        expect(isError).toBe(false)
        expect(data.status).toBe('fulfilled')
        const arg = rdr.update.mock.calls[0][0]
        expect(arg.where).toEqual({ id: 'r1' })
        expect(arg.data.downloadCount).toEqual({ increment: 1 })
    })
})
