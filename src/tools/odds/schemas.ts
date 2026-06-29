// Input schemas for odds-analysis MCP tools (#129).
import { z } from 'zod'

export const ListSportsInputSchema = {}

export const ListEventsInputSchema = {
    sport: z
        .string()
        .describe('Sport key (e.g. basketball_nba) — see list-sports'),
}

export const GetOddsInputSchema = {
    sport: z.string().describe('Sport key (e.g. basketball_nba)'),
    markets: z
        .string()
        .optional()
        .describe('Comma-separated markets (h2h,spreads,totals); default h2h'),
    regions: z.string().optional().describe('Regions (default us)'),
    eventId: z
        .string()
        .optional()
        .describe(
            'Single event id (richer markets/props) instead of all events',
        ),
}

export const DevigInputSchema = {
    oddsAmerican: z
        .array(z.number())
        .min(2)
        .describe(
            'American prices for all outcomes of ONE market (e.g. [-110,-110])',
        ),
}

export const FindPositiveEvInputSchema = {
    sport: z.string().describe('Sport key (e.g. basketball_nba)'),
    markets: z.string().optional().describe('Markets; default h2h'),
    regions: z.string().optional().describe('Regions (default us)'),
    threshold: z
        .number()
        .optional()
        .describe('Minimum EV per unit to report (default 0.02 = +2%)'),
}

export const GetScoresInputSchema = {
    sport: z.string().describe('Sport key (e.g. basketball_nba)'),
    daysFrom: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .describe('Include completed games from the last N days (1-3)'),
}

export const FindArbitrageInputSchema = {
    sport: z.string().describe('Sport key (e.g. basketball_nba)'),
    markets: z.string().optional().describe('Markets; default h2h'),
    regions: z.string().optional().describe('Regions (default us)'),
}

const ParlayLegSchema = z.object({
    label: z.string().optional().describe('Leg label (e.g. "Celtics ML")'),
    oddsAmerican: z.number().describe('Leg American odds'),
    fairProb: z
        .number()
        .optional()
        .describe('Fair win prob (0..1) — enables combined EV'),
})

export const BuildParlayInputSchema = {
    legs: z.array(ParlayLegSchema).min(2).describe('Two or more parlay legs'),
}
