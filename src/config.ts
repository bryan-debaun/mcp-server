/**
 * Centralized environment configuration with Zod validation.
 * This is the ONLY place in the codebase that reads process.env directly.
 *
 * Usage: import { config } from './config.js'
 */

// Load dotenv before reading process.env. Only in non-production — hosted
// environments (Render) inject vars directly. Load `.env.local` first so its
// values take precedence over `.env`, while real shell env vars still win over
// both (dotenv's default `override: false` never clobbers what's already set).
// This matches the test setup (vitest loads `.env.local`) and the conventional
// "`.env.local` = local overrides" behavior. Safe to call multiple times.
if (process.env.NODE_ENV !== 'production') {
    try {
        const { config: loadEnv } = await import('dotenv')
        loadEnv({ path: '.env.local' })
        loadEnv() // .env — fills anything not already set
    } catch {
        // dotenv not installed or not available; env vars provided by platform
    }
}

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a comma-separated string into a trimmed, non-empty string array. */
const csvArray = z
    .string()
    .optional()
    .transform((val) =>
        val
            ? val
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
            : [],
    )

/** Coerce a string boolean flag ('1', 'true', 'yes') to boolean. */
const boolFlag = z
    .string()
    .optional()
    .transform((val) => {
        const v = (val ?? '').toLowerCase()
        return v === '1' || v === 'true' || v === 'yes'
    })

/** Coerce a string to a positive integer with a default fallback. */
function posInt(defaultValue: number) {
    return z
        .string()
        .optional()
        .transform((val) => {
            const n = Number(val ?? defaultValue)
            return Number.isFinite(n) && n > 0 ? n : defaultValue
        })
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const envSchema = z.object({
    // ── Core ──────────────────────────────────────────────────────────────
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .optional()
        .default('development'),
    PORT: z
        .string()
        .optional()
        .transform((val) => (val ? Number(val) : undefined))
        .refine(
            (val) => val === undefined || (Number.isFinite(val) && val > 0),
            {
                message: 'PORT must be a positive integer',
            },
        ),
    HOST: z.string().optional(),
    MCP_TRANSPORT: z.enum(['stdio', 'http']).optional(),
    EARLY_START: boolFlag,
    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .optional(),

    // ── Security ──────────────────────────────────────────────────────────
    MCP_API_KEY: z.string().optional(),
    ADMIN_DEBUG_ENABLED: boolFlag,
    ADMIN_IP_ALLOWLIST: csvArray,
    INTERNAL_ADMIN_KEY: z.string().optional(),

    // ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: z.string().url().optional(),

    // ── Auth / OIDC ───────────────────────────────────────────────────────
    // Provider-neutral names (#150). The mechanism was always vendor-agnostic —
    // OIDC discovery + JWKS + standard claims — only the naming was Supabase's.
    // The legacy `SUPABASE_*` spellings are still accepted so the Render env can
    // be renamed across a deploy boundary without an auth outage; the new name
    // wins, and a warning fires while only the legacy one is set.
    OIDC_JWKS_URL: z.string().url().optional(),
    OIDC_ISSUER: z.string().optional(),
    OIDC_AUDIENCE: z.string().optional(),
    // Where to run OIDC discovery. Explicit, provider-neutral form; falls back to
    // `PUBLIC_SUPABASE_URL + /auth/v1` (GoTrue's base) when unset.
    OIDC_DISCOVERY_BASE: z.string().url().optional(),
    // Comma-separated dotted claim paths searched in order for an application
    // role. Default reproduces the previous hardcoded behaviour exactly.
    OIDC_ROLE_CLAIM_PATH: z.string().optional(),

    // Legacy aliases — retained for one deploy, then droppable (#150).
    SUPABASE_JWKS_URL: z.string().url().optional(),
    SUPABASE_ISS: z.string().optional(),
    SUPABASE_AUD: z.string().optional(),

    // Supabase project URL — still the input we derive discovery from today, and
    // genuinely Supabase's own name for it, so it keeps its spelling.
    PUBLIC_SUPABASE_URL: z.string().url().optional(),
    // Service role key — accept either alias. Not part of token verification;
    // this is the bearer shortcut #152 tracks replacing with client_credentials.
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_SECRET_KEY: z.string().optional(),
    // Anon / publishable key — accept either alias
    SUPABASE_ANON_KEY: z.string().optional(),
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),

    // ── Spotify ───────────────────────────────────────────────────────────
    SPOTIFY_CLIENT_ID: z.string().optional(),
    SPOTIFY_CLIENT_SECRET: z.string().optional(),
    SPOTIFY_REFRESH_TOKEN: z.string().optional(),
    SPOTIFY_REDIRECT_URI: z.string().url().optional(),
    SPOTIFY_POLL_INTERVAL_MS: posInt(15_000),

    // ── Odds (The Odds API) ───────────────────────────────────────────────
    ODDS_API_KEY: z.string().optional(),
    ODDS_API_BASE: z
        .string()
        .url()
        .optional()
        .default('https://api.the-odds-api.com/v4'),

    // ── GitHub ────────────────────────────────────────────────────────────
    GITHUB_TOKEN: z.string().optional(),

    // ── Sentry ────────────────────────────────────────────────────────────
    SENTRY_DSN: z.string().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_RELEASE: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z
        .string()
        .optional()
        .transform((val) => {
            const n = Number(val ?? 0)
            return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0
        }),

    // ── Test / CI flags ───────────────────────────────────────────────────
    RUN_DB_INTEGRATION: boolFlag,
    RUN_GITHUB_PROJECTS_INTEGRATION: boolFlag,
    GITHUB_TEST_OWNER: z.string().optional(),
    GITHUB_TEST_REPO: z.string().optional(),
    GITHUB_TEST_PROJECT_NUMBER: posInt(0),
    GITHUB_TEST_ISSUE_NUMBER: posInt(0),
})

