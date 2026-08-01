import type { NextFunction, Request, Response } from 'express'
import { config } from '../../config.js'
import {
    setDbContextClaims,
    TRUSTED_SERVICE_CONTEXT,
} from '../../db/request-context.js'
import { logger } from '../../logger.js'
import { mcpAuthFailuresTotal } from '../metrics-route.js'
import { wwwAuthenticateValue } from '../protected-resource-metadata.js'

/**
 * Reject with a 401 that tells a standards-based client where to look (#152).
 *
 * RFC 9728 §5.1: a protected resource signals its metadata location via the
 * `resource_metadata` parameter on `WWW-Authenticate`. Without this a conformant
 * MCP client sees an opaque 401 and has no way to discover how to authenticate.
 */
function unauthorized(req: Request, res: Response) {
    res.set(
        'WWW-Authenticate',
        wwwAuthenticateValue(req, {
            error: 'invalid_token',
            description: 'Missing or invalid credentials for the MCP resource',
        }),
    )
    return res.status(401).json({ error: 'Unauthorized' })
}

export function mcpAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    const mcpKey = config.security.mcpApiKey
    // No-op when key not set
    if (!mcpKey) return next()

    try {
        // The MCP gateway key may be presented two supported ways:
        //   1. `Authorization: Bearer <MCP_API_KEY>` — pure MCP clients (e.g. VS
        //      Code) whose Authorization header is free to carry the gateway key.
        //   2. `X-Mcp-Api-Key: <MCP_API_KEY>` — first-class second factor for
        //      callers (e.g. the website) whose Authorization header already
        //      carries a Supabase user JWT for jwtMiddleware/TSOA admin auth.
        const auth = (req.headers.authorization || '').toString()
        if (auth === `Bearer ${mcpKey}`) {
            setDbContextClaims(TRUSTED_SERVICE_CONTEXT)
            return next()
        }

        const apiKeyHeader = (req.headers['x-mcp-api-key'] || '').toString()
        if (apiKeyHeader && apiKeyHeader === mcpKey) {
            // NOTE: this form is the website presenting the gateway key
            // *alongside* a user JWT. The JWT path runs later and overwrites
            // these claims with the real user's, which is the intended
            // precedence — a user token must not be silently upgraded to admin
            // just because the caller also knows the gateway key.
            setDbContextClaims(TRUSTED_SERVICE_CONTEXT)
            return next()
        }

        // Auth failed — never log the presented credential value.
        logger.error('mcp-auth: auth failed', { path: req.path, ip: req.ip })
        try {
            mcpAuthFailuresTotal.inc()
        } catch {
            /* noop */
        }
        return unauthorized(req, res)
    } catch (err) {
        logger.error('mcp-auth: unexpected error', err)
        // Fail closed: treat as unauthorized
        try {
            mcpAuthFailuresTotal.inc()
        } catch {
            /* noop */
        }
        // `unauthorized()` builds a URL from request headers, so guard it here —
        // this branch already means something unexpected happened, and a header
        // failure must not escalate a 401 into an unhandled 500.
        try {
            return unauthorized(req, res)
        } catch {
            return res.status(401).json({ error: 'Unauthorized' })
        }
    }
}
