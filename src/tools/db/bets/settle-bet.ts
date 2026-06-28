import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { americanToDecimal } from './metrics.js'
import { SettleBetInputSchema } from './schemas.js'

const name = 'settle-bet'
const config = {
    title: 'Settle Bet',
    description:
        'Settle a bet outcome (WON/LOST/PUSH/VOID); payout auto-computed on a win (admin only)',
    inputSchema: SettleBetInputSchema,
}

export function registerSettleBetTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id, status, payout } = args
                const existing = await prisma.bet.findUnique({ where: { id } })
                if (!existing) return createErrorResult('Bet not found')

                // On a win, default payout to stake × decimal odds (total return).
                let finalPayout: number | null = payout ?? null
                if (status === 'WON' && finalPayout == null) {
                    finalPayout =
                        existing.stake *
                        americanToDecimal(existing.oddsAmerican)
                } else if (status !== 'WON' && payout == null) {
                    finalPayout =
                        status === 'PUSH' || status === 'VOID'
                            ? existing.stake // stake returned
                            : 0 // LOST
                }

                const bet = await prisma.bet.update({
                    where: { id },
                    data: {
                        status,
                        payout: finalPayout,
                        settledAt: new Date(),
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
