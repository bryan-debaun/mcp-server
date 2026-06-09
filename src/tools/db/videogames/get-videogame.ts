import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { GetVideoGameInputSchema } from './schemas.js'

const name = 'get-videogame'
const config = {
    title: 'Get VideoGame',
    description: 'Get a video game by ID (public)',
    inputSchema: GetVideoGameInputSchema,
}

export function registerGetVideoGameTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args
                const game = await prisma.videoGame.findUnique({
                    where: { id },
                })
                if (!game) return createErrorResult('VideoGame not found')
                return createSuccessResult(game)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
