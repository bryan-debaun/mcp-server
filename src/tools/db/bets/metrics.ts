// Pure betting-math helpers + analytics aggregation (#128). No DB access here so
// it's trivially unit-testable.

/** Convert American odds to decimal odds (total return per 1 unit staked). */
export function americanToDecimal(odds: number): number {
    return odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds
}

export interface BetLike {
    status: string
    stake: number
    oddsAmerican: number
    payout?: number | null
    source?: string
    closingOddsAmerican?: number | null
}

/** Realized profit for a single bet (0 for PENDING/PUSH/VOID). */
export function betProfit(b: BetLike): number {
    if (b.status === 'WON') {
        return b.payout != null
            ? b.payout - b.stake
            : b.stake * (americanToDecimal(b.oddsAmerican) - 1)
    }
    if (b.status === 'LOST') return -b.stake
    return 0
}

export interface BetMetrics {
    count: number
    pending: number
    settled: number // decided: WON + LOST
    wins: number
    losses: number
    pushes: number
    voids: number
    hitRate: number | null // wins / (wins + losses)
    staked: number // total risked on decided bets
    profit: number
    roi: number | null // profit / staked
    units: number | null // profit / average decided stake
    clvCount: number
    avgClvPct: number | null // mean closing-line value %, when available
}

/**
 * Aggregate metrics over a set of bets. CLV% per bet = (yourDecimalOdds /
 * closingDecimalOdds - 1) * 100; positive means you beat the closing line —
 * the primary signal for the intuition-vs-AI experiment (#127).
 */
export function computeMetrics(bets: BetLike[]): BetMetrics {
    let wins = 0
    let losses = 0
    let pushes = 0
    let voids = 0
    let pending = 0
    let staked = 0
    let profit = 0
    let clvSum = 0
    let clvCount = 0

    for (const b of bets) {
        switch (b.status) {
            case 'WON':
                wins++
                break
            case 'LOST':
                losses++
                break
            case 'PUSH':
                pushes++
                break
            case 'VOID':
                voids++
                break
            default:
                pending++
        }
        if (b.status === 'WON' || b.status === 'LOST') staked += b.stake
        profit += betProfit(b)
        if (b.closingOddsAmerican != null) {
            clvSum +=
                (americanToDecimal(b.oddsAmerican) /
                    americanToDecimal(b.closingOddsAmerican) -
                    1) *
                100
            clvCount++
        }
    }

    const decided = wins + losses
    const round = (n: number) => Math.round(n * 1e4) / 1e4
    return {
        count: bets.length,
        pending,
        settled: decided,
        wins,
        losses,
        pushes,
        voids,
        hitRate: decided > 0 ? round(wins / decided) : null,
        staked: round(staked),
        profit: round(profit),
        roi: staked > 0 ? round(profit / staked) : null,
        units: decided > 0 ? round(profit / (staked / decided)) : null,
        clvCount,
        avgClvPct: clvCount > 0 ? round(clvSum / clvCount) : null,
    }
}
