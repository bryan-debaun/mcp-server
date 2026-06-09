import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { DeleteBookInputSchema } from './schemas.js'

const name = 'delete-book'
const config = {
    title: 'Delete Book',
    description:
        'Delete a book (cascades to ratings and author associations) (admin only)',
    inputSchema: DeleteBookInputSchema,
}

export function registerDeleteBookTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args

                const book = await prisma.book.delete({
                    where: { id },
                })

                return createSuccessResult({
                    message: 'Book deleted successfully',
                    book,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
