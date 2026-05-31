import type { Request, Response, NextFunction } from 'express';
import { mcpAuthFailuresTotal } from '../metrics-route.js';
import { config } from '../../config.js';

export function mcpAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const mcpKey = config.security.mcpApiKey;
    // No-op when key not set
    if (!mcpKey) return next();

    // Allow public magic-link/auth endpoints to remain unauthenticated so
    // user-facing auth flows (send/register/verify) continue to work even when
    // MCP_API_KEY is set for other DB-dependent routes.
    const path = req.path || '';
    if (path.startsWith('/api/auth/magic-link')) return next();

    try {
        // The MCP gateway key may be presented two supported ways:
        //   1. `Authorization: Bearer <MCP_API_KEY>` — pure MCP clients (e.g. VS
        //      Code) whose Authorization header is free to carry the gateway key.
        //   2. `X-Mcp-Api-Key: <MCP_API_KEY>` — first-class second factor for
        //      callers (e.g. the website) whose Authorization header already
        //      carries a Supabase user JWT for jwtMiddleware/TSOA admin auth.
        const auth = (req.headers.authorization || '').toString();
        if (auth === `Bearer ${mcpKey}`) return next();

        const apiKeyHeader = (req.headers['x-mcp-api-key'] || '').toString();
        if (apiKeyHeader && apiKeyHeader === mcpKey) return next();

        // Auth failed — never log the presented credential value.
        console.error('mcp-auth: auth failed', { path: req.path, ip: req.ip });
        try { mcpAuthFailuresTotal.inc(); } catch (e) { /* noop */ }
        return res.status(401).json({ error: 'Unauthorized' });
    } catch (err) {
        console.error('mcp-auth: unexpected error', err);
        // Fail closed: treat as unauthorized
        try { mcpAuthFailuresTotal.inc(); } catch (e) { /* noop */ }
        return res.status(401).json({ error: 'Unauthorized' });
    }
}
