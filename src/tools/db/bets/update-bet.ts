import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { UpdateBetInputSchema } from './schemas.js'

const name = 'update-bet'
const config = {
    title: 'Update Bet',
    description:
        'Update a bet by id — edit details or set closing line for CLV (admin only)',
    inputSchema: UpdateBetInputSchema,
}

export function registerUpdateBetTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id, ...fields } = args
                const data: any = {}
                for (const [k, v] of Object.entries(fields)) {
                    if (v !== undefined) data[k] = v
                }
                const bet = await prisma.bet.update({ where: { id }, data })
                return createSuccessResult(bet)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
