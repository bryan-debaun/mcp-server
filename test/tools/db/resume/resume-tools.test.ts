import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the shared prisma object's `resume` model so tool handlers are
// deterministic without a database (mirrors the no-op stub contract).
vi.mock('../../../../src/db/index', () => ({
    prisma: {
        resume: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
    },
}))

import { prisma } from '../../../../src/db/index.js'
import { registerGetResumeTool } from '../../../../src/tools/db/resume/get-resume.js'
import { registerUpdateResumeTool } from '../../../../src/tools/db/resume/update-resume.js'

const resume = (prisma as any).resume as Record<
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
        data = text
    }
    return { isError: !!res.isError, data }
}

const withPrivate = () => ({
    document: {
        basics: {
            name: 'Bryan',
            summary: 'Engineer',
            privateContact: { email: 'me@example.com', phone: '555-1234' },
        },
        work: [],
    },
    updatedAt: new Date('2026-07-03T00:00:00Z'),
})

beforeAll(() => {
    registerGetResumeTool(fake)
    registerUpdateResumeTool(fake)
})

beforeEach(() => {
    for (const fn of Object.values(resume)) fn.mockReset()
})

describe('resume tools — get-resume (private-contact stripping #147)', () => {
    it('404s when the singleton row does not exist', async () => {
        resume.findUnique.mockResolvedValueOnce(null)
        const { isError, data } = await call('get-resume', {})
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/not found/i)
    })

    it('strips basics.privateContact on a public read (default)', async () => {
        resume.findUnique.mockResolvedValueOnce(withPrivate())
        const { isError, data } = await call('get-resume', {})
        expect(isError).toBe(false)
        expect(data.document.basics.name).toBe('Bryan') // other fields preserved
        expect(data.document.basics.privateContact).toBeUndefined()
    })

    it('does not mutate the stored row while stripping', async () => {
        const row = withPrivate()
        resume.findUnique.mockResolvedValueOnce(row)
        await call('get-resume', {})
        // The source document still has its private contact (deep-cloned before strip).
        expect(row.document.basics.privateContact).toEqual({
            email: 'me@example.com',
            phone: '555-1234',
        })
    })

    it('includes privateContact when includePrivate=true', async () => {
        resume.findUnique.mockResolvedValueOnce(withPrivate())
        const { data } = await call('get-resume', { includePrivate: true })
        expect(data.document.basics.privateContact).toEqual({
            email: 'me@example.com',
            phone: '555-1234',
        })
    })
})

describe('resume tools — update-resume (upsert + validation)', () => {
    it('upserts the singleton (id=1) with a valid document', async () => {
        resume.upsert.mockImplementation(async ({ create, update }: any) => ({
            id: 1,
            document: update?.document ?? create?.document,
            updatedAt: new Date(),
        }))
        const doc = {
            basics: { name: 'Bryan' },
            work: [],
            education: [],
            skills: [],
            projects: [],
        }
        const { isError, data } = await call('update-resume', { document: doc })
        expect(isError).toBe(false)
        expect(data.document.basics.name).toBe('Bryan')
        const arg = resume.upsert.mock.calls[0][0]
        expect(arg.where).toEqual({ id: 1 })
        expect(arg.create.id).toBe(1)
    })

    it('rejects a document missing basics.name (top-level shape)', async () => {
        const { isError, data } = await call('update-resume', {
            document: { basics: {}, work: [] },
        })
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/invalid resume document/i)
        expect(resume.upsert).not.toHaveBeenCalled()
    })

    it('rejects a document with a non-array work section', async () => {
        const { isError, data } = await call('update-resume', {
            document: { basics: { name: 'B' }, work: 'nope' },
        })
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/invalid resume document/i)
    })
})
