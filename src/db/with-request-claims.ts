import { logger } from '../logger.js'
import {
    getDbContext,
    IDENTITY_REQUIRED_OPERATIONS,
} from './request-context.js'

/**
 * Wrap a PrismaClient so identity-carrying operations announce who is acting.
 *
 * RLS policies here are written against `current_setting('request.jwt.claims.*')`.
 * Those settings are session/transaction state, and this app has neither a
 * session per user nor a connection per user — one pooled connection serves
 * everybody. So the claims have to be established inside a transaction that also
 * contains the statement they apply to. That is what this does.
 *
 * `set_config(..., is_local => true)` scopes the setting to the surrounding
 * transaction, so it cannot bleed into whatever the pooler hands that connection
 * to next. That property is load-bearing: with Supabase's transaction pooler,
 * anything session-scoped would leak across unrelated requests.
 *
 * Reads are not wrapped. See `IDENTITY_REQUIRED_OPERATIONS` for why.
 */
export function withRequestClaims(base: any): any {
    if (typeof base?.$extends !== 'function') return base

    return base.$extends({
        query: {
            async $allOperations({ model, operation, args, query }: any) {
                if (!model || !IDENTITY_REQUIRED_OPERATIONS.has(operation)) {
                    return query(args)
                }

                const ctx = getDbContext()
                if (!ctx) {
                    // No context at all means nobody established identity for
                    // this call path. The write will be refused by policy; say
                    // so plainly, because the alternative is someone staring at
                    // "violates row-level security" with no idea why.
                    logger.warn(
                        'db: write attempted with no request context; RLS will refuse it',
                        { model, operation },
                    )
                }

                return base.$transaction(async (tx: any) => {
                    await tx.$executeRawUnsafe(
                        `SELECT set_config('request.jwt.claims.role',  $1, true),
                                set_config('request.jwt.claims.email', $2, true),
                                set_config('request.jwt.claims.sub',   $3, true)`,
                        ctx?.role ?? '',
                        ctx?.email ?? '',
                        ctx?.sub ?? '',
                    )
                    // Prisma exposes the model under its camelCase accessor.
                    const accessor =
                        model.charAt(0).toLowerCase() + model.slice(1)
                    return tx[accessor][operation](args)
                })
            },
        },
    })
}
