import type { Request, Response } from 'express'
import {
    Counter,
    collectDefaultMetrics,
    Gauge,
    Histogram,
    Registry,
} from 'prom-client'

const register = new Registry()
collectDefaultMetrics({ register })

export const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'path', 'status'],
})

export const httpRequestDurationSeconds = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1, 2, 5],
})

export const mcpPollSuccess = new Counter({
    name: 'mcp_poll_success_total',
    help: 'MCP poll success total',
})
export const mcpPollFailure = new Counter({
    name: 'mcp_poll_failure_total',
    help: 'MCP poll failure total',
})
export const mcpTokenRefreshSuccess = new Counter({
    name: 'mcp_token_refresh_success_total',
    help: 'MCP token refresh success total',
})
export const mcpTokenRefreshFailure = new Counter({
    name: 'mcp_token_refresh_failure_total',
    help: 'MCP token refresh failure total',
})

export const invitesCreatedTotal = new Counter({
    name: 'invites_created_total',
    help: 'Invites created total',
})
export const invitesAcceptedTotal = new Counter({
    name: 'invites_accepted_total',
    help: 'Invites accepted total',
})

export const serviceRoleBypassTotal = new Counter({
    name: 'service_role_bypass_total',
    help: 'Total number of service role bypasses',
})

export const adminDebugRequestsTotal = new Counter({
    name: 'admin_debug_requests_total',
    help: 'Total number of admin debug endpoint requests',
})
export const mcpAuthFailuresTotal = new Counter({
    name: 'mcp_auth_failures_total',
    help: 'Total number of MCP API auth failures',
})

/**
 * Tokens that verified but whose subject matched no local Profile (#151).
 *
 * Deliberately separate from `mcp_auth_failures_total`: this is not an auth
 * failure — the request proceeds as a non-admin. It is the signal that an
 * identity mapping is broken, which is exactly the condition that used to
 * silently downgrade an admin with no distinguishable trace.
 */
export const authSubjectUnresolvedTotal = new Counter({
    name: 'auth_subject_unresolved_total',
    help: 'Verified tokens whose subject could not be mapped to a local Profile',
})

// Book aggregate metrics
export const bookAggregateUpdateFailuresTotal = new Counter({
    name: 'book_aggregate_update_failures_total',
    help: 'Number of failures updating book aggregates',
})
export const bookAggregatesLastBackfillTimestamp = new Gauge({
    name: 'book_aggregates_last_backfill_timestamp',
    help: 'Last backfill timestamp (epoch seconds)',
})

register.registerMetric(httpRequestsTotal)
register.registerMetric(httpRequestDurationSeconds)
register.registerMetric(mcpPollSuccess)
register.registerMetric(mcpPollFailure)
register.registerMetric(mcpTokenRefreshSuccess)
register.registerMetric(mcpTokenRefreshFailure)
register.registerMetric(invitesCreatedTotal)
register.registerMetric(invitesAcceptedTotal)
register.registerMetric(serviceRoleBypassTotal)
register.registerMetric(adminDebugRequestsTotal)
register.registerMetric(mcpAuthFailuresTotal)
register.registerMetric(bookAggregateUpdateFailuresTotal)
register.registerMetric(bookAggregatesLastBackfillTimestamp)

export function registerMetricsRoute(app: any): void {
    app.get('/metrics', async (_req: Request, res: Response) => {
        const metrics = await register.metrics()
        res.set('Content-Type', register.contentType)
        res.send(metrics)
    })
}
