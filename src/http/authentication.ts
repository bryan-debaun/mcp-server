import { Request } from 'express'
import { resolveAppRole, verifyAccessToken } from '../auth/jwt.js'
import { config } from '../config.js'
import {
    setDbContextClaims,
    TRUSTED_SERVICE_CONTEXT,
} from '../db/request-context.js'

/** Build an error carrying an HTTP status so the global handler emits a clean 4xx. */
function authError(message: string, status: number): Error {
    return Object.assign(new Error(message), { status })
}

/**
 * Validate the MCP gateway key the same two ways `mcpAuthMiddleware` accepts it:
 * `Authorization: Bearer <MCP_API_KEY>` or the `X-Mcp-Api-Key` header. When
 * `MCP_API_KEY` is unset the gate is a no-op (mirrors the middleware), so CI /
 * no-DB startups stay open. Declaring this as a TSOA security scheme makes the
 * OpenAPI contract honest: read endpoints advertise the key requirement that the
 * deployment already enforces (#117).
 */
function authenticateApiKey(request: Request): { apiKey: true } | undefined {
    const mcpKey = config.security.mcpApiKey
    if (!mcpKey) return undefined // not configured → open, like the middleware

    const auth = (request.headers.authorization || '').toString()
    if (auth === `Bearer ${mcpKey}`) {
        setDbContextClaims(TRUSTED_SERVICE_CONTEXT)
        return { apiKey: true }
    }

    const headerKey = (request.headers['x-mcp-api-key'] || '').toString()
    if (headerKey && headerKey === mcpKey) {
        setDbContextClaims(TRUSTED_SERVICE_CONTEXT)
        return { apiKey: true }
    }

    throw authError('Unauthorized', 401)
}

/**
 * Tsoa authentication handler for JWT bearer tokens
 * This function is called by tsoa when a route requires @Security('jwt')
 */
export async function expressAuthentication(
    request: Request,
    securityName: string,
    scopes?: string[],
): Promise<any> {
    if (securityName === 'api_key') {
        return authenticateApiKey(request)
    }

    if (securityName === 'jwt') {
        const token = request.headers.authorization?.replace('Bearer ', '')

        if (!token) {
            throw authError('No token provided', 401)
        }

        let decoded
        try {
            decoded = await verifyAccessToken(token)
        } catch {
            // verifyAccessToken logs the underlying cause (bad signature, JWKS
            // fetch, expired, etc.). Surface a clean 401 instead of letting a jose
            // throw fall through to the generic 'internal error' handler (#117).
            throw authError('Invalid or expired token', 401)
        }

        // Resolve the application role the same way as the Express middleware:
        // a token-baked app role wins, otherwise the local Profile (by
        // issuer+subject, then email). The Supabase top-level `role` claim is
        // the Postgres role ('authenticated') — NOT an app role — so checking it
        // directly (the previous behavior) always failed admin scope checks.
        const { role, isAdmin } = await resolveAppRole(decoded)

        if (scopes && scopes.length > 0) {
            const hasRequiredScope =
                isAdmin || scopes.some((scope) => scope === role)
            if (!hasRequiredScope) {
                throw authError('Insufficient permissions', 403)
            }
        }
        // Attach the resolved user to the request so controllers can read it.
        ;(request as any).user = Object.assign({}, decoded, { role, isAdmin })

        // …and to the database layer, so RLS policies see the same decision the
        // scope check above just made. Set after the scope check on purpose: a
        // caller rejected with 403 never reaches a query anyway, and leaving the
        // context empty on that path keeps the two from disagreeing.
        setDbContextClaims({
            role,
            email:
                typeof (decoded as any)?.email === 'string'
                    ? (decoded as any).email
                    : undefined,
            sub: (decoded as any)?.sub
                ? String((decoded as any).sub)
                : undefined,
        })
        return (request as any).user
    }

    throw new Error('Unknown security name: ' + securityName)
}
