import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { GetAuthorInputSchema } from './schemas.js'

const name = 'get-author'
const config = {
    title: 'Get Author',
    description: 'Get an author by ID with their books (public)',
    inputSchema: GetAuthorInputSchema,
}

export function registerGetAuthorTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args

                const author = await prisma.author.findUnique({
                    where: { id },
                    include: {
                        books: {
                            include: {
                                book: true,
                            },
                        },
                    },
                })

                if (!author) {
                    return createErrorResult('Author not found')
                }

                // Return author with embedded book ratings
                return createSuccessResult(author)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
