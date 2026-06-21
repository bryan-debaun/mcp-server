import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { GetArticleInputSchema } from './schemas.js'
import { statusFilter } from './status.js'

const name = 'get-article'
const config = {
    title: 'Get Article',
    description:
        'Get an article by slug. Returns only published unless an admin context requests drafts.',
    inputSchema: GetArticleInputSchema,
}

export function registerGetArticleTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { slug, status } = args
                const article = await prisma.article.findUnique({
                    where: { slug },
                })
                if (!article) return createErrorResult('Article not found')

                // Hide drafts from non-admin reads: a published-only filter must
                // 404 a draft rather than leak its existence.
                const filter = statusFilter(status)
                if (filter.status && article.status !== filter.status) {
                    return createErrorResult('Article not found')
                }

                return createSuccessResult(article)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
