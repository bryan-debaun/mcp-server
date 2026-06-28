import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../src/db/index', () => ({
    prisma: {
        bet: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}))

import { prisma } from '../../../../src/db/index.js'
import { registerBetAnalyticsTool } from '../../../../src/tools/db/bets/bet-analytics.js'
import { registerCreateBetTool } from '../../../../src/tools/db/bets/create-bet.js'
import { registerGetBetTool } from '../../../../src/tools/db/bets/get-bet.js'
import { registerListBetsTool } from '../../../../src/tools/db/bets/list-bets.js'
import { registerSettleBetTool } from '../../../../src/tools/db/bets/settle-bet.js'

const bet = (prisma as any).bet as Record<string, ReturnType<typeof vi.fn>>
const handlers = new Map<string, (args: any) => Promise<any>>()
const fake: any = {
    registerTool: (name: string, _c: any, h: any) => handlers.set(name, h),
}

const call = async (name: string, args: any) => {
    const res = await handlers.get(name)!(args)
    let data: any
    try {
        data = JSON.parse(res.content[0].text)
    } catch {
        data = res.content[0].text
    }
    return { isError: !!res.isError, data }
}

beforeAll(() => {
    registerCreateBetTool(fake)
    registerGetBetTool(fake)
    registerListBetsTool(fake)
    registerSettleBetTool(fake)
    registerBetAnalyticsTool(fake)
})

beforeEach(() => {
    for (const fn of Object.values(bet)) fn.mockReset()
})

describe('bet tools — create-bet', () => {
    it('defaults book to DraftKings and passes through fields', async () => {
        bet.create.mockImplementation(async ({ data }: any) => ({
            id: 1,
            ...data,
        }))
        const { data } = await call('create-bet', {
            sport: 'NBA',
            event: 'Lakers @ Celtics',
            market: 'moneyline',
            selection: 'Celtics',
            oddsAmerican: -110,
            stake: 50,
            source: 'AI_ASSISTED',
            aiModel: 'claude',
            aiRationale: 'edge vs devigged line',
        })
        expect(data.book).toBe('DraftKings')
        expect(data.source).toBe('AI_ASSISTED')
        expect(data.aiModel).toBe('claude')
    })

    it('surfaces an error result when the write fails (stub throws)', async () => {
        bet.create.mockRejectedValueOnce(
            new Error('DATABASE_URL not configured'),
        )
        const res = await handlers.get('create-bet')!({
            sport: 'NBA',
            event: 'x',
            market: 'moneyline',
            selection: 'y',
            oddsAmerican: -110,
            stake: 10,
            source: 'INTUITION',
        })
        expect(res.isError).toBe(true)
    })
})

describe('bet tools — settle-bet', () => {
    it('auto-computes payout on a win from stake × decimal odds', async () => {
        bet.findUnique.mockResolvedValueOnce({
            id: 1,
            stake: 100,
            oddsAmerican: 150,
        })
        bet.update.mockImplementation(async ({ data }: any) => ({
            id: 1,
            ...data,
        }))
        const { data } = await call('settle-bet', { id: 1, status: 'WON' })
        expect(data.status).toBe('WON')
        expect(data.payout).toBeCloseTo(250) // 100 * 2.5
        expect(bet.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 1 } }),
        )
    })

    it('404s a missing bet', async () => {
        bet.findUnique.mockResolvedValueOnce(null)
        const { isError, data } = await call('settle-bet', {
            id: 9,
            status: 'LOST',
        })
        expect(isError).toBe(true)
        expect(String(data)).toMatch(/not found/i)
    })
})

describe('bet tools — get/list', () => {
    it('get-bet 404s when missing', async () => {
        bet.findUnique.mockResolvedValueOnce(null)
        const { isError } = await call('get-bet', { id: 1 })
        expect(isError).toBe(true)
    })

    it('list-bets builds the where filter', async () => {
        bet.findMany.mockResolvedValueOnce([])
        await call('list-bets', {
            source: 'INTUITION',
            status: 'WON',
            sport: 'NBA',
        })
        const where = bet.findMany.mock.calls[0][0].where
        expect(where).toEqual({
            source: 'INTUITION',
            status: 'WON',
            sport: 'NBA',
        })
    })
})

describe('bet tools — bet-analytics segmentation', () => {
    it('splits metrics by source (intuition vs AI)', async () => {
        bet.findMany.mockResolvedValueOnce([
            {
                status: 'WON',
                stake: 100,
                oddsAmerican: 100,
                source: 'INTUITION',
            },
            {
                status: 'LOST',
                stake: 100,
                oddsAmerican: -110,
                source: 'INTUITION',
            },
            {
                status: 'WON',
                stake: 100,
                oddsAmerican: 150,
                source: 'AI_ASSISTED',
            },
        ])
        const { data } = await call('bet-analytics', {})
        expect(data.overall.count).toBe(3)
        expect(data.bySource.INTUITION.count).toBe(2)
        expect(data.bySource.INTUITION.wins).toBe(1)
        expect(data.bySource.AI_ASSISTED.count).toBe(1)
        expect(data.bySource.AI_ASSISTED.profit).toBeCloseTo(150)
    })
})
