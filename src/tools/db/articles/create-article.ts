import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { CreateArticleInputSchema } from './schemas.js'

const name = 'create-article'
const config = {
    title: 'Create Article',
    description: 'Create a new article (admin only)',
    inputSchema: CreateArticleInputSchema,
}

export function registerCreateArticleTool(server: McpServer): void {
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
                } = args
                const finalStatus = status ?? 'draft'

                const article = await prisma.article.create({
                    data: {
                        slug,
                        title,
                        summary,
                        body,
                        status: finalStatus,
                        tags: tags ?? [],
                        // Stamp publishedAt when publishing without an explicit date.
                        publishedAt: publishedAt
                            ? new Date(publishedAt)
                            : finalStatus === 'published'
                              ? new Date()
                              : null,
                    },
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
