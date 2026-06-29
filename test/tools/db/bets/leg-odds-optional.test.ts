import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
    CreateBetInputSchema,
    UpdateBetInputSchema,
} from '../../../../src/tools/db/bets/schemas.js'

// Validates the #137 change at the schema layer (the MCP framework enforces these
// on the tool input, so this is where the contract actually lives).
const createSchema = z.object(CreateBetInputSchema)
const updateSchema = z.object(UpdateBetInputSchema)

const baseParlay = {
    sport: 'NBA',
    event: 'Lakers @ Celtics (SGP)',
    market: 'parlay' as const,
    selection: '3-leg SGP',
    oddsAmerican: 450, // top-level combined price — still required
    stake: 20,
    source: 'INTUITION' as const,
}

describe('parlay leg odds optional (#137)', () => {
    it('accepts a parlay whose legs omit oddsAmerican (same-game parlay)', () => {
        const parsed = createSchema.parse({
            ...baseParlay,
            legs: [
                { event: 'Lakers @ Celtics', selection: 'Tatum 30+ pts' },
                {
                    event: 'Lakers @ Celtics',
                    selection: 'Over 220.5',
                    line: 220.5,
                },
            ],
        })
        expect(parsed.legs).toHaveLength(2)
        expect(parsed.legs?.[0].oddsAmerican).toBeUndefined()
    })

    it('still accepts legs WITH oddsAmerican (unchanged)', () => {
        const parsed = createSchema.parse({
            ...baseParlay,
            legs: [
                { event: 'g1', selection: 'A', oddsAmerican: -110 },
                { event: 'g2', selection: 'B', oddsAmerican: 150 },
            ],
        })
        expect(parsed.legs?.[0].oddsAmerican).toBe(-110)
    })

    it('still requires event + selection on each leg', () => {
        const bad = createSchema.safeParse({
            ...baseParlay,
            legs: [{ selection: 'no event' }],
        })
        expect(bad.success).toBe(false)
    })

    it('still requires the top-level combined oddsAmerican', () => {
        const { oddsAmerican, ...noOdds } = baseParlay
        const bad = createSchema.safeParse({
            ...noOdds,
            legs: [{ event: 'g', selection: 'A' }],
        })
        expect(bad.success).toBe(false)
    })

    it('update-bet legs likewise accept missing odds', () => {
        const parsed = updateSchema.parse({
            id: 1,
            legs: [{ event: 'g', selection: 'A' }],
        })
        expect(parsed.legs?.[0].oddsAmerican).toBeUndefined()
    })
})
