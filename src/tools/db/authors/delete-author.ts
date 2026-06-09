import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { DeleteAuthorInputSchema } from './schemas.js'

const name = 'delete-author'
const config = {
    title: 'Delete Author',
    description:
        'Delete an author (cascades to book associations) (admin only)',
    inputSchema: DeleteAuthorInputSchema,
}

export function registerDeleteAuthorTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args

                const author = await prisma.author.delete({
                    where: { id },
                })

                return createSuccessResult({
                    message: 'Author deleted successfully',
                    author,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
