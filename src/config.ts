/**
 * Centralized environment configuration with Zod validation.
 * This is the ONLY place in the codebase that reads process.env directly.
 *
 * Usage: import { config } from './config.js'
 */

// Load dotenv before reading process.env. Only in non-production — hosted
// environments (Render) inject vars directly. Safe to call multiple times.
if (process.env.NODE_ENV !== 'production') {
    try {
        await import('dotenv/config');
    } catch {
        // dotenv not installed or not available; env vars provided by platform
    }
}

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a comma-separated string into a trimmed, non-empty string array. */
const csvArray = z
    .string()
    .optional()
    .transform((val) =>
        val ? val.split(',').map((s) => s.trim()).filter(Boolean) : []
    );

/** Coerce a string boolean flag ('1', 'true', 'yes') to boolean. */
const boolFlag = z
    .string()
    .optional()
    .transform((val) => {
        const v = (val ?? '').toLowerCase();
        return v === '1' || v === 'true' || v === 'yes';
    });

/** Coerce a string to a positive integer with a default fallback. */
function posInt(defaultValue: number) {
    return z
        .string()
        .optional()
        .transform((val) => {
            const n = Number(val ?? defaultValue);
            return Number.isFinite(n) && n > 0 ? n : defaultValue;
        });
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
        .refine((val) => val === undefined || (Number.isFinite(val) && val > 0), {
            message: 'PORT must be a positive integer',
        }),
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

    // ── Auth / Supabase ───────────────────────────────────────────────────
    // JWKS URL: prefer explicit; derive from PUBLIC_SUPABASE_URL as fallback
    SUPABASE_JWKS_URL: z.string().url().optional(),
    PUBLIC_SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ISS: z.string().optional(),
    SUPABASE_AUD: z.string().optional(),
    // Service role key — accept either alias
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

    // ── GitHub ────────────────────────────────────────────────────────────
    GITHUB_TOKEN: z.string().optional(),

    // ── Test / CI flags ───────────────────────────────────────────────────
    RUN_DB_INTEGRATION: boolFlag,
    RUN_GITHUB_PROJECTS_INTEGRATION: boolFlag,
    GITHUB_TEST_OWNER: z.string().optional(),
    GITHUB_TEST_REPO: z.string().optional(),
    GITHUB_TEST_PROJECT_NUMBER: posInt(0),
    GITHUB_TEST_ISSUE_NUMBER: posInt(0),
});

// ---------------------------------------------------------------------------
// Parse & exit-on-failure
// ---------------------------------------------------------------------------

const result = envSchema.safeParse(process.env);

if (!result.success) {
    console.error('❌  Configuration error — fix the following env vars and restart:');
    for (const issue of result.error.issues) {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
}

const env = result.data;

// ---------------------------------------------------------------------------
// Derived / normalized values
// ---------------------------------------------------------------------------

/** Resolved JWKS URL: explicit var wins; derived from PUBLIC_SUPABASE_URL otherwise. */
const supabaseJwksUrl: string | undefined =
    env.SUPABASE_JWKS_URL ??
    (env.PUBLIC_SUPABASE_URL
        ? `${env.PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/.well-known/jwks.json`
        : undefined);

/** Resolved issuer: explicit SUPABASE_ISS wins; fallback to PUBLIC_SUPABASE_URL. */
const supabaseIss: string | undefined = env.SUPABASE_ISS ?? env.PUBLIC_SUPABASE_URL;

/** Service role key: prefer the canonical name; accept legacy alias. */
const supabaseServiceRoleKey: string | undefined =
    env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;

/** Anon / publishable key: prefer the canonical name; accept legacy alias. */
const supabaseAnonKey: string | undefined =
    env.SUPABASE_ANON_KEY ?? env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Whether all three Spotify credentials are present. */
const spotifyEnabled =
    Boolean(env.SPOTIFY_CLIENT_ID) &&
    Boolean(env.SPOTIFY_CLIENT_SECRET) &&
    Boolean(env.SPOTIFY_REFRESH_TOKEN);

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
        (env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug'),

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
        supabaseJwksUrl,
        supabaseIss,
        supabaseAud: env.SUPABASE_AUD,
        supabaseServiceRoleKey,
        supabaseAnonKey,
    },

    spotify: {
        clientId: env.SPOTIFY_CLIENT_ID,
        clientSecret: env.SPOTIFY_CLIENT_SECRET,
        refreshToken: env.SPOTIFY_REFRESH_TOKEN,
        redirectUri: env.SPOTIFY_REDIRECT_URI,
        pollIntervalMs: env.SPOTIFY_POLL_INTERVAL_MS,
        enabled: spotifyEnabled,
    },

    github: {
        token: env.GITHUB_TOKEN,
    },

    ci: {
        runDbIntegration: env.RUN_DB_INTEGRATION,
        runGithubProjectsIntegration: env.RUN_GITHUB_PROJECTS_INTEGRATION,
        githubTestOwner: env.GITHUB_TEST_OWNER,
        githubTestRepo: env.GITHUB_TEST_REPO,
        githubTestProjectNumber: env.GITHUB_TEST_PROJECT_NUMBER,
        githubTestIssueNumber: env.GITHUB_TEST_ISSUE_NUMBER,
    },
};
