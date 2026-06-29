// Input schemas for bet-tracker MCP tools (#128).
import { z } from 'zod'

const MarketEnum = z.enum(['moneyline', 'spread', 'total', 'prop', 'parlay'])
const SourceEnum = z.enum(['INTUITION', 'AI_ASSISTED'])
const SettleStatusEnum = z.enum(['WON', 'LOST', 'PUSH', 'VOID'])

const LegSchema = z.object({
    event: z.string().describe('Leg event description'),
    selection: z.string().describe('Leg selection'),
    // Optional: same-game parlays (SGPs) only expose the combined price, not
    // per-leg odds. The bet's economics come from the top-level combined
    // oddsAmerican; leg odds are descriptive. (#137)
    oddsAmerican: z
        .number()
        .int()
        .optional()
        .describe('Leg American odds (optional; SGPs omit it)'),
    line: z.number().optional().describe('Leg line, if applicable'),
})

export const CreateBetInputSchema = {
    sport: z.string().describe('Sport (e.g. NBA, NFL)'),
    league: z.string().optional().describe('League/competition'),
    event: z.string().describe('Event description (e.g. "Lakers @ Celtics")'),
    market: MarketEnum.describe('moneyline | spread | total | prop | parlay'),
    selection: z.string().describe('What was bet (team / over / player prop)'),
    line: z.number().optional().describe('Spread/total line, if applicable'),
    oddsAmerican: z.number().int().describe('American odds (e.g. -110, +150)'),
    stake: z.number().positive().describe('Amount risked'),
    book: z.string().optional().describe('Sportsbook (default DraftKings)'),
    source: SourceEnum.describe('INTUITION (gut) or AI_ASSISTED'),
    placedAt: z.string().optional().describe('Placement time (ISO 8601)'),
    aiModel: z.string().optional().describe('AI model, if AI_ASSISTED'),
    aiRationale: z
        .string()
        .optional()
        .describe('AI reasoning captured at decision time'),
    aiEstProb: z
        .number()
        .optional()
        .describe("AI's estimated win probability (0..1)"),
    aiEV: z.number().optional().describe("AI's estimated EV at placement"),
    legs: z.array(LegSchema).optional().describe('Parlay legs (market=parlay)'),
    notes: z.string().optional().describe('Freeform notes'),
}

export const UpdateBetInputSchema = {
    id: z.number().int().describe('Bet ID'),
    sport: z.string().optional(),
    league: z.string().optional(),
    event: z.string().optional(),
    market: MarketEnum.optional(),
    selection: z.string().optional(),
    line: z.number().optional(),
    oddsAmerican: z.number().int().optional(),
    stake: z.number().positive().optional(),
    book: z.string().optional(),
    source: SourceEnum.optional(),
    aiModel: z.string().optional(),
    aiRationale: z.string().optional(),
    aiEstProb: z.number().optional(),
    aiEV: z.number().optional(),
    closingLine: z
        .number()
        .optional()
        .describe('Closing line (Phase 2 / #129)'),
    closingOddsAmerican: z
        .number()
        .int()
        .optional()
        .describe('Closing American odds (for CLV)'),
    legs: z.array(LegSchema).optional(),
    notes: z.string().optional(),
}

export const GetBetInputSchema = {
    id: z.number().int().describe('Bet ID'),
}

export const DeleteBetInputSchema = {
    id: z.number().int().describe('Bet ID to delete'),
}

export const ListBetsInputSchema = {
    source: SourceEnum.optional().describe('Filter by source'),
    status: z
        .enum(['PENDING', 'WON', 'LOST', 'PUSH', 'VOID'])
        .optional()
        .describe('Filter by status'),
    sport: z.string().optional().describe('Filter by sport'),
    market: MarketEnum.optional().describe('Filter by market'),
    limit: z.number().int().optional().describe('Max results (default 100)'),
    offset: z.number().int().optional().describe('Results to skip (default 0)'),
}

export const SettleBetInputSchema = {
    id: z.number().int().describe('Bet ID'),
    status: SettleStatusEnum.describe('Outcome: WON | LOST | PUSH | VOID'),
    payout: z
        .number()
        .optional()
        .describe('Total returned on a win (incl. stake); computed if omitted'),
}

export const BetAnalyticsInputSchema = {
    source: SourceEnum.optional().describe('Restrict to one source'),
    sport: z.string().optional().describe('Restrict to one sport'),
    market: MarketEnum.optional().describe('Restrict to one market'),
    from: z
        .string()
        .optional()
        .describe('Only bets placed on/after (ISO 8601)'),
    to: z.string().optional().describe('Only bets placed on/before (ISO 8601)'),
}

const SlipLegSchema = z.object({
    label: z.string().optional().describe('Leg label'),
    event: z.string().optional().describe('Leg event'),
    selection: z.string().optional().describe('Leg selection'),
    // Optional for same-game parlays — provide the top-level combined
    // oddsAmerican instead (#137).
    oddsAmerican: z
        .number()
        .int()
        .optional()
        .describe('Leg American odds (optional; SGPs omit it)'),
    line: z.number().optional(),
    fairProb: z
        .number()
        .optional()
        .describe('Leg fair win prob (0..1) → enables EV'),
})

export const PrepareBetSlipInputSchema = {
    event: z.string().describe('Event description (e.g. "Lakers @ Celtics")'),
    market: MarketEnum.optional().describe(
        'Market (defaults to parlay when legs given, else moneyline)',
    ),
    selection: z.string().optional().describe('Selection for a single bet'),
    line: z.number().optional().describe('Spread/total line, if applicable'),
    oddsAmerican: z
        .number()
        .int()
        .optional()
        .describe('Required for a single bet; computed from legs for a parlay'),
    stake: z.number().positive().describe('Amount to risk'),
    legs: z
        .array(SlipLegSchema)
        .min(2)
        .optional()
        .describe('Parlay legs (≥2) instead of a single selection'),
    sport: z
        .string()
        .optional()
        .describe('Sport key for the DK link (e.g. basketball_nba)'),
    source: SourceEnum.optional().describe('INTUITION or AI_ASSISTED'),
    aiModel: z.string().optional(),
    aiRationale: z.string().optional(),
    aiEstProb: z.number().optional(),
    fairProb: z
        .number()
        .optional()
        .describe('Fair win prob for a single bet → enables EV'),
    book: z.string().optional().describe('Sportsbook (default DraftKings)'),
}
