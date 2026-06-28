import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { computeMetrics } from './metrics.js'
import { BetAnalyticsInputSchema } from './schemas.js'

const name = 'bet-analytics'
const config = {
    title: 'Bet Analytics',
    description:
        'Betting performance (ROI, hit-rate, units, CLV) segmented by source (intuition vs AI-assisted)',
    inputSchema: BetAnalyticsInputSchema,
}

export function registerBetAnalyticsTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { source, sport, market, from, to } = args
                const where: any = {}
                if (source) where.source = source
                if (sport) where.sport = sport
                if (market) where.market = market
                if (from || to) {
                    where.placedAt = {}
                    if (from) where.placedAt.gte = new Date(from)
                    if (to) where.placedAt.lte = new Date(to)
                }

                const bets = await prisma.bet.findMany({ where })

                return createSuccessResult({
                    overall: computeMetrics(bets),
                    bySource: {
                        INTUITION: computeMetrics(
                            bets.filter((b: any) => b.source === 'INTUITION'),
                        ),
                        AI_ASSISTED: computeMetrics(
                            bets.filter((b: any) => b.source === 'AI_ASSISTED'),
                        ),
                    },
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
