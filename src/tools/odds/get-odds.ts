import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
    getEventOdds,
    getOdds,
    type OddsApiEventOdds,
} from '../../adapters/odds/the-odds-api.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../github-issues/results.js'
import { registerTool } from '../registration.js'
import { GetOddsInputSchema } from './schemas.js'

const name = 'get-odds'
const config = {
    title: 'Get Odds',
    description:
        "A game's odds across books (incl. DraftKings) for the given markets (The Odds API)",
    inputSchema: GetOddsInputSchema,
}

/** Trim the API payload to what's useful for analysis. */
function shape(e: OddsApiEventOdds) {
    return {
        eventId: e.id,
        commenceTime: e.commence_time,
        matchup: `${e.away_team} @ ${e.home_team}`,
        books: e.bookmakers.map((b) => ({
            book: b.title,
            markets: b.markets.map((m) => ({
                market: m.key,
                outcomes: m.outcomes.map((o) => ({
                    name: o.name,
                    price: o.price,
                    point: o.point,
                })),
            })),
        })),
    }
}

export function registerGetOddsTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { sport, markets, regions, eventId } = args
                if (eventId) {
                    const e = await getEventOdds(sport, eventId, {
                        markets,
                        regions,
                    })
                    return createSuccessResult(shape(e))
                }
                const events = await getOdds(sport, { markets, regions })
                return createSuccessResult({
                    count: events.length,
                    events: events.map(shape),
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
