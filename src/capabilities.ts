import { config } from './config.js'
import { logger } from './logger.js'

/**
 * An optional integration whose absence *degrades* the server rather than
 * breaking it. Every one of these is `optional()` in the zod env schema on
 * purpose — this server does plenty of useful work without any single one of
 * them, so a missing credential must never refuse boot (see issue #155).
 *
 * The cost of that choice is that a missing secret used to be invisible until
 * somebody called a tool and got a runtime error with no corresponding startup
 * signal. This module is the counterweight: warn loudly at boot, and report the
 * state on the diagnostic health endpoint.
 */
export interface Capability {
    /** Stable identifier; also the key used in the `/healthz?deep=1` payload. */
    name: string
    /** Whether the capability is configured, and therefore usable. */
    enabled: boolean
    /** The env var that enables it — named so the fix is obvious from the log. */
    requires: string
    /** What stops working while it is unconfigured. */
    impact: string
}

/** Snapshot the configured/unconfigured state of every optional integration. */
export function resolveCapabilities(): Capability[] {
    return [
        {
            name: 'github',
            enabled: Boolean(config.github.token),
            requires: 'GITHUB_TOKEN',
            impact: 'GitHub Issues and Projects v2 tools fail at call time',
        },
        {
            name: 'database',
            enabled: Boolean(config.database.url),
            requires: 'DATABASE_URL',
            impact: 'catalog reads return empty and writes throw (stub Prisma client)',
        },
        {
            name: 'spotify',
            enabled: config.spotify.enabled,
            requires:
                'SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET + SPOTIFY_REFRESH_TOKEN',
            impact: 'Spotify playback and now-playing routes are disabled',
        },
        {
            name: 'odds',
            enabled: config.odds.enabled,
            requires: 'ODDS_API_KEY',
            impact: 'betting odds and event tools fail at call time',
        },
        {
            name: 'sentry',
            enabled: Boolean(config.sentry.dsn),
            requires: 'SENTRY_DSN',
            impact: 'errors are not reported anywhere except the log stream',
        },
    ]
}

/** `{ github: true, database: false, … }` — the shape served by health. */
export function capabilitySummary(): Record<string, boolean> {
    return Object.fromEntries(
        resolveCapabilities().map((c) => [c.name, c.enabled]),
    )
}

/**
 * Log one warning per unconfigured capability at startup.
 *
 * Deliberately `warn`, not `error`: `logger.error` is bridged to Sentry, and a
 * deployment that intentionally runs without (say) Spotify would otherwise page
 * on every boot. The signal belongs in the boot logs, not the error tracker.
 */
export function logCapabilityWarnings(): void {
    for (const c of resolveCapabilities()) {
        if (c.enabled) continue
        logger.warn(
            `capability disabled: ${c.name} — ${c.requires} not set; ${c.impact}`,
        )
    }
}
