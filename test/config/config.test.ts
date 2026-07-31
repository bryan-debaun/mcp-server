import { describe, expect, it } from 'vitest'
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
            expect(['development', 'production', 'test']).toContain(
                config.nodeEnv,
            )
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

        it('auth.oidc.issuer is a string when set', () => {
            if (config.auth.oidc.issuer !== undefined) {
                expect(typeof config.auth.oidc.issuer).toBe('string')
                expect(config.auth.oidc.issuer.length).toBeGreaterThan(0)
            }
        })

        it('auth.oidc.jwksUrl is derived under /auth/v1 from PUBLIC_SUPABASE_URL when no explicit JWKS URL is set', () => {
            if (
                !process.env.OIDC_JWKS_URL &&
                !process.env.SUPABASE_JWKS_URL &&
                !process.env.OIDC_DISCOVERY_BASE &&
                process.env.PUBLIC_SUPABASE_URL
            ) {
                // Supabase serves JWKS under the GoTrue path, not the project root.
                expect(config.auth.oidc.jwksUrl).toContain(
                    '/auth/v1/.well-known/jwks.json',
                )
            }
        })

        it('auth.oidc.issuer is derived under /auth/v1 from PUBLIC_SUPABASE_URL when no explicit issuer is set', () => {
            if (
                !process.env.OIDC_ISSUER &&
                !process.env.SUPABASE_ISS &&
                !process.env.OIDC_DISCOVERY_BASE &&
                process.env.PUBLIC_SUPABASE_URL
            ) {
                // Token `iss` is `https://<ref>.supabase.co/auth/v1`, not the bare root.
                expect(config.auth.oidc.issuer).toMatch(/\/auth\/v1$/)
            }
        })

        it('auth.oidc.audience defaults to "authenticated" when unset', () => {
            if (!process.env.OIDC_AUDIENCE && !process.env.SUPABASE_AUD) {
                expect(config.auth.oidc.audience).toBe('authenticated')
            }
        })

        it('auth.serviceRoleKey normalizes SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SECRET_KEY aliases', () => {
            if (config.auth.serviceRoleKey !== undefined) {
                expect(typeof config.auth.serviceRoleKey).toBe('string')
            }
        })

        // --- #150: provider-neutral OIDC config ----------------------------

        it('auth.oidc.roleClaimPaths defaults to the historical hardcoded paths', () => {
            if (!process.env.OIDC_ROLE_CLAIM_PATH) {
                expect(config.auth.oidc.roleClaimPaths).toEqual([
                    'app_metadata.role',
                    'user_role',
                ])
            }
        })

        it('exposes no supabase-prefixed identifier on config.auth (#150 acceptance)', () => {
            const walk = (obj: any, path = 'auth'): string[] =>
                Object.entries(obj).flatMap(([key, value]) => [
                    ...(/supabase/i.test(key) ? [`${path}.${key}`] : []),
                    ...(value &&
                    typeof value === 'object' &&
                    !Array.isArray(value)
                        ? walk(value, `${path}.${key}`)
                        : []),
                ])
            expect(walk(config.auth)).toEqual([])
        })
    })
})
