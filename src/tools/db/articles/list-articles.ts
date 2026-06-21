import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { ListArticlesInputSchema } from './schemas.js'
import { statusFilter } from './status.js'

const name = 'list-articles'
const config = {
    title: 'List Articles',
    description:
        'List articles. Returns only published unless an admin context requests drafts.',
    inputSchema: ListArticlesInputSchema,
}

export function registerListArticlesTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { status, tag, search, limit = 50, offset = 0 } = args

                const where: any = { ...statusFilter(status) }
                if (tag) where.tags = { has: tag }
                if (search)
                    where.OR = [
                        { title: { contains: search, mode: 'insensitive' } },
                        { summary: { contains: search, mode: 'insensitive' } },
                    ]

                const articles = await prisma.article.findMany({
                    where,
                    take: limit,
                    skip: offset,
                    // Newest published first; fall back to creation order.
                    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
                })

                return createSuccessResult({
                    articles,
                    total: articles.length,
                    limit,
                    offset,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
