import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { ListBetsInputSchema } from './schemas.js'

const name = 'list-bets'
const config = {
    title: 'List Bets',
    description:
        'List bets with optional filters (source, status, sport, market)',
    inputSchema: ListBetsInputSchema,
}

export function registerListBetsTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const {
                    source,
                    status,
                    sport,
                    market,
                    limit = 100,
                    offset = 0,
                } = args
                const where: any = {}
                if (source) where.source = source
                if (status) where.status = status
                if (sport) where.sport = sport
                if (market) where.market = market

                const bets = await prisma.bet.findMany({
                    where,
                    take: limit,
                    skip: offset,
                    orderBy: { placedAt: 'desc' },
                })
                return createSuccessResult({
                    bets,
                    total: bets.length,
                    limit,
                    offset,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
