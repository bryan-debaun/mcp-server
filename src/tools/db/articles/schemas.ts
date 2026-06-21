// Input schemas for article-related MCP tools
import { z } from 'zod'

const ArticleStatusEnum = z.enum(['draft', 'published'])

/** Read filter: which statuses a list/get may return. `all` = both. */
export const ArticleReadStatusEnum = z.enum(['draft', 'published', 'all'])

export const CreateArticleInputSchema = {
    slug: z.string().describe('URL slug (unique, e.g. "cptsd")'),
    title: z.string().describe('Article title'),
    summary: z.string().optional().describe('Short summary / excerpt'),
    body: z.string().describe('Article body (Markdown source)'),
    status: ArticleStatusEnum.optional().describe(
        'Publication status (draft | published); defaults to draft',
    ),
    tags: z.array(z.string()).optional().describe('Tags'),
    publishedAt: z
        .string()
        .optional()
        .describe('Publication date (ISO 8601); set when publishing'),
}

export const UpdateArticleInputSchema = {
    slug: z.string().describe('Slug of the article to update'),
    title: z.string().optional().describe('Article title'),
    summary: z.string().optional().describe('Short summary / excerpt'),
    body: z.string().optional().describe('Article body (Markdown source)'),
    status: ArticleStatusEnum.optional().describe(
        'Publication status (draft | published)',
    ),
    tags: z.array(z.string()).optional().describe('Tags'),
    publishedAt: z.string().optional().describe('Publication date (ISO 8601)'),
    newSlug: z
        .string()
        .optional()
        .describe('Rename the slug (must stay unique)'),
}

export const DeleteArticleInputSchema = {
    slug: z.string().describe('Slug of the article to delete'),
}

export const GetArticleInputSchema = {
    slug: z.string().describe('Slug of the article to retrieve'),
    status: ArticleReadStatusEnum.optional().describe(
        'Visibility filter (default published). draft/all require admin context.',
    ),
}

export const ListArticlesInputSchema = {
    status: ArticleReadStatusEnum.optional().describe(
        'Visibility filter (default published). draft/all require admin context.',
    ),
    tag: z.string().optional().describe('Filter by a single tag'),
    search: z.string().optional().describe('Search in title and summary'),
    limit: z
        .number()
        .optional()
        .describe('Maximum number of results (default 50)'),
    offset: z
        .number()
        .optional()
        .describe('Number of results to skip (default 0)'),
}
