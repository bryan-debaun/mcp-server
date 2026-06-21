import type { Request } from 'express'
import { resolveAppRole, verifySupabaseJwt } from './jwt.js'

/**
 * Best-effort check of whether a request carries a valid **admin** Supabase JWT.
 *
 * Used by endpoints gated by the MCP gateway key (`@Security('api_key')`) that
 * want to *additionally* unlock admin-only views (e.g. draft articles) when an
 * admin JWT is also presented — mirroring the "JWT + API key" admin path (#120).
 *
 * Never throws: a missing/invalid/non-JWT bearer (including the gateway key
 * presented as the bearer token) resolves to `false`, so callers safely fall
 * back to the public (published-only) view.
 */
export async function requestIsAdmin(req: Request): Promise<boolean> {
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) return false
    try {
        const payload = await verifySupabaseJwt(auth.slice('Bearer '.length))
        const { isAdmin } = await resolveAppRole(payload)
        return isAdmin
    } catch {
        return false
    }
}
