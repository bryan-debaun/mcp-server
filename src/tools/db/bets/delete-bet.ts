import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { DeleteBetInputSchema } from './schemas.js'

const name = 'delete-bet'
const config = {
    title: 'Delete Bet',
    description: 'Delete a bet by id (admin only)',
    inputSchema: DeleteBetInputSchema,
}

export function registerDeleteBetTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const bet = await prisma.bet.delete({ where: { id: args.id } })
                return createSuccessResult({
                    message: 'Bet deleted successfully',
                    bet,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
