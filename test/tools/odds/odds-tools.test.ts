import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the adapter so the tools are deterministic and need no API key.
vi.mock('../../../src/adapters/odds/the-odds-api.js', () => ({
    getSports: vi.fn(),
    getEvents: vi.fn(),
    getOdds: vi.fn(),
    getEventOdds: vi.fn(),
    getScores: vi.fn(),
    isOddsConfigured: vi.fn(() => true),
}))

import * as adapter from '../../../src/adapters/odds/the-odds-api.js'
import { registerBuildParlayTool } from '../../../src/tools/odds/build-parlay.js'
import { registerDevigTool } from '../../../src/tools/odds/devig.js'
import { registerFindArbitrageTool } from '../../../src/tools/odds/find-arbitrage.js'
import { registerFindPositiveEvTool } from '../../../src/tools/odds/find-positive-ev.js'
import { registerGetOddsTool } from '../../../src/tools/odds/get-odds.js'
import { registerGetScoresTool } from '../../../src/tools/odds/get-scores.js'
import { registerListSportsTool } from '../../../src/tools/odds/list-sports.js'

const getOdds = adapter.getOdds as unknown as ReturnType<typeof vi.fn>
const getSports = adapter.getSports as unknown as ReturnType<typeof vi.fn>
const getScores = adapter.getScores as unknown as ReturnType<typeof vi.fn>

const handlers = new Map<string, (args: any) => Promise<any>>()
const fake: any = {
    registerTool: (name: string, _c: any, h: any) => handlers.set(name, h),
}
const call = async (name: string, args: any = {}) => {
    const res = await handlers.get(name)!(args)
    let data: any
    try {
        data = JSON.parse(res.content[0].text)
    } catch {
        data = res.content[0].text
    }
    return { isError: !!res.isError, data }
}

const h2hGame = (bookmakers: any[]) => ({
    id: 'e1',
    sport_key: 'basketball_nba',
    commence_time: '2026-06-29T00:00:00Z',
    home_team: 'Home',
    away_team: 'Away',
    bookmakers,
})

beforeAll(() => {
    registerListSportsTool(fake)
    registerGetOddsTool(fake)
    registerDevigTool(fake)
    registerBuildParlayTool(fake)
    registerFindPositiveEvTool(fake)
    registerFindArbitrageTool(fake)
    registerGetScoresTool(fake)
})

beforeEach(() => {
    getOdds.mockReset()
    getSports.mockReset()
    getScores.mockReset()
})

describe('odds tools — pure (no API)', () => {
    it('devig returns fair probs + hold', async () => {
        const { data } = await call('devig', { oddsAmerican: [-110, -110] })
        expect(data.fairProbs[0]).toBeCloseTo(0.5)
        expect(data.holdPct).toBeGreaterThan(0)
    })

    it('build-parlay combines legs with a caveat', async () => {
        const { data } = await call('build-parlay', {
            legs: [{ oddsAmerican: -110 }, { oddsAmerican: 150 }],
        })
        expect(data.legCount).toBe(2)
        expect(data.caveat).toBeTruthy()
    })
})

describe('odds tools — API-backed (mocked adapter)', () => {
    it('list-sports surfaces a clean error when the API errors (e.g. no key)', async () => {
        getSports.mockRejectedValueOnce(
            new Error('Odds API not configured: set ODDS_API_KEY'),
        )
        const { isError, data } = await call('list-sports', {})
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/not configured/i)
    })

    it('get-odds shapes events across books', async () => {
        getOdds.mockResolvedValueOnce([
            h2hGame([
                {
                    key: 'dk',
                    title: 'DraftKings',
                    markets: [
                        {
                            key: 'h2h',
                            outcomes: [
                                { name: 'Home', price: -110 },
                                { name: 'Away', price: -110 },
                            ],
                        },
                    ],
                },
            ]),
        ])
        const { data } = await call('get-odds', { sport: 'basketball_nba' })
        expect(data.count).toBe(1)
        expect(data.events[0].matchup).toBe('Away @ Home')
        expect(data.events[0].books[0].book).toBe('DraftKings')
    })

    it('find-positive-ev flags a price that beats consensus', async () => {
        getOdds.mockResolvedValueOnce([
            h2hGame([
                {
                    title: 'BookA',
                    markets: [
                        {
                            key: 'h2h',
                            outcomes: [
                                { name: 'Home', price: -110 },
                                { name: 'Away', price: -110 },
                            ],
                        },
                    ],
                },
                {
                    title: 'BookB',
                    markets: [
                        {
                            key: 'h2h',
                            outcomes: [
                                { name: 'Home', price: 120 },
                                { name: 'Away', price: -140 },
                            ],
                        },
                    ],
                },
            ]),
        ])
        const { data } = await call('find-positive-ev', {
            sport: 'basketball_nba',
        })
        expect(data.count).toBeGreaterThanOrEqual(1)
        const top = data.opportunities[0]
        expect(top.ev).toBeGreaterThan(0)
        expect(top.outcome).toBe('Home')
        expect(top.book).toBe('BookB')
    })

    it('find-arbitrage detects a cross-book h2h arb', async () => {
        getOdds.mockResolvedValueOnce([
            h2hGame([
                {
                    title: 'BookA',
                    markets: [
                        {
                            key: 'h2h',
                            outcomes: [
                                { name: 'Home', price: 110 },
                                { name: 'Away', price: -130 },
                            ],
                        },
                    ],
                },
                {
                    title: 'BookB',
                    markets: [
                        {
                            key: 'h2h',
                            outcomes: [
                                { name: 'Home', price: -130 },
                                { name: 'Away', price: 110 },
                            ],
                        },
                    ],
                },
            ]),
        ])
        const { data } = await call('find-arbitrage', {
            sport: 'basketball_nba',
        })
        expect(data.count).toBe(1)
        expect(data.arbitrage[0].isArb).toBe(true)
        expect(data.arbitrage[0].profitPct).toBeGreaterThan(0)
    })

    it('get-scores returns the results feed (for reconciliation)', async () => {
        getScores.mockResolvedValueOnce([
            {
                id: 'e1',
                sport_key: 'basketball_nba',
                commence_time: '2026-06-28T00:00:00Z',
                completed: true,
                home_team: 'Home',
                away_team: 'Away',
                scores: [
                    { name: 'Home', score: '110' },
                    { name: 'Away', score: '104' },
                ],
                last_update: '2026-06-28T03:00:00Z',
            },
        ])
        const { data } = await call('get-scores', {
            sport: 'basketball_nba',
            daysFrom: 1,
        })
        expect(data.count).toBe(1)
        expect(data.scores[0].completed).toBe(true)
        expect(getScores).toHaveBeenCalledWith('basketball_nba', 1)
    })
})
