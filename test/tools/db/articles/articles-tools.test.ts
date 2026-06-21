import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the shared prisma object's `article` model so tool handlers are
// deterministic without a database (mirrors the no-op stub contract). The mock
// fns are created inside the factory (vi.mock is hoisted) and read back below.
vi.mock('../../../../src/db/index', () => ({
    prisma: {
        article: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}))

import { prisma } from '../../../../src/db/index.js'
import { registerCreateArticleTool } from '../../../../src/tools/db/articles/create-article.js'
import { registerDeleteArticleTool } from '../../../../src/tools/db/articles/delete-article.js'
import { registerGetArticleTool } from '../../../../src/tools/db/articles/get-article.js'
import { registerListArticlesTool } from '../../../../src/tools/db/articles/list-articles.js'
import { registerUpdateArticleTool } from '../../../../src/tools/db/articles/update-article.js'

const article = (prisma as any).article as Record<
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

beforeAll(() => {
    registerCreateArticleTool(fake)
    registerUpdateArticleTool(fake)
    registerDeleteArticleTool(fake)
    registerGetArticleTool(fake)
    registerListArticlesTool(fake)
})

beforeEach(() => {
    for (const fn of Object.values(article)) fn.mockReset()
})

describe('article tools — create-article', () => {
    it('stamps publishedAt when publishing without an explicit date', async () => {
        article.create.mockImplementation(async ({ data }: any) => ({
            id: 1,
            ...data,
        }))
        const { data } = await call('create-article', {
            slug: 's',
            title: 't',
            body: 'b',
            status: 'published',
        })
        expect(data.status).toBe('published')
        expect(data.publishedAt).toBeTruthy()
        expect(data.tags).toEqual([])
    })

    it('defaults to draft with no publishedAt', async () => {
        article.create.mockImplementation(async ({ data }: any) => ({
            id: 1,
            ...data,
        }))
        const { data } = await call('create-article', {
            slug: 's',
            title: 't',
            body: 'b',
        })
        expect(data.status).toBe('draft')
        expect(data.publishedAt).toBeNull()
    })

    it('surfaces an error result when the write fails (stub throws)', async () => {
        article.create.mockRejectedValueOnce(
            new Error('DATABASE_URL not configured'),
        )
        const res = await handlers.get('create-article')!({
            slug: 's',
            title: 't',
            body: 'b',
        })
        expect(res.isError).toBe(true)
    })
})

describe('article tools — list-articles (published-only by default)', () => {
    it('filters to published when no status is given', async () => {
        article.findMany.mockResolvedValueOnce([])
        await call('list-articles', {})
        expect(article.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { status: 'published' } }),
        )
    })

    it('returns both statuses for status=all (no status filter)', async () => {
        article.findMany.mockResolvedValueOnce([])
        await call('list-articles', { status: 'all' })
        const where = article.findMany.mock.calls[0][0].where
        expect(where.status).toBeUndefined()
    })

    it('filters by tag', async () => {
        article.findMany.mockResolvedValueOnce([])
        await call('list-articles', { tag: 'philosophy' })
        const where = article.findMany.mock.calls[0][0].where
        expect(where.tags).toEqual({ has: 'philosophy' })
    })
})

describe('article tools — get-article (visibility)', () => {
    it('hides a draft from a published-only read (404)', async () => {
        article.findUnique.mockResolvedValueOnce({ slug: 'd', status: 'draft' })
        const { isError, data } = await call('get-article', { slug: 'd' })
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/not found/i)
    })

    it('returns a draft when status=all (admin context)', async () => {
        article.findUnique.mockResolvedValueOnce({ slug: 'd', status: 'draft' })
        const { isError, data } = await call('get-article', {
            slug: 'd',
            status: 'all',
        })
        expect(isError).toBe(false)
        expect(data.slug).toBe('d')
    })

    it('returns a published article on a default read', async () => {
        article.findUnique.mockResolvedValueOnce({
            slug: 'p',
            status: 'published',
        })
        const { isError, data } = await call('get-article', { slug: 'p' })
        expect(isError).toBe(false)
        expect(data.slug).toBe('p')
    })

    it('404s a missing article', async () => {
        article.findUnique.mockResolvedValueOnce(null)
        const { isError } = await call('get-article', { slug: 'nope' })
        expect(isError).toBe(true)
    })
})

describe('article tools — update/delete', () => {
    it('update maps fields and renames via newSlug', async () => {
        article.update.mockImplementation(async ({ data }: any) => ({
            id: 1,
            ...data,
        }))
        await call('update-article', {
            slug: 'old',
            title: 'New',
            newSlug: 'new',
        })
        const arg = article.update.mock.calls[0][0]
        expect(arg.where).toEqual({ slug: 'old' })
        expect(arg.data).toMatchObject({ title: 'New', slug: 'new' })
    })

    it('delete removes by slug', async () => {
        article.delete.mockResolvedValueOnce({ id: 1, slug: 'x' })
        const { isError } = await call('delete-article', { slug: 'x' })
        expect(isError).toBe(false)
        expect(article.delete).toHaveBeenCalledWith({ where: { slug: 'x' } })
    })
})
