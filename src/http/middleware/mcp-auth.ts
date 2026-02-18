import type { Request, Response, NextFunction } from 'express';
import { mcpAuthFailuresTotal } from '../metrics-route.js';

export function mcpAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const mcpKey = process.env.MCP_API_KEY;
    // No-op when key not set
    if (!mcpKey) return next();

    // Allow public magic-link/auth endpoints to remain unauthenticated so
    // user-facing auth flows (send/register/verify) continue to work even when
    // MCP_API_KEY is set for other DB-dependent routes.
    const path = req.path || '';
    if (path.startsWith('/api/auth/magic-link')) return next();

    try {
        const auth = (req.headers.authorization || '').toString();
        if (auth === `Bearer ${mcpKey}`) return next();

        // Temporary fallback for older clients
        const fallback = (req.headers['x-mcp-api-key'] || '')?.toString();
        if (fallback) {
            console.error('mcp-auth: DEPRECATED: x-mcp-api-key header used; support for this header will be removed in a future release', { path: req.path, ip: req.ip });
            if (fallback === mcpKey) return next();
        }

        // Auth failed
        console.error('mcp-auth: auth failed', { path: req.path, ip: req.ip, got: auth || fallback || 'none' });
        try { mcpAuthFailuresTotal.inc(); } catch (e) { /* noop */ }
        return res.status(401).json({ error: 'Unauthorized' });
    } catch (err) {
        console.error('mcp-auth: unexpected error', err);
        // Fail closed: treat as unauthorized
        try { mcpAuthFailuresTotal.inc(); } catch (e) { /* noop */ }
        return res.status(401).json({ error: 'Unauthorized' });
    }
}
