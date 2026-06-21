import pino from 'pino'
import { config } from './config.js'

// Base pino logger: pretty output in development (via pino-pretty), plain JSON
// in production, and silenced in tests (config.logLevel === 'silent').
function createBase() {
    // Default defensively so a partial config (e.g. a test that mocks only
    // `config.database`) can't produce an invalid pino level.
    const level = config.logLevel ?? 'info'
    // Pretty output only in real dev runs — never in production or under tests
    // (avoids spawning the pino-pretty worker thread during the test run).
    if (config.nodeEnv === 'development' && level !== 'silent') {
        try {
            return pino({
                level,
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'SYS:standard',
                        ignore: 'pid,hostname',
                    },
                },
            })
        } catch {
            // pino-pretty unavailable — fall through to plain JSON.
        }
    }
    return pino({ level })
}

const base = createBase()

type LogFn = (...args: unknown[]) => void

/**
 * Build a console-compatible log function backed by pino.
 *
 * Accepts the `(message, ...rest)` style used across the codebase: `Error` args
 * are attached as `err`, plain objects are merged as structured fields, and the
 * remaining values form the message. This lets existing call sites migrate by
 * renaming `console.*` to `logger.*` without rewriting each call, while new code
 * can pass a context object for proper structured logging.
 *
 * This is also the single choke point for error reporting — an error reporter
 * (e.g. Sentry) can be attached via `setErrorReporter` to receive every
 * `logger.error` call without coupling this module to the reporter.
 */
export type ErrorReporter = (
    err: unknown,
    context: Record<string, unknown>,
    message: string,
) => void

let errorReporter: ErrorReporter | null = null

/** Attach (or clear) a reporter invoked for every `logger.error` call. */
export function setErrorReporter(reporter: ErrorReporter | null): void {
    errorReporter = reporter
}

/** A diagnostic breadcrumb — context attached to later error reports, not an event itself. */
export interface Breadcrumb {
    category: string
    message: string
    level?: 'info' | 'warning' | 'error'
    data?: Record<string, unknown>
}

export type BreadcrumbReporter = (crumb: Breadcrumb) => void

let breadcrumbReporter: BreadcrumbReporter | null = null

/**
 * Attach (or clear) a reporter for `logger.breadcrumb` — the second observability
 * choke point (alongside `setErrorReporter`). Lets e.g. Sentry record breadcrumbs
 * without coupling callers to the reporter. No-op until a reporter is attached.
 */
export function setBreadcrumbReporter(
    reporter: BreadcrumbReporter | null,
): void {
    breadcrumbReporter = reporter
}

function adapt(level: 'debug' | 'info' | 'warn' | 'error'): LogFn {
    return (...args: unknown[]) => {
        const ctx: Record<string, unknown> = {}
        const parts: string[] = []
        for (const a of args) {
            if (a instanceof Error) ctx.err = a
            else if (a && typeof a === 'object') Object.assign(ctx, a)
            else parts.push(String(a))
        }
        const msg = parts.join(' ')
        if (Object.keys(ctx).length) base[level](ctx, msg)
        else base[level](msg)

        if (level === 'error' && errorReporter) {
            // Never let error reporting break logging.
            try {
                errorReporter(ctx.err, ctx, msg)
            } catch {
                /* noop */
            }
        }
    }
}

export const logger = {
    debug: adapt('debug'),
    info: adapt('info'),
    warn: adapt('warn'),
    error: adapt('error'),
    /**
     * Record a diagnostic breadcrumb via the attached reporter (e.g. Sentry).
     * No-op when no reporter is set, and never throws into the caller.
     */
    breadcrumb(crumb: Breadcrumb): void {
        if (!breadcrumbReporter) return
        try {
            breadcrumbReporter(crumb)
        } catch {
            /* noop — breadcrumbs must never break the request path */
        }
    },
    /** The underlying pino instance, for child loggers / advanced use. */
    raw: base,
}
