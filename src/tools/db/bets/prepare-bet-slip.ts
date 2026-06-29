import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { americanToDecimal, buildParlay } from '../../odds/odds-math.js'
import { registerTool } from '../../registration.js'
import { draftkingsLink } from './draftkings.js'
import { PrepareBetSlipInputSchema } from './schemas.js'

const name = 'prepare-bet-slip'
const config = {
    title: 'Prepare Bet Slip',
    description:
        'Turn a single bet or parlay into a ready-to-replicate DraftKings slip + deep link + create-bet args. Places NOTHING — you confirm manually.',
    inputSchema: PrepareBetSlipInputSchema,
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp

export function registerPrepareBetSlipTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const {
                    event,
                    selection,
                    line,
                    stake,
                    legs,
                    oddsAmerican,
                    sport,
                    source,
                    aiModel,
                    aiRationale,
                    aiEstProb,
                    fairProb,
                    book,
                } = args

                const isParlay = Array.isArray(legs) && legs.length >= 2
                let effectiveOdds: number
                let parlay: ReturnType<typeof buildParlay> | undefined

                if (isParlay) {
                    parlay = buildParlay(
                        legs.map((l: any) => ({
                            oddsAmerican: l.oddsAmerican,
                            fairProb: l.fairProb,
                            label: l.label,
                        })),
                    )
                    effectiveOdds = parlay.combinedAmerican
                } else {
                    if (typeof oddsAmerican !== 'number') {
                        return createErrorResult(
                            'oddsAmerican is required for a single bet (or provide 2+ legs for a parlay)',
                        )
                    }
                    effectiveOdds = oddsAmerican
                }

                const decimal = americanToDecimal(effectiveOdds)
                const potentialPayout = round(stake * decimal)
                const fp = isParlay
                    ? (parlay?.fairProb ?? null)
                    : (fairProb ?? null)
                const ev = fp != null ? round(fp * decimal - 1) : null
                const market = isParlay
                    ? 'parlay'
                    : (args.market ?? 'moneyline')
                const resolvedBook = book ?? 'DraftKings'
                const resolvedSource =
                    source ??
                    (aiModel || aiRationale ? 'AI_ASSISTED' : 'INTUITION')

                const slip = {
                    book: resolvedBook,
                    market,
                    event,
                    selection: isParlay
                        ? `${legs.length}-leg parlay`
                        : selection,
                    line,
                    legs: isParlay ? legs : undefined,
                    oddsAmerican: effectiveOdds,
                    decimalOdds: round(decimal),
                    stake,
                    potentialPayout,
                    potentialProfit: round(potentialPayout - stake),
                    impliedProb: round(1 / decimal),
                    fairProb: fp,
                    ev,
                    edgePct: ev != null ? round(ev * 100) : null,
                    caveat: isParlay ? parlay?.caveat : undefined,
                }

                // Exact args to log this once placed (preserves source + AI metadata).
                const draftBet = {
                    sport,
                    event,
                    market,
                    selection: slip.selection,
                    line,
                    oddsAmerican: effectiveOdds,
                    stake,
                    book: resolvedBook,
                    source: resolvedSource,
                    aiModel,
                    aiRationale,
                    aiEstProb,
                    legs: isParlay ? legs : undefined,
                }

                return createSuccessResult({
                    slip,
                    deepLink: draftkingsLink(sport),
                    instructions: `Open DraftKings → find "${event}" → add ${slip.selection}${
                        line != null ? ` (${line})` : ''
                    } at ${effectiveOdds} → stake ${stake} → confirm. Then call create-bet with the draftBet below to log it.`,
                    draftBet,
                    note: 'No bet was placed. DraftKings has no public pre-filled bet-slip link, so the deep link is a navigation aid — place the bet yourself, then log it with create-bet.',
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
