import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
    getOdds,
    type OddsApiOutcome,
} from '../../adapters/odds/the-odds-api.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../github-issues/results.js'
import { registerTool } from '../registration.js'
import { devig, evPerUnit } from './odds-math.js'
import { FindPositiveEvInputSchema } from './schemas.js'

const name = 'find-positive-ev'
const config = {
    title: 'Find +EV',
    description:
        'Scan a sport for prices that beat the no-vig consensus across books (positive expected value)',
    inputSchema: FindPositiveEvInputSchema,
}

const identity = (o: OddsApiOutcome) =>
    o.point != null ? `${o.name} ${o.point}` : o.name

export function registerFindPositiveEvTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const {
                    sport,
                    markets = 'h2h',
                    regions = 'us',
                    threshold = 0.02,
                } = args
                const games = await getOdds(sport, { markets, regions })
                const opps: any[] = []

                for (const game of games) {
                    // marketKey -> identity -> { fairs: number[]; prices: {book, price}[] }
                    const byMarket = new Map<
                        string,
                        Map<
                            string,
                            {
                                fairs: number[]
                                prices: { book: string; price: number }[]
                            }
                        >
                    >()

                    for (const bk of game.bookmakers) {
                        for (const m of bk.markets) {
                            if (m.outcomes.length < 2) continue
                            const fair = devig(
                                m.outcomes.map((o) => o.price),
                            ).fairProbs
                            const ids = byMarket.get(m.key) ?? new Map()
                            m.outcomes.forEach((o, i) => {
                                const id = identity(o)
                                const slot = ids.get(id) ?? {
                                    fairs: [],
                                    prices: [],
                                }
                                slot.fairs.push(fair[i])
                                slot.prices.push({
                                    book: bk.title,
                                    price: o.price,
                                })
                                ids.set(id, slot)
                            })
                            byMarket.set(m.key, ids)
                        }
                    }

                    for (const [marketKey, ids] of byMarket) {
                        for (const [id, slot] of ids) {
                            const consensus =
                                slot.fairs.reduce((a, b) => a + b, 0) /
                                slot.fairs.length
                            for (const { book, price } of slot.prices) {
                                const ev = evPerUnit(consensus, price)
                                if (ev >= threshold) {
                                    opps.push({
                                        event: `${game.away_team} @ ${game.home_team}`,
                                        market: marketKey,
                                        outcome: id,
                                        book,
                                        price,
                                        fairProb:
                                            Math.round(consensus * 1e4) / 1e4,
                                        ev,
                                        edgePct: Math.round(ev * 1e4) / 1e2,
                                    })
                                }
                            }
                        }
                    }
                }

                opps.sort((a, b) => b.ev - a.ev)
                return createSuccessResult({
                    threshold,
                    count: opps.length,
                    opportunities: opps.slice(0, 50),
                    note: 'Consensus = average no-vig fair prob across books. Most reliable for h2h; verify lines before betting.',
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
