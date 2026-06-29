import { beforeAll, describe, expect, it } from 'vitest'
import { registerPrepareBetSlipTool } from '../../../../src/tools/db/bets/prepare-bet-slip.js'

const handlers = new Map<string, (a: any) => Promise<any>>()
const fake: any = {
    registerTool: (n: string, _c: any, h: any) => handlers.set(n, h),
}
const call = async (args: any) => {
    const r = await handlers.get('prepare-bet-slip')!(args)
    let data: any
    try {
        data = JSON.parse(r.content[0].text)
    } catch {
        data = r.content[0].text
    }
    return { isError: !!r.isError, data }
}

beforeAll(() => registerPrepareBetSlipTool(fake))

describe('prepare-bet-slip (#130) — places nothing, prepares everything', () => {
    it('builds a single-bet slip with payout, DK link, and create-bet args', async () => {
        const { data } = await call({
            event: 'Lakers @ Celtics',
            market: 'moneyline',
            selection: 'Celtics',
            oddsAmerican: -110,
            stake: 100,
            sport: 'basketball_nba',
        })
        expect(data.slip.oddsAmerican).toBe(-110)
        expect(data.slip.potentialPayout).toBeCloseTo(190.91, 1)
        expect(data.slip.potentialProfit).toBeCloseTo(90.91, 1)
        expect(data.deepLink).toMatch(/draftkings\.com/)
        expect(data.deepLink).toMatch(/nba/)
        // ready to log once placed
        expect(data.draftBet).toMatchObject({
            event: 'Lakers @ Celtics',
            selection: 'Celtics',
            oddsAmerican: -110,
            stake: 100,
            book: 'DraftKings',
            source: 'INTUITION',
        })
        expect(data.note).toMatch(/no bet was placed/i)
    })

    it('computes EV for a single bet when fairProb is given', async () => {
        const { data } = await call({
            event: 'A @ B',
            selection: 'A',
            oddsAmerican: 100,
            stake: 10,
            fairProb: 0.55,
        })
        expect(data.slip.ev).toBeCloseTo(0.1) // 2.0*0.55 - 1
        expect(data.slip.edgePct).toBeCloseTo(10)
    })

    it('infers AI_ASSISTED source from AI metadata', async () => {
        const { data } = await call({
            event: 'A @ B',
            selection: 'A',
            oddsAmerican: -120,
            stake: 25,
            aiModel: 'claude',
            aiRationale: 'beats devigged consensus',
        })
        expect(data.draftBet.source).toBe('AI_ASSISTED')
        expect(data.draftBet.aiModel).toBe('claude')
    })

    it('combines a parlay (market=parlay, caveat, combined odds)', async () => {
        const { data } = await call({
            event: '3-game slate',
            stake: 20,
            legs: [{ oddsAmerican: -110 }, { oddsAmerican: 150 }],
            sport: 'basketball_nba',
        })
        expect(data.slip.market).toBe('parlay')
        expect(data.slip.selection).toBe('2-leg parlay')
        expect(data.slip.oddsAmerican).toBeGreaterThan(0) // combined plus-money
        expect(data.slip.caveat).toMatch(/correlat/i)
        expect(data.draftBet.legs).toHaveLength(2)
    })

    it('errors when a single bet has no oddsAmerican', async () => {
        const { isError, data } = await call({
            event: 'A @ B',
            selection: 'A',
            stake: 10,
        })
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/oddsAmerican is required/i)
    })

    it('falls back to the DK home link for an unknown sport', async () => {
        const { data } = await call({
            event: 'A @ B',
            selection: 'A',
            oddsAmerican: -110,
            stake: 10,
        })
        expect(data.deepLink).toBe('https://sportsbook.draftkings.com')
    })
})
