import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { DeleteArticleInputSchema } from './schemas.js'

const name = 'delete-article'
const config = {
    title: 'Delete Article',
    description: 'Delete an article by slug (admin only)',
    inputSchema: DeleteArticleInputSchema,
}

export function registerDeleteArticleTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { slug } = args
                const article = await prisma.article.delete({
                    where: { slug },
                })
                return createSuccessResult({
                    message: 'Article deleted successfully',
                    article,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
