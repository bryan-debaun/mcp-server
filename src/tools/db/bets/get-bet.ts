import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { GetBetInputSchema } from './schemas.js'

const name = 'get-bet'
const config = {
    title: 'Get Bet',
    description: 'Get a bet by id',
    inputSchema: GetBetInputSchema,
}

export function registerGetBetTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const bet = await prisma.bet.findUnique({
                    where: { id: args.id },
                })
                if (!bet) return createErrorResult('Bet not found')
                return createSuccessResult(bet)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
