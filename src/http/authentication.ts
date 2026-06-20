import { Request } from 'express'
import { resolveAppRole, verifySupabaseJwt } from '../auth/jwt.js'

/** Build an error carrying an HTTP status so the global handler emits a clean 4xx. */
function authError(message: string, status: number): Error {
    return Object.assign(new Error(message), { status })
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
    if (securityName === 'jwt') {
        const token = request.headers.authorization?.replace('Bearer ', '')

        if (!token) {
            throw authError('No token provided', 401)
        }

        let decoded
        try {
            decoded = await verifySupabaseJwt(token)
        } catch {
            // verifySupabaseJwt logs the underlying cause (bad signature, JWKS
            // fetch, expired, etc.). Surface a clean 401 instead of letting a jose
            // throw fall through to the generic 'internal error' handler (#117).
            throw authError('Invalid or expired token', 401)
        }

        // Resolve the application role the same way as the Express middleware:
        // a token-baked app role (app_metadata.role) wins, otherwise the local
        // Profile (by id, then email). The Supabase top-level `role` claim is
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
        return (request as any).user
    }

    throw new Error('Unknown security name: ' + securityName)
}
