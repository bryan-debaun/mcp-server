import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { getOdds } from '../../adapters/odds/the-odds-api.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../github-issues/results.js'
import { registerTool } from '../registration.js'
import { americanToDecimal, findArbitrage } from './odds-math.js'
import { FindArbitrageInputSchema } from './schemas.js'

const name = 'find-arbitrage'
const config = {
    title: 'Find Arbitrage',
    description:
        'Detect cross-book arbitrage on moneyline (h2h) markets — best price per outcome summing to <100% implied',
    inputSchema: FindArbitrageInputSchema,
}

export function registerFindArbitrageTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { sport, markets = 'h2h', regions = 'us' } = args
                const games = await getOdds(sport, { markets, regions })
                const arbs: any[] = []

                for (const game of games) {
                    // h2h only: pairing is unambiguous (no points). Best price per
                    // outcome name across books.
                    const best = new Map<
                        string,
                        { american: number; book: string }
                    >()
                    for (const bk of game.bookmakers) {
                        for (const m of bk.markets) {
                            if (m.key !== 'h2h') continue
                            for (const o of m.outcomes) {
                                const cur = best.get(o.name)
                                if (
                                    !cur ||
                                    americanToDecimal(o.price) >
                                        americanToDecimal(cur.american)
                                ) {
                                    best.set(o.name, {
                                        american: o.price,
                                        book: bk.title,
                                    })
                                }
                            }
                        }
                    }
                    if (best.size < 2) continue
                    const outcomes = [...best.entries()].map(([label, v]) => ({
                        label: `${label} @ ${v.book}`,
                        american: v.american,
                    }))
                    const arb = findArbitrage(outcomes)
                    if (arb.isArb) {
                        arbs.push({
                            event: `${game.away_team} @ ${game.home_team}`,
                            market: 'h2h',
                            ...arb,
                        })
                    }
                }

                arbs.sort((a, b) => b.profitPct - a.profitPct)
                return createSuccessResult({
                    count: arbs.length,
                    arbitrage: arbs,
                    note: 'Covers h2h only. Arbs are rare, move fast, and books may limit/void — verify before acting.',
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
