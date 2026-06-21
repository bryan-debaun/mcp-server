import * as Sentry from '@sentry/node'
import { config } from './config.js'
import { logger, setBreadcrumbReporter, setErrorReporter } from './logger.js'

let initialized = false

/** Keys whose values must never be sent to Sentry. */
const SENSITIVE_KEY =
    /(authorization|cookie|token|secret|password|api[-_]?key|jwt|dsn)/i

/** Recursively redact sensitive-looking keys from an object before sending. */
function scrub(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(scrub)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : scrub(v)
    }
    return out
}

/**
 * Initialize Sentry error reporting. No-op unless `SENTRY_DSN` is set, so dev,
 * tests, and any environment without a DSN are unaffected. Once initialized,
 * every `logger.error` is forwarded to Sentry (and Sentry's default integrations
 * capture uncaught exceptions / unhandled rejections at the process level).
 */
export function initSentry(): void {
    if (initialized || !config.sentry.dsn) return

    Sentry.init({
        dsn: config.sentry.dsn,
        environment: config.sentry.environment,
        release: config.sentry.release,
        tracesSampleRate: config.sentry.tracesSampleRate,
        // Don't attach request bodies / headers / cookies automatically.
        sendDefaultPii: false,
        beforeSend(event) {
            if (event.extra)
                event.extra = scrub(event.extra) as Record<string, unknown>
            if (event.request) {
                delete event.request.headers
                delete event.request.cookies
            }
            return event
        },
    })
    initialized = true

    // Bridge: forward every logger.error to Sentry (Error → exception, else message).
    setErrorReporter((err, context, message) => {
        if (err instanceof Error) {
            Sentry.captureException(err, {
                extra: scrub(context) as Record<string, unknown>,
            })
        } else {
            Sentry.captureMessage(message || 'error', 'error')
        }
    })

    // Bridge: record breadcrumbs (e.g. admin audit events) so the recent trail is
    // attached to any subsequent error event, without raising events themselves.
    setBreadcrumbReporter((crumb) => {
        Sentry.addBreadcrumb({
            category: crumb.category,
            message: crumb.message,
            level: crumb.level ?? 'info',
            data: scrub(crumb.data ?? {}) as Record<string, unknown>,
        })
    })

    logger.info('Sentry error reporting initialized', {
        environment: config.sentry.environment,
    })
}

/** Flush buffered events — call before an intentional process exit. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
    if (!initialized) return
    try {
        await Sentry.flush(timeoutMs)
    } catch {
        /* noop */
    }
}
