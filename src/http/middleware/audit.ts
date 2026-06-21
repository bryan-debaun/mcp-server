import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { logger } from '../../logger.js'

/**
 * Admin **catalog mutation** audit logging (#37).
 *
 * A single post-response middleware records one structured `logger.info` entry
 * per successful admin write (create/update/delete) to the catalog resources —
 * rather than duplicating the logic across ~15 controller handlers. Audit events
 * are emitted at `info` level so they land in the structured log stream (JSON in
 * prod / Render logs); they are intentionally NOT errors, so they do not page
 * Sentry (only `logger.error` bridges there). The decision is log-only — no DB
 * `AuditLog` table — given structured logs + Sentry already exist and the single
 * user scope.
 *
 * Captured fields: actor (Supabase `sub` + `email`), action, entity type + id,
 * request id, and ip. pino adds the timestamp (`time`). No request bodies or
 * tokens are logged, so no secrets leak into the audit trail.
 */

/** Catalog route segment → singular entity name used in the audit record. */
const ENTITY_BY_SEGMENT: Record<string, string> = {
    books: 'book',
    authors: 'author',
    movies: 'movie',
    videogames: 'videogame',
    'content-creators': 'content-creator',
}

/** HTTP method → audit action. Reads (GET) are intentionally absent. */
const ACTION_BY_METHOD: Record<string, 'create' | 'update' | 'delete'> = {
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
}

const CATALOG_PATH = /^\/api\/([^/]+)(?:\/([^/?]+))?\/?$/

export function auditAdminCatalogMutations(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const action = ACTION_BY_METHOD[req.method]
    if (!action) return next()

    const match = CATALOG_PATH.exec(req.path)
    const entityType = match ? ENTITY_BY_SEGMENT[match[1]] : undefined
    if (!entityType) return next()

    const pathId = match?.[2]
    const requestId =
        (req.headers['x-request-id'] as string | undefined) || randomUUID()

    // For creates the id only exists on the response body — capture it without
    // altering what is sent. Updates/deletes carry the id in the path already.
    let createdId: unknown
    if (action === 'create') {
        const originalJson = res.json.bind(res)
        res.json = (body: any): Response => {
            if (body && typeof body === 'object' && 'id' in body) {
                createdId = body.id
            }
            return originalJson(body)
        }
    }

    res.on('finish', () => {
        // Only audit mutations that actually took effect.
        if (res.statusCode >= 400) return

        const user = (req as { user?: Record<string, unknown> }).user ?? {}
        const entityId = pathId ?? createdId
        const actor = {
            sub: user.sub,
            email: user.email,
            ...(user.service ? { service: true } : {}),
        }
        const summary = `audit: ${action} ${entityType}${entityId != null ? ` #${entityId}` : ''}`

        logger.info(
            {
                audit: true,
                action,
                entityType,
                entityId,
                actor,
                requestId,
                ip: req.ip,
                method: req.method,
                path: req.path,
                status: res.statusCode,
            },
            summary,
        )

        // Also leave a Sentry breadcrumb so the recent admin-action trail is
        // attached to any later error event (no-op unless Sentry is enabled).
        logger.breadcrumb({
            category: 'audit',
            message: summary,
            level: 'info',
            data: { action, entityType, entityId, actor, requestId },
        })
    })

    next()
}
