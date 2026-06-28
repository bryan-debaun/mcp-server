import { describe, expect, it } from 'vitest'
import {
    americanToDecimal,
    buildParlay,
    consensusFairProbs,
    decimalToAmerican,
    devig,
    evPerUnit,
    findArbitrage,
    impliedProb,
} from '../../../src/tools/odds/odds-math.js'

describe('odds-math (#129)', () => {
    it('converts between American and decimal', () => {
        expect(americanToDecimal(100)).toBeCloseTo(2)
        expect(americanToDecimal(150)).toBeCloseTo(2.5)
        expect(americanToDecimal(-110)).toBeCloseTo(1.9091, 3)
        expect(decimalToAmerican(2.5)).toBe(150)
        expect(decimalToAmerican(2)).toBe(100)
        expect(decimalToAmerican(1.5)).toBe(-200)
    })

    it('implied prob includes vig', () => {
        expect(impliedProb(-110)).toBeCloseTo(0.5238, 3)
    })

    it('devig normalizes to fair probs and reports hold', () => {
        const r = devig([-110, -110])
        expect(r.fairProbs[0]).toBeCloseTo(0.5)
        expect(r.fairProbs[1]).toBeCloseTo(0.5)
        expect(r.fairProbs[0] + r.fairProbs[1]).toBeCloseTo(1)
        expect(r.holdPct).toBeCloseTo(4.76, 1)
    })

    it('EV per unit is 0 at fair, positive when the price beats fair', () => {
        expect(evPerUnit(0.5, 100)).toBeCloseTo(0)
        expect(evPerUnit(0.55, 100)).toBeCloseTo(0.1)
        expect(evPerUnit(0.45, 100)).toBeCloseTo(-0.1)
    })

    it('consensus fair probs average devigged books and sum to 1', () => {
        const c = consensusFairProbs([
            [-110, -110],
            [120, -140],
        ])
        expect(c).not.toBeNull()
        const probs = c as number[]
        expect(probs[0] + probs[1]).toBeCloseTo(1)
        expect(probs[0]).toBeLessThan(0.5) // home shaded by book B
        expect(consensusFairProbs([])).toBeNull()
    })

    it('detects arbitrage when best prices imply <100%', () => {
        const arb = findArbitrage([
            { label: 'H', american: 110 },
            { label: 'A', american: 110 },
        ])
        expect(arb.isArb).toBe(true)
        expect(arb.sumImplied).toBeLessThan(1)
        expect(arb.profitPct).toBeGreaterThan(0)
        expect(
            arb.stakes[0].stakeFraction + arb.stakes[1].stakeFraction,
        ).toBeCloseTo(1)

        const noArb = findArbitrage([
            { label: 'H', american: -110 },
            { label: 'A', american: -110 },
        ])
        expect(noArb.isArb).toBe(false)
    })

    it('builds a parlay and flags it as -EV at fair (with a caveat)', () => {
        const p = buildParlay([
            { oddsAmerican: -110, fairProb: 0.5 },
            { oddsAmerican: -110, fairProb: 0.5 },
        ])
        expect(p.legCount).toBe(2)
        expect(p.combinedDecimal).toBeCloseTo(3.6446, 2)
        expect(p.fairProb).toBeCloseTo(0.25)
        expect(p.ev as number).toBeLessThan(0) // compounded vig → -EV
        expect(p.caveat).toMatch(/correlat/i)
    })

    it('parlay EV is null when fair probs are not all provided', () => {
        const p = buildParlay([
            { oddsAmerican: -110 },
            { oddsAmerican: 150, fairProb: 0.4 },
        ])
        expect(p.fairProb).toBeNull()
        expect(p.ev).toBeNull()
        expect(p.combinedAmerican).toBeGreaterThan(0)
    })
})
