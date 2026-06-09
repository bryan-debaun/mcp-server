import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { DeleteMovieInputSchema } from './schemas.js'

const name = 'delete-movie'
const config = {
    title: 'Delete Movie',
    description: 'Delete a movie (admin only)',
    inputSchema: DeleteMovieInputSchema,
}

export function registerDeleteMovieTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args
                const movie = await prisma.movie.delete({ where: { id } })
                return createSuccessResult({
                    message: 'Movie deleted successfully',
                    movie,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
