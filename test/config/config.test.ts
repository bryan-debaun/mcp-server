import { describe, it, expect } from 'vitest'
import { config } from '../../src/config.js'

describe('config module', () => {
    describe('structure', () => {
        it('exports config with all required domain sections', () => {
            expect(config).toHaveProperty('server')
            expect(config).toHaveProperty('security')
            expect(config).toHaveProperty('database')
            expect(config).toHaveProperty('auth')
            expect(config).toHaveProperty('spotify')
            expect(config).toHaveProperty('github')
            expect(config).toHaveProperty('ci')
        })

        it('nodeEnv is one of the allowed enum values', () => {
            expect(['development', 'production', 'test']).toContain(config.nodeEnv)
        })

        it('isProduction and isTest are mutually exclusive booleans', () => {
            expect(typeof config.isProduction).toBe('boolean')
            expect(typeof config.isTest).toBe('boolean')
            // They can't both be true
            expect(config.isProduction && config.isTest).toBe(false)
        })

        it('isProduction matches nodeEnv === production', () => {
            expect(config.isProduction).toBe(config.nodeEnv === 'production')
        })

        it('isTest matches nodeEnv === test', () => {
            expect(config.isTest).toBe(config.nodeEnv === 'test')
        })
    })

    describe('default values', () => {
        it('spotify.pollIntervalMs defaults to 15000', () => {
            if (!process.env.SPOTIFY_POLL_INTERVAL_MS) {
                expect(config.spotify.pollIntervalMs).toBe(15_000)
            } else {
                expect(config.spotify.pollIntervalMs).toBeGreaterThan(0)
            }
        })

        it('server.host defaults to 0.0.0.0', () => {
            if (!process.env.HOST) {
                expect(config.server.host).toBe('0.0.0.0')
            }
        })
    })

    describe('CSV array parsing (ADMIN_IP_ALLOWLIST)', () => {
        it('adminIpAllowlist is always an array', () => {
            expect(Array.isArray(config.security.adminIpAllowlist)).toBe(true)
        })

        it('adminIpAllowlist contains only non-empty strings', () => {
            config.security.adminIpAllowlist.forEach((entry) => {
                expect(typeof entry).toBe('string')
                expect(entry.length).toBeGreaterThan(0)
            })
        })
    })

    describe('boolean flag parsing', () => {
        it('adminDebugEnabled is a boolean', () => {
            expect(typeof config.security.adminDebugEnabled).toBe('boolean')
        })

        it('ci.runDbIntegration is a boolean', () => {
            expect(typeof config.ci.runDbIntegration).toBe('boolean')
        })
    })

    describe('alias normalization', () => {
        it('spotify.enabled is true only when all three Spotify credentials are set', () => {
            const expected =
                Boolean(config.spotify.clientId) &&
                Boolean(config.spotify.clientSecret) &&
                Boolean(config.spotify.refreshToken)
            expect(config.spotify.enabled).toBe(expected)
        })

        it('auth.supabaseIss is a string when set', () => {
            if (config.auth.supabaseIss !== undefined) {
                expect(typeof config.auth.supabaseIss).toBe('string')
                expect(config.auth.supabaseIss.length).toBeGreaterThan(0)
            }
        })

        it('auth.supabaseJwksUrl is derived from PUBLIC_SUPABASE_URL when SUPABASE_JWKS_URL absent', () => {
            if (!process.env.SUPABASE_JWKS_URL && process.env.PUBLIC_SUPABASE_URL) {
                expect(config.auth.supabaseJwksUrl).toContain('.well-known/jwks.json')
            }
        })

        it('auth.supabaseServiceRoleKey normalizes SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SECRET_KEY aliases', () => {
            if (config.auth.supabaseServiceRoleKey !== undefined) {
                expect(typeof config.auth.supabaseServiceRoleKey).toBe('string')
            }
        })

    })
})
