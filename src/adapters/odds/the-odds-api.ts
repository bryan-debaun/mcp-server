/**
 * Thin adapter for The Odds API (https://the-odds-api.com), v4. Read-only.
 * Mirrors the Spotify adapter pattern: a small typed surface over `fetch`, with
 * graceful failure when `ODDS_API_KEY` is unset (callers surface a clean error).
 */
import { config } from '../../config.js'
import { logger } from '../../logger.js'

export interface OddsApiSport {
    key: string
    group: string
    title: string
    description: string
    active: boolean
    has_outcomes: boolean
}

export interface OddsApiEvent {
    id: string
    sport_key: string
    sport_title?: string
    commence_time: string
    home_team: string | null
    away_team: string | null
}

export interface OddsApiOutcome {
    name: string
    price: number // American odds (oddsFormat=american)
    point?: number
}

export interface OddsApiMarket {
    key: string // h2h | spreads | totals | ...
    last_update?: string
    outcomes: OddsApiOutcome[]
}

export interface OddsApiBookmaker {
    key: string // e.g. "draftkings"
    title: string
    last_update?: string
    markets: OddsApiMarket[]
}

export interface OddsApiEventOdds extends OddsApiEvent {
    bookmakers: OddsApiBookmaker[]
}

export class OddsApiNotConfiguredError extends Error {
    constructor() {
        super('Odds API not configured: set ODDS_API_KEY')
        this.name = 'OddsApiNotConfiguredError'
    }
}

/** True when an API key is present. */
export function isOddsConfigured(): boolean {
    return Boolean(config.odds.apiKey)
}

async function request<T>(
    path: string,
    params: Record<string, string | undefined> = {},
): Promise<T> {
    if (!config.odds.apiKey) throw new OddsApiNotConfiguredError()

    const url = new URL(`${config.odds.baseUrl}${path}`)
    url.searchParams.set('apiKey', config.odds.apiKey)
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v)
    }

    const res = await fetch(url)
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        logger.warn('odds api request failed', {
            path,
            status: res.status,
        })
        throw new Error(`Odds API ${res.status}: ${body.slice(0, 200)}`)
    }
    return (await res.json()) as T
}

/** List in-season sports (and their keys). */
export function getSports(): Promise<OddsApiSport[]> {
    return request<OddsApiSport[]>('/sports')
}

/** List upcoming events for a sport. */
export function getEvents(sport: string): Promise<OddsApiEvent[]> {
    return request<OddsApiEvent[]>(`/sports/${sport}/events`)
}

export interface OddsQuery {
    regions?: string // default "us"
    markets?: string // default "h2h"
    oddsFormat?: string // default "american"
}

/** Odds for all upcoming events in a sport, across books. */
export function getOdds(
    sport: string,
    opts: OddsQuery = {},
): Promise<OddsApiEventOdds[]> {
    return request<OddsApiEventOdds[]>(`/sports/${sport}/odds`, {
        regions: opts.regions ?? 'us',
        markets: opts.markets ?? 'h2h',
        oddsFormat: opts.oddsFormat ?? 'american',
    })
}

/** Odds for a single event (supports richer markets / props). */
export function getEventOdds(
    sport: string,
    eventId: string,
    opts: OddsQuery = {},
): Promise<OddsApiEventOdds> {
    return request<OddsApiEventOdds>(
        `/sports/${sport}/events/${eventId}/odds`,
        {
            regions: opts.regions ?? 'us',
            markets: opts.markets ?? 'h2h',
            oddsFormat: opts.oddsFormat ?? 'american',
        },
    )
}
