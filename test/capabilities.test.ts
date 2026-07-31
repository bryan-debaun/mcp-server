import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
    capabilitySummary,
    logCapabilityWarnings,
    resolveCapabilities,
} from '../src/capabilities.js'
import { config } from '../src/config.js'
import { logger } from '../src/logger.js'

const mockWarn = logger.warn as unknown as ReturnType<typeof vi.fn>

const ORIGINAL = {
    githubToken: config.github.token,
    databaseUrl: config.database.url,
    spotifyEnabled: config.spotify.enabled,
    oddsEnabled: config.odds.enabled,
    sentryDsn: config.sentry.dsn,
}

/** Configure every capability so tests can turn exactly one off. */
function enableAll() {
    ;(config as any).github.token = 'ghp_test'
    ;(config as any).database.url = 'postgres://example'
    ;(config as any).spotify.enabled = true
    ;(config as any).odds.enabled = true
    ;(config as any).sentry.dsn = 'https://key@sentry.example/1'
}

afterEach(() => {
    ;(config as any).github.token = ORIGINAL.githubToken
    ;(config as any).database.url = ORIGINAL.databaseUrl
    ;(config as any).spotify.enabled = ORIGINAL.spotifyEnabled
    ;(config as any).odds.enabled = ORIGINAL.oddsEnabled
    ;(config as any).sentry.dsn = ORIGINAL.sentryDsn
    mockWarn.mockReset()
})

describe('resolveCapabilities', () => {
    it('reports github as disabled when GITHUB_TOKEN is unset (#155)', () => {
        enableAll()
        ;(config as any).github.token = undefined
        const github = resolveCapabilities().find((c) => c.name === 'github')
        expect(github).toMatchObject({
            enabled: false,
            requires: 'GITHUB_TOKEN',
        })
    })

    it('reports github as enabled when GITHUB_TOKEN is set', () => {
        enableAll()
        const github = resolveCapabilities().find((c) => c.name === 'github')
        expect(github?.enabled).toBe(true)
    })

    it('summarises every capability as a name -> boolean map', () => {
        enableAll()
        expect(capabilitySummary()).toEqual({
            github: true,
            database: true,
            spotify: true,
            odds: true,
            sentry: true,
        })
    })
})

describe('logCapabilityWarnings', () => {
    it('warns once for GITHUB_TOKEN, naming the var and the impact', () => {
        enableAll()
        ;(config as any).github.token = undefined

        logCapabilityWarnings()

        expect(mockWarn).toHaveBeenCalledTimes(1)
        const [message] = mockWarn.mock.calls[0]
        expect(message).toContain('GITHUB_TOKEN')
        expect(message).toContain('github')
        expect(message).toContain('fail at call time')
    })

    it('stays silent when everything is configured', () => {
        enableAll()
        logCapabilityWarnings()
        expect(mockWarn).not.toHaveBeenCalled()
    })

    it('warns for each unconfigured capability independently', () => {
        enableAll()
        ;(config as any).github.token = undefined
        ;(config as any).sentry.dsn = undefined

        logCapabilityWarnings()

        expect(mockWarn).toHaveBeenCalledTimes(2)
    })

    it('uses warn, never error — logger.error is bridged to Sentry', () => {
        enableAll()
        ;(config as any).github.token = undefined
        logCapabilityWarnings()
        expect(logger.error).not.toHaveBeenCalled()
    })
})
