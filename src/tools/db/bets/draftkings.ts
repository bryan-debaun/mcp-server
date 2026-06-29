/**
 * Best-effort DraftKings Sportsbook navigation links.
 *
 * DraftKings has NO public, documented pre-filled bet-slip URL scheme, so we
 * cannot deep-link to a ready-to-confirm slip. These links point at the relevant
 * league page (or the sportsbook home) as a navigation aid — you find the event
 * and place the bet manually. Paths are best-effort and may need adjusting.
 */

// The Odds API sport key → DraftKings Sportsbook league path.
const LEAGUE_PATHS: Record<string, string> = {
    basketball_nba: 'basketball/nba',
    basketball_ncaab: 'basketball/ncaab',
    basketball_wnba: 'basketball/wnba',
    americanfootball_nfl: 'football/nfl',
    americanfootball_ncaaf: 'football/ncaaf',
    baseball_mlb: 'baseball/mlb',
    icehockey_nhl: 'hockey/nhl',
    soccer_epl: 'soccer/england-premier-league',
    soccer_usa_mls: 'soccer/mls',
    mma_mixed_martial_arts: 'mma',
}

const BASE = 'https://sportsbook.draftkings.com'

/** A DK Sportsbook link for the sport (league page when known, else home). */
export function draftkingsLink(sport?: string): string {
    const path = sport ? LEAGUE_PATHS[sport] : undefined
    return path ? `${BASE}/leagues/${path}` : BASE
}
