import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the tool layer and the admin resolver so we can assert the controller's
// draft-gating logic in isolation (no DB, no JWKS).
vi.mock('../../src/tools/local.js', () => ({ callTool: vi.fn() }))
vi.mock('../../src/auth/optional-admin.js', () => ({
    requestIsAdmin: vi.fn(),
}))

import { requestIsAdmin } from '../../src/auth/optional-admin.js'
import { ArticlesController } from '../../src/http/controllers/ArticlesController'
import { callTool } from '../../src/tools/local.js'

const mockCallTool = callTool as unknown as ReturnType<typeof vi.fn>
const mockIsAdmin = requestIsAdmin as unknown as ReturnType<typeof vi.fn>
const req = () => ({ headers: {} }) as any

describe('ArticlesController draft gating (#120)', () => {
    beforeEach(() => {
        mockCallTool.mockReset()
        mockIsAdmin.mockReset()
        mockCallTool.mockResolvedValue({ articles: [], total: 0 })
    })

    it('forces published-only for a non-admin requesting all', async () => {
        mockIsAdmin.mockResolvedValue(false)
        await new ArticlesController().listArticles(req(), 'all')
        expect(mockCallTool).toHaveBeenCalledWith(
            'list-articles',
            expect.objectContaining({ status: 'published' }),
        )
    })

    it('honors status=all for an admin', async () => {
        mockIsAdmin.mockResolvedValue(true)
        await new ArticlesController().listArticles(req(), 'all')
        expect(mockCallTool).toHaveBeenCalledWith(
            'list-articles',
            expect.objectContaining({ status: 'all' }),
        )
    })

    it('defaults to published without checking admin when no draft is requested', async () => {
        await new ArticlesController().listArticles(req())
        expect(mockCallTool).toHaveBeenCalledWith(
            'list-articles',
            expect.objectContaining({ status: 'published' }),
        )
        expect(mockIsAdmin).not.toHaveBeenCalled()
    })

    it('getArticle: a non-admin draft request stays published and 404s a hidden draft', async () => {
        mockIsAdmin.mockResolvedValue(false)
        mockCallTool.mockRejectedValueOnce(new Error('Article not found'))
        await expect(
            new ArticlesController().getArticle(req(), 'secret', 'draft'),
        ).rejects.toMatchObject({ status: 404 })
        expect(mockCallTool).toHaveBeenCalledWith('get-article', {
            slug: 'secret',
            status: 'published',
        })
    })

    it('getArticle: an admin can request all statuses', async () => {
        mockIsAdmin.mockResolvedValue(true)
        mockCallTool.mockResolvedValueOnce({ slug: 'd', status: 'draft' })
        const res = await new ArticlesController().getArticle(req(), 'd', 'all')
        expect(res).toMatchObject({ slug: 'd' })
        expect(mockCallTool).toHaveBeenCalledWith('get-article', {
            slug: 'd',
            status: 'all',
        })
    })

    it('createArticle validates required fields', async () => {
        await expect(
            new ArticlesController().createArticle({
                slug: '',
                title: 't',
                body: 'b',
            } as any),
        ).rejects.toMatchObject({ status: 400 })
    })
})
