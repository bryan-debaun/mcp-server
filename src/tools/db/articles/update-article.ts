import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { UpdateArticleInputSchema } from './schemas.js'

const name = 'update-article'
const config = {
    title: 'Update Article',
    description: 'Update an existing article by slug (admin only)',
    inputSchema: UpdateArticleInputSchema,
}

export function registerUpdateArticleTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const {
                    slug,
                    title,
                    summary,
                    body,
                    status,
                    tags,
                    publishedAt,
                    newSlug,
                } = args

                const data: any = {}
                if (title !== undefined) data.title = title
                if (summary !== undefined) data.summary = summary
                if (body !== undefined) data.body = body
                if (tags !== undefined) data.tags = tags
                if (status !== undefined) data.status = status
                if (newSlug !== undefined) data.slug = newSlug
                if (publishedAt !== undefined)
                    data.publishedAt = publishedAt
                        ? new Date(publishedAt)
                        : null

                const article = await prisma.article.update({
                    where: { slug },
                    data,
                })
                return createSuccessResult(article)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
