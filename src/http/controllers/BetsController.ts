import {
    Body,
    Controller,
    Delete,
    Get,
    Path,
    Post,
    Put,
    Query,
    Response,
    Route,
    Security,
    SuccessResponse,
    Tags,
} from 'tsoa'
import { callTool } from '../../tools/local.js'
import { httpError, isNotFound } from './_http-errors.js'

export type BetMarket = 'moneyline' | 'spread' | 'total' | 'prop' | 'parlay'
export type BetSource = 'INTUITION' | 'AI_ASSISTED'
export type BetStatus = 'PENDING' | 'WON' | 'LOST' | 'PUSH' | 'VOID'

export interface Bet {
    id: number
    placedAt: string
    sport: string
    league?: string | null
    event: string
    market: BetMarket
    selection: string
    line?: number | null
    oddsAmerican: number
    stake: number
    book: string
    status: BetStatus
    settledAt?: string | null
    payout?: number | null
    source: BetSource
    aiModel?: string | null
    aiRationale?: string | null
    aiEstProb?: number | null
    aiEV?: number | null
    closingLine?: number | null
    closingOddsAmerican?: number | null
    legs?: unknown
    notes?: string | null
    createdAt: string
    updatedAt: string
}

export interface ListBetsResponse {
    bets: Bet[]
    total: number
}

export interface BetMetrics {
    count: number
    pending: number
    settled: number
    wins: number
    losses: number
    pushes: number
    voids: number
    hitRate: number | null
    staked: number
    profit: number
    roi: number | null
    units: number | null
    clvCount: number
    avgClvPct: number | null
}

export interface BetAnalyticsResponse {
    overall: BetMetrics
    bySource: { INTUITION: BetMetrics; AI_ASSISTED: BetMetrics }
}

export interface BetLeg {
    event: string
    selection: string
    /** Optional: same-game parlays expose only the combined price, not per-leg odds (#137). */
    oddsAmerican?: number
    line?: number
}

export interface CreateBetRequest {
    sport: string
    event: string
    market: BetMarket
    selection: string
    oddsAmerican: number
    stake: number
    source: BetSource
    league?: string
    line?: number
    book?: string
    placedAt?: string
    aiModel?: string
    aiRationale?: string
    aiEstProb?: number
    aiEV?: number
    legs?: BetLeg[]
    notes?: string
}

export interface UpdateBetRequest {
    sport?: string
    league?: string
    event?: string
    market?: BetMarket
    selection?: string
    line?: number
    oddsAmerican?: number
    stake?: number
    book?: string
    source?: BetSource
    aiModel?: string
    aiRationale?: string
    aiEstProb?: number
    aiEV?: number
    closingLine?: number
    closingOddsAmerican?: number
    legs?: BetLeg[]
    notes?: string
}

export interface SettleBetRequest {
    status: 'WON' | 'LOST' | 'PUSH' | 'VOID'
    payout?: number
}

/**
 * Sports-bet tracker (#128). Reads are gated by the MCP gateway key; writes
 * require admin auth. Bets are private (admin-only at the RLS layer too).
 */
@Route('api/bets')
@Tags('Bets')
export class BetsController extends Controller {
    /**
     * List bets with optional filters.
     * @param source Filter by source (INTUITION | AI_ASSISTED)
     * @param status Filter by status
     * @param sport Filter by sport
     * @param market Filter by market
     */
    @Get()
    @Security('api_key')
    @SuccessResponse('200', 'Bets retrieved successfully')
    public async listBets(
        @Query() source?: BetSource,
        @Query() status?: BetStatus,
        @Query() sport?: string,
        @Query() market?: BetMarket,
        @Query() limit?: number,
        @Query() offset?: number,
    ): Promise<ListBetsResponse> {
        const result = await callTool('list-bets', {
            source,
            status,
            sport,
            market,
            limit,
            offset,
        })
        return result as ListBetsResponse
    }

    /**
     * Performance analytics (ROI, hit-rate, units, CLV) segmented by source —
     * the intuition-vs-AI scoreboard. Declared before `{id}` to avoid a route clash.
     */
    @Get('analytics')
    @Security('api_key')
    @SuccessResponse('200', 'Analytics computed')
    public async getAnalytics(
        @Query() source?: BetSource,
        @Query() sport?: string,
        @Query() market?: BetMarket,
        @Query() from?: string,
        @Query() to?: string,
    ): Promise<BetAnalyticsResponse> {
        const result = await callTool('bet-analytics', {
            source,
            sport,
            market,
            from,
            to,
        })
        return result as BetAnalyticsResponse
    }

    /**
     * Get a bet by ID.
     * @param id Bet ID
     */
    @Get('{id}')
    @Security('api_key')
    @SuccessResponse('200', 'Bet retrieved successfully')
    @Response('404', 'Bet not found')
    public async getBet(@Path() id: number): Promise<Bet> {
        try {
            const result = await callTool('get-bet', { id })
            return result as Bet
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Bet not found')
            throw err
        }
    }

    /**
     * Log a new bet (admin only).
     */
    @Post()
    @Security('jwt', ['admin'])
    @SuccessResponse('201', 'Bet created successfully')
    @Response('400', 'Invalid request')
    @Response('401', 'Unauthorized')
    public async createBet(@Body() body: CreateBetRequest): Promise<Bet> {
        for (const field of [
            'sport',
            'event',
            'market',
            'selection',
            'source',
        ] as const) {
            if (!body[field]) throw httpError(400, `${field} is required`)
        }
        if (typeof body.oddsAmerican !== 'number')
            throw httpError(400, 'oddsAmerican is required')
        if (typeof body.stake !== 'number')
            throw httpError(400, 'stake is required')
        const result = await callTool('create-bet', body)
        this.setStatus(201)
        return result as Bet
    }

    /**
     * Update a bet by ID (admin only) — edit details or set closing line for CLV.
     * @param id Bet ID
     */
    @Put('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Bet updated successfully')
    @Response('404', 'Bet not found')
    public async updateBet(
        @Path() id: number,
        @Body() body: UpdateBetRequest,
    ): Promise<Bet> {
        try {
            const result = await callTool('update-bet', { ...body, id })
            return result as Bet
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Bet not found')
            throw err
        }
    }

    /**
     * Settle a bet outcome (admin only). Payout auto-computed on a win.
     * @param id Bet ID
     */
    @Post('{id}/settle')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Bet settled')
    @Response('404', 'Bet not found')
    public async settleBet(
        @Path() id: number,
        @Body() body: SettleBetRequest,
    ): Promise<Bet> {
        try {
            const result = await callTool('settle-bet', { ...body, id })
            return result as Bet
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Bet not found')
            throw err
        }
    }

    /**
     * Delete a bet by ID (admin only).
     * @param id Bet ID
     */
    @Delete('{id}')
    @Security('jwt', ['admin'])
    @SuccessResponse('200', 'Bet deleted successfully')
    @Response('404', 'Bet not found')
    public async deleteBet(@Path() id: number): Promise<{ success: boolean }> {
        try {
            await callTool('delete-bet', { id })
            return { success: true }
        } catch (err: any) {
            if (isNotFound(err)) throw httpError(404, 'Bet not found')
            throw err
        }
    }
}
