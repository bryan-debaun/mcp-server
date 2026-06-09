import { Request } from 'express'
import { resolveAppRole, verifySupabaseJwt } from '../auth/jwt.js'

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
            throw new Error('No token provided')
        }

        const decoded = await verifySupabaseJwt(token)

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
                throw new Error('Insufficient permissions')
            }
        }
        // Attach the resolved user to the request so controllers can read it.
        ;(request as any).user = Object.assign({}, decoded, { role, isAdmin })
        return (request as any).user
    }

    throw new Error('Unknown security name: ' + securityName)
}
