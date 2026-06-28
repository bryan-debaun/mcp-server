// Pure betting-odds math: conversions, devig, EV, consensus fair prob,
// arbitrage, and parlay combination. No I/O — trivially unit-testable (#129).

const round = (n: number, dp = 4) => {
    const f = 10 ** dp
    return Math.round(n * f) / f
}

/** American odds → decimal odds (total return per 1 unit staked). */
export function americanToDecimal(odds: number): number {
    return odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds
}

/** Decimal odds → American odds (rounded). */
export function decimalToAmerican(decimal: number): number {
    if (decimal <= 1) return 0
    return decimal >= 2
        ? Math.round((decimal - 1) * 100)
        : Math.round(-100 / (decimal - 1))
}

/** Implied probability of a single American price (includes vig). */
export function impliedProb(odds: number): number {
    return 1 / americanToDecimal(odds)
}

export interface DevigResult {
    impliedProbs: number[]
    fairProbs: number[]
    holdPct: number
}

/**
 * Strip the vig from a market's American prices: normalize implied probs so they
 * sum to 1, and report the book's hold (overround) as a percentage.
 */
export function devig(americanOdds: number[]): DevigResult {
    const implied = americanOdds.map(impliedProb)
    const overround = implied.reduce((a, b) => a + b, 0)
    const fair = implied.map((p) => p / overround)
    return {
        impliedProbs: implied.map((p) => round(p)),
        fairProbs: fair.map((p) => round(p)),
        holdPct: round((overround - 1) * 100),
    }
}

/** Expected value per 1 unit staked at `american`, given a fair win probability. */
export function evPerUnit(fairProb: number, american: number): number {
    return round(fairProb * americanToDecimal(american) - 1)
}

/**
 * Consensus fair probabilities across books: devig each book's prices for the
 * same (ordered) outcomes, average the fair probs, and renormalize. Returns null
 * if no usable book rows. This is the reference used to spot +EV outliers.
 */
export function consensusFairProbs(books: number[][]): number[] | null {
    const usable = books.filter((b) => b.length > 1)
    if (usable.length === 0) return null
    const n = usable[0].length
    const sums = new Array(n).fill(0)
    let count = 0
    for (const b of usable) {
        if (b.length !== n) continue
        devig(b).fairProbs.forEach((p, i) => {
            sums[i] += p
        })
        count++
    }
    if (count === 0) return null
    const avg = sums.map((s) => s / count)
    const total = avg.reduce((a, b) => a + b, 0)
    return avg.map((p) => round(p / total))
}

export interface ArbResult {
    isArb: boolean
    sumImplied: number
    profitPct: number
    stakes: { label: string; stakeFraction: number }[]
}

/** Detect a cross-book arbitrage from the best price per outcome. */
export function findArbitrage(
    outcomes: { label: string; american: number }[],
): ArbResult {
    const implied = outcomes.map((o) => impliedProb(o.american))
    const sum = implied.reduce((a, b) => a + b, 0)
    return {
        isArb: sum < 1,
        sumImplied: round(sum),
        profitPct: round((1 / sum - 1) * 100),
        stakes: outcomes.map((o, i) => ({
            label: o.label,
            stakeFraction: round(implied[i] / sum),
        })),
    }
}

export interface ParlayLeg {
    oddsAmerican: number
    fairProb?: number
    label?: string
}

export interface ParlayResult {
    legCount: number
    combinedDecimal: number
    combinedAmerican: number
    impliedProb: number
    fairProb: number | null
    ev: number | null
    edgePct: number | null
    caveat: string
}

/** Combine parlay legs; report combined odds, implied/fair prob, EV — honestly. */
export function buildParlay(legs: ParlayLeg[]): ParlayResult {
    const combinedDecimal = legs.reduce(
        (acc, l) => acc * americanToDecimal(l.oddsAmerican),
        1,
    )
    const implied = 1 / combinedDecimal
    const haveFair =
        legs.length > 0 && legs.every((l) => typeof l.fairProb === 'number')
    const fairProb = haveFair
        ? legs.reduce((a, l) => a * (l.fairProb as number), 1)
        : null
    const ev = fairProb != null ? combinedDecimal * fairProb - 1 : null
    return {
        legCount: legs.length,
        combinedDecimal: round(combinedDecimal),
        combinedAmerican: decimalToAmerican(combinedDecimal),
        impliedProb: round(implied),
        fairProb: fairProb != null ? round(fairProb) : null,
        ev: ev != null ? round(ev) : null,
        edgePct: ev != null ? round(ev * 100) : null,
        caveat:
            "Parlays compound the books' vig and assume independent legs. " +
            'Correlated legs are often limited/voided and erode real value — ' +
            'treat as longshot/entertainment unless every leg is independently +EV.',
    }
}
