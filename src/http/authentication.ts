import { Request } from 'express';
import { verifySupabaseJwt } from '../auth/jwt.js';

/**
 * Tsoa authentication handler for JWT bearer tokens
 * This function is called by tsoa when a route requires @Security('jwt')
 */
export async function expressAuthentication(
    request: Request,
    securityName: string,
    scopes?: string[]
): Promise<any> {
    if (securityName === 'jwt') {
        const token = request.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            throw new Error('No token provided');
        }

        try {
            // Use existing Supabase JWT verification
            const decoded = await verifySupabaseJwt(token);
            // If scopes are required (e.g., ['admin']), verify user has them
            if (scopes && scopes.length > 0) {
                const userRole = decoded.role || 'user';
                const hasRequiredScope = scopes.some(scope =>
                    scope === userRole || userRole === 'admin'
                );

                if (!hasRequiredScope) {
                    throw new Error('Insufficient permissions');
                }
            }

            return decoded;
        } catch (err: any) {
            throw new Error('Invalid token: ' + err.message);
        }
    }

    throw new Error('Unknown security name: ' + securityName);
}
