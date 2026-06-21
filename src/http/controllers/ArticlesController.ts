import type { Request as ExpressRequest } from 'express'
import {
    Body,
    Controller,
    Delete,
    Get,
    Path,
    Post,
    Put,
    Query,
    Request,
    Response,
    Route,
    Security,
    SuccessResponse,
    Tags,
} from 'tsoa'
import { requestIsAdmin } from '../../auth/optional-admin.js'
import { callTool } from '../../tools/local.js'
import { httpError, isNotFound, isUniqueViolation } from './_http-errors.js'

export type ArticleStatus = 'draft' | 'published'
/** Read visibility filter. `all` returns both; `draft`/`all` require admin. */
export type ArticleReadStatus = 'draft' | 'published' | 'all'

export interface Article {
    id: number
    slug: string
    title: string
    summary?: string | null
    body: string
    status: ArticleStatus
    tags: string[]
    publishedAt?: string | null
    createdAt: string
    updatedAt: string
}

export interface ListArticlesResponse {
    articles: Article[]
    total: number
}

export interface CreateArticleRequest {
    slug: string
    title: string
    body: string
    summary?: string
    status?: ArticleStatus
    tags?: string[]
    publishedAt?: string
}

export interface UpdateArticleRequest {
    title?: string
    body?: string
    summary?: string
    status?: ArticleStatus
    tags?: string[]
    publishedAt?: string
    newSlug?: string
}

/**
 * Article endpoints. Reads are gated by the MCP gateway key and return only
 * `published` by default; an admin Supabase JWT (presented alongside the key)
 * unlocks drafts via `?status=draft|all`. Writes require admin auth. See #120.
 */
@Route('api/articles')
@Tags('Articles')
export class ArticlesController extends Controller {
    /**
     * List articles (published-only unless an admin requests drafts).
     * @param status Visibility filter; `draft`/`all` require an admin JWT.
     * @param tag Filter by a single tag
     * @param search Search in title and summary
     * @param limit Maximum number of results (default 50)
     * @param offset Number of results to skip (default 0)
     */
    @Get()
    @Security('api_key')
    @SuccessResponse('200', 'Articles retrieved successfully')
    public async listArticles(
        @Request() request: ExpressRequest,
        @Query() status?: ArticleReadStatus,
        @Query() tag?: string,
        @Query() search?: string,
        @Query() limit?: number,
        @Query() offset?: number,
    ): Promise<ListArticlesResponse> {
        const effectiveStatus = await this.resolveReadStatus(request, status)
        const result = await callTool('list-articles', {
            status: effectiveStatus,
            tag,
            search,
            limit,
            offset,
        })
        return result as ListArticlesResponse
    }

    /**
     * Get an article by slug (published-only unless an admin requests drafts).
     * @param slug Article slug
     * @param status Visibility filter; `draft`/`all` require an admin JWT.
     */
    @Get('{slug}')
    @Security('api_key')
    @SuccessResponse('200', 'Article retrieved successfully')
    @Response('404', 'Article not found')
    public async getArticle(
        @Request() request: ExpressRequest,
        @Path() slug: string,
        @Query() status?: ArticleReadStatus,
    ): Promise<Article> {
        const effectiveStatus = await this.resolveReadStatus(request, status)
        try {
            const result = await callTool('get-article', {
                slug,
                status: effectiveStatus,
            })
            return result as Article
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Article not found')
            throw err
        }
    }

    /**
     * Create a new article (admin only).
     */
    @Post()
    @Security('jwt', ['admin'])
    @SuccessResponse('201', 'Article created successfully')
    @Response('400', 'Invalid request')
    @Response('401', 'Unauthorized')
    public async createArticle(
        @Body() body: CreateArticleRequest,
    ): Promise<Article> {
        if (!body.slug) throw httpError(400, 'slug is required')
        if (!body.title) throw httpError(400, 'title is required')
        if (!body.body) throw httpError(400, 'body is required')
        try {
            const result = await callTool('create-article', body)
            this.setStatus(201)
            return result as Article
        } catch (err: any) {
            if (isUniqueViolation(err))
                throw httpError(400, 'slug already exists')
            throw err
        }
    }

    /**
     * Update an article by slug (admin only).
     * @param slug Article slug
     */
    @Put('{slug}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Article updated successfully')
    @Response('400', 'Invalid request')
    @Response('404', 'Article not found')
    public async updateArticle(
        @Path() slug: string,
        @Body() body: UpdateArticleRequest,
    ): Promise<Article> {
        try {
            const result = await callTool('update-article', { ...body, slug })
            return result as Article
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Article not found')
            if (isUniqueViolation(err))
                throw httpError(400, 'slug already exists')
            throw err
        }
    }

    /**
     * Delete an article by slug (admin only).
     * @param slug Article slug
     */
    @Delete('{slug}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Article deleted successfully')
    @Response('404', 'Article not found')
    public async deleteArticle(
        @Path() slug: string,
    ): Promise<{ success: boolean }> {
        try {
            await callTool('delete-article', { slug })
            return { success: true }
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Article not found')
            throw err
        }
    }

    /**
     * Non-admin callers are always restricted to `published`, regardless of the
     * requested `status`. Only a valid admin JWT unlocks `draft`/`all`.
     */
    private async resolveReadStatus(
        request: ExpressRequest,
        requested?: ArticleReadStatus,
    ): Promise<ArticleReadStatus> {
        const wantsNonPublic = requested === 'draft' || requested === 'all'
        if (!wantsNonPublic) return 'published'
        return (await requestIsAdmin(request)) ? requested : 'published'
    }
}
