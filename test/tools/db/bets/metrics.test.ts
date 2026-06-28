import { describe, expect, it } from 'vitest'
import {
    americanToDecimal,
    type BetLike,
    betProfit,
    computeMetrics,
} from '../../../../src/tools/db/bets/metrics.js'

describe('betting metrics math (#128)', () => {
    it('converts American odds to decimal', () => {
        expect(americanToDecimal(100)).toBeCloseTo(2.0)
        expect(americanToDecimal(150)).toBeCloseTo(2.5)
        expect(americanToDecimal(-110)).toBeCloseTo(1.9091, 3)
        expect(americanToDecimal(-200)).toBeCloseTo(1.5)
    })

    it('computes per-bet profit', () => {
        // WON, explicit payout (total return incl. stake)
        expect(
            betProfit({
                status: 'WON',
                stake: 100,
                oddsAmerican: -110,
                payout: 190.91,
            }),
        ).toBeCloseTo(90.91, 2)
        // WON, payout omitted → derived from odds
        expect(
            betProfit({ status: 'WON', stake: 100, oddsAmerican: 150 }),
        ).toBeCloseTo(150)
        // LOST → -stake; PUSH/VOID/PENDING → 0
        expect(
            betProfit({ status: 'LOST', stake: 50, oddsAmerican: -110 }),
        ).toBe(-50)
        expect(
            betProfit({ status: 'PUSH', stake: 50, oddsAmerican: -110 }),
        ).toBe(0)
        expect(
            betProfit({ status: 'VOID', stake: 50, oddsAmerican: -110 }),
        ).toBe(0)
        expect(
            betProfit({ status: 'PENDING', stake: 50, oddsAmerican: -110 }),
        ).toBe(0)
    })

    it('aggregates metrics: hit-rate, staked, profit, roi', () => {
        const bets: BetLike[] = [
            { status: 'WON', stake: 100, oddsAmerican: 100 }, // +100 profit
            { status: 'LOST', stake: 100, oddsAmerican: -110 }, // -100
            { status: 'WON', stake: 100, oddsAmerican: -110 }, // +90.91
            { status: 'PUSH', stake: 100, oddsAmerican: -110 }, // 0, not counted in decided
            { status: 'PENDING', stake: 100, oddsAmerican: -110 },
        ]
        const m = computeMetrics(bets)
        expect(m.count).toBe(5)
        expect(m.pending).toBe(1)
        expect(m.settled).toBe(3) // WON+WON+LOST
        expect(m.wins).toBe(2)
        expect(m.losses).toBe(1)
        expect(m.pushes).toBe(1)
        expect(m.hitRate).toBeCloseTo(2 / 3, 3)
        expect(m.staked).toBe(300) // decided bets only
        expect(m.profit).toBeCloseTo(90.91, 2)
        expect(m.roi).toBeCloseTo(90.91 / 300, 3)
    })

    it('computes CLV only from bets with a closing line (positive = beat the close)', () => {
        const bets: BetLike[] = [
            // bet -110 (1.909), closed -130 (1.769) → beat the close (+)
            {
                status: 'WON',
                stake: 100,
                oddsAmerican: -110,
                closingOddsAmerican: -130,
            },
            // no closing line → excluded from CLV
            { status: 'LOST', stake: 100, oddsAmerican: -110 },
        ]
        const m = computeMetrics(bets)
        expect(m.clvCount).toBe(1)
        expect(m.avgClvPct).not.toBeNull()
        expect(m.avgClvPct as number).toBeGreaterThan(0)
    })

    it('returns null rates when nothing is decided', () => {
        const m = computeMetrics([
            { status: 'PENDING', stake: 100, oddsAmerican: -110 },
        ])
        expect(m.hitRate).toBeNull()
        expect(m.roi).toBeNull()
        expect(m.units).toBeNull()
        expect(m.avgClvPct).toBeNull()
    })
})
