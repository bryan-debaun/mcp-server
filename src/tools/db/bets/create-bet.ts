import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { CreateBetInputSchema } from './schemas.js'

const name = 'create-bet'
const config = {
    title: 'Create Bet',
    description:
        'Log a sports bet (intuition or AI-assisted) with status PENDING (admin only)',
    inputSchema: CreateBetInputSchema,
}

export function registerCreateBetTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { book, placedAt, legs, ...rest } = args
                const bet = await prisma.bet.create({
                    data: {
                        ...rest,
                        book: book ?? 'DraftKings',
                        ...(placedAt ? { placedAt: new Date(placedAt) } : {}),
                        ...(legs ? { legs } : {}),
                    },
                })
                return createSuccessResult(bet)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
