# Betting odds tools (Phase 2 — #129)

Read-only odds-analysis MCP tools backed by [The Odds API](https://the-odds-api.com/), plus the CLV-grading flow for the bet tracker (#128). These are the "AI-assisted" toolkit from the epic (#127). **No bets are placed** — analysis only.

## Configuration

Set `ODDS_API_KEY` (free tier at the-odds-api.com). When unset, the API-backed tools return a clean "Odds API not configured" error and the rest of the server is unaffected (same spirit as the Prisma stub contract). `ODDS_API_BASE` defaults to `https://api.the-odds-api.com/v4`.

## Tools

| Tool | API? | Purpose |
|------|------|---------|
| `list-sports` | yes | In-season sports + their keys (e.g. `basketball_nba`) |
| `list-events` | yes | Upcoming events for a sport |
| `get-odds` | yes | A game's odds across books (incl. DraftKings); `markets=h2h,spreads,totals` |
| `devig` | no | Strip vig from a market → fair probabilities + book hold |
| `find-positive-ev` | yes | Prices that beat the no-vig **consensus** across books |
| `find-arbitrage` | yes | Cross-book h2h arbitrage (best price per side summing < 100%) |
| `build-parlay` | no | Combine legs → combined odds, implied/fair prob, EV |

**Honesty built in:** `build-parlay` always returns a caveat (parlays compound vig, assume independent legs, and correlated legs get limited/voided); `find-positive-ev`/`find-arbitrage` note they're most reliable for h2h and that lines move — verify before acting. Markets are sharp; these tools surface candidates, not guaranteed edges.

## CLV grading flow (ties Phase 1 + Phase 2)

Closing-line value is the primary intuition-vs-AI signal (#127). Capturing it:

1. Near event start, fetch the closing number with `get-odds` (the price right before tip/kick is the closing line).
2. Record it on the tracked bet with `update-bet { id, closingOddsAmerican }` (Phase 1 field).
3. `bet-analytics` then reports `avgClvPct` (beat-the-close %) segmented by `INTUITION` vs `AI_ASSISTED`.

> Auto-matching a tracked bet to its Odds-API event/outcome (to fill the closing line without manual entry) is a possible enhancement; v2 keeps capture explicit via `update-bet` to avoid brittle fuzzy matching.

## Example (MCP client)

> "What NBA games have +EV moneylines tonight?" → `find-positive-ev sport=basketball_nba`
> "Devig these: -110 / -110" → `devig`
> "Build a parlay: Celtics ML -150, Over 220 -110" → `build-parlay` (returns combined odds + caveat)