// ---------------------------------------------------------------------------
// Parse & exit-on-failure
// ---------------------------------------------------------------------------

const result = envSchema.safeParse(process.env)

if (!result.success) {
    console.error(
        '❌  Configuration error — fix the following env vars and restart:',
    )
    for (const issue of result.error.issues) {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
}

const env = result.data

// ---------------------------------------------------------------------------
// Derived / normalized values
// ---------------------------------------------------------------------------

// ── OIDC (#150) ────────────────────────────────────────────────────────────
// Each setting accepts the provider-neutral name first and the legacy
// Supabase-prefixed name second, so both can coexist for one deploy.
const oidcJwksUrlFromEnv = env.OIDC_JWKS_URL ?? env.SUPABASE_JWKS_URL
const oidcIssuerFromEnv = env.OIDC_ISSUER ?? env.SUPABASE_ISS
const oidcAudienceFromEnv = env.OIDC_AUDIENCE ?? env.SUPABASE_AUD

/** Legacy env names still in use — reported at boot so the rename can finish. */
export const legacyAuthEnvNames: string[] = [
    env.OIDC_JWKS_URL === undefined && env.SUPABASE_JWKS_URL !== undefined
        ? 'SUPABASE_JWKS_URL → OIDC_JWKS_URL'
        : undefined,
    env.OIDC_ISSUER === undefined && env.SUPABASE_ISS !== undefined
        ? 'SUPABASE_ISS → OIDC_ISSUER'
        : undefined,
    env.OIDC_AUDIENCE === undefined && env.SUPABASE_AUD !== undefined
        ? 'SUPABASE_AUD → OIDC_AUDIENCE'
        : undefined,
].filter((v): v is string => v !== undefined)

// Supabase's GoTrue auth service lives under `/auth/v1`, so both the issuer and
// the JWKS endpoint are derived from `PUBLIC_SUPABASE_URL + /auth/v1` — NOT the
// project root. (The token's `iss` is `https://<ref>.supabase.co/auth/v1` and the
// JWKS lives at `<iss>/.well-known/jwks.json`; deriving from the bare root yields
// a 404 JWKS and an issuer mismatch — both surface as opaque 401s.)
// `OIDC_DISCOVERY_BASE` overrides this for any non-Supabase issuer.
const oidcDiscoveryBase: string | undefined =
    env.OIDC_DISCOVERY_BASE ??
    (env.PUBLIC_SUPABASE_URL
        ? `${env.PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/auth/v1`
        : undefined)

/** Resolved JWKS URL: explicit var wins; derived from the discovery base otherwise. */
const oidcJwksUrl: string | undefined =
    oidcJwksUrlFromEnv ??
    (oidcDiscoveryBase
        ? `${oidcDiscoveryBase}/.well-known/jwks.json`
        : undefined)

/** Resolved issuer: explicit var wins; fallback to the discovery base. */
const oidcIssuer: string | undefined = oidcIssuerFromEnv ?? oidcDiscoveryBase

/**
 * Dotted claim paths searched in order for an application role.
 *
 * The default reproduces the previous hardcoded behaviour: `app_metadata.role`
 * (admin-controlled, the standard Supabase RBAC location) then a top-level
 * `user_role` claim from a custom access-token hook. A different provider can
 * point this at, say, `scope` or a namespaced claim without a code change.
 */
const oidcRoleClaimPaths: string[] = (
    env.OIDC_ROLE_CLAIM_PATH ?? 'app_metadata.role,user_role'
)
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

/** Service role key: prefer the canonical name; accept legacy alias. */
const supabaseServiceRoleKey: string | undefined =
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY

/** Anon / publishable key: prefer the canonical name; accept legacy alias. */
const supabaseAnonKey: string | undefined =
    env.SUPABASE_ANON_KEY ?? env.PUBLIC_SUPABASE_PUBLISHABLE_KEY

/** Whether all three Spotify credentials are present. */
const spotifyEnabled =
    Boolean(env.SPOTIFY_CLIENT_ID) &&
    Boolean(env.SPOTIFY_CLIENT_SECRET) &&
    Boolean(env.SPOTIFY_REFRESH_TOKEN)

// ---------------------------------------------------------------------------
// Exported config object
// ---------------------------------------------------------------------------

export const config = {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',

    // Log level: explicit LOG_LEVEL wins; otherwise quiet in tests, verbose in
    // dev, info in production.
    logLevel:
        env.LOG_LEVEL ??
        (env.NODE_ENV === 'test'
            ? 'silent'
            : env.NODE_ENV === 'production'
              ? 'info'
              : 'debug'),

    server: {
        port: env.PORT,
        host: env.HOST ?? '0.0.0.0',
        mcpTransport: env.MCP_TRANSPORT,
        earlyStart: env.EARLY_START,
    },

    security: {
        mcpApiKey: env.MCP_API_KEY,
        adminDebugEnabled: env.ADMIN_DEBUG_ENABLED,
        adminIpAllowlist: env.ADMIN_IP_ALLOWLIST,
        internalAdminKey: env.INTERNAL_ADMIN_KEY,
    },

    database: {
        url: env.DATABASE_URL,
    },

    auth: {
        // Provider-neutral OIDC verification parameters (#150). Nothing in here
        // is Supabase-specific: OIDC discovery + JWKS + standard claims already
        // *is* the vendor-agnostic interface, so pointing at a different issuer
        // is an env change rather than a code change.
        oidc: {
            // Derived (or explicit) JWKS URL / issuer — the fallback when OIDC
            // discovery is unavailable. The `*FromEnv` flags tell the auth layer
            // whether the operator pinned these explicitly (in which case they
            // win over discovery).
            jwksUrl: oidcJwksUrl,
            issuer: oidcIssuer,
            jwksUrlFromEnv: Boolean(oidcJwksUrlFromEnv),
            issuerFromEnv: Boolean(oidcIssuerFromEnv),
            // Base for `/.well-known/openid-configuration`.
            discoveryBase: oidcDiscoveryBase,
            // Supabase access tokens carry `aud: 'authenticated'` by default;
            // allow an explicit override but don't require operators to set it.
            audience: oidcAudienceFromEnv ?? 'authenticated',
            roleClaimPaths: oidcRoleClaimPaths,
        },
        // Not part of token verification — the shared-secret bearer shortcut that
        // #152 tracks replacing with a real client_credentials grant.
        serviceRoleKey: supabaseServiceRoleKey,
        anonKey: supabaseAnonKey,
    },

    spotify: {
        clientId: env.SPOTIFY_CLIENT_ID,
        clientSecret: env.SPOTIFY_CLIENT_SECRET,
        refreshToken: env.SPOTIFY_REFRESH_TOKEN,
        redirectUri: env.SPOTIFY_REDIRECT_URI,
        pollIntervalMs: env.SPOTIFY_POLL_INTERVAL_MS,
        enabled: spotifyEnabled,
    },

    odds: {
        apiKey: env.ODDS_API_KEY,
        baseUrl: env.ODDS_API_BASE,
        enabled: Boolean(env.ODDS_API_KEY),
    },

    github: {
        token: env.GITHUB_TOKEN,
    },

    sentry: {
        dsn: env.SENTRY_DSN,
        environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
        release: env.SENTRY_RELEASE,
        tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    },

    ci: {
        runDbIntegration: env.RUN_DB_INTEGRATION,
        runGithubProjectsIntegration: env.RUN_GITHUB_PROJECTS_INTEGRATION,
        githubTestOwner: env.GITHUB_TEST_OWNER,
        githubTestRepo: env.GITHUB_TEST_REPO,
        githubTestProjectNumber: env.GITHUB_TEST_PROJECT_NUMBER,
        githubTestIssueNumber: env.GITHUB_TEST_ISSUE_NUMBER,
    },
}
