import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request identity, carried to the database so RLS policies can evaluate it.
 *
 * The app is a trusted middle tier: one connection string, one database
 * identity, every query made on behalf of whoever is calling. That is why RLS
 * has never enforced anything here — a policy keyed on
 * `current_setting('request.jwt.claims.role')` has nothing to read, because
 * nothing ever set it.
 *
 * `AsyncLocalStorage` closes that gap without threading a context argument
 * through every tool handler and controller: the auth layer establishes the
 * claims once per request, and the Prisma extension in `src/db/index.ts` picks
 * them up for any operation that needs them.
 */
export interface DbRequestContext {
    /** `email` claim — the identity most policies key on. */
    email?: string
    /** Resolved application role (`admin` | `user` | …), NOT the Postgres role. */
    role?: string
    /** Token subject, for auditing. */
    sub?: string
}

const storage = new AsyncLocalStorage<DbRequestContext>()

/**
 * Run `fn` with `ctx` visible to every database call it makes.
 *
 * ⚠️ **`fn` must `await` its database work.** Prisma operations are lazy: calling
 * `db.movie.create(...)` builds a promise but does not start it. Returning that
 * promise unawaited means it executes *after* this scope has exited, the claims
 * arrive empty, and the write is refused by policy:
 *
 * ```ts
 * runWithDbContext(ctx, () => db.movie.create(…))              // ✗ claims lost
 * runWithDbContext(ctx, async () => await db.movie.create(…))  // ✓
 * ```
 *
 * It fails closed, which is the safe direction — but silently, so
 * `assertDbContextAwaited` exists to make the mistake loud in tests.
 */
export function runWithDbContext<T>(ctx: DbRequestContext, fn: () => T): T {
    return storage.run(ctx, fn)
}

/**
 * Open an empty scope for a request, to be filled in once auth resolves.
 *
 * The context object is stored by reference, so `setDbContextClaims` can
 * populate it later in the request without the middleware needing to know the
 * identity up front — which matters because TSOA resolves auth inside route
 * handling, well after any middleware could have wrapped it.
 */
export function beginDbContext<T>(fn: () => T): T {
    return storage.run({}, fn)
}

/** Fill in the current scope's claims. No-op outside a scope. */
export function setDbContextClaims(claims: DbRequestContext): void {
    const store = storage.getStore()
    if (store) Object.assign(store, claims)
}

/** The current request's claims, or `undefined` outside a request. */
export function getDbContext(): DbRequestContext | undefined {
    return storage.getStore()
}

/**
 * Claims for callers that are already fully trusted by an earlier gate.
 *
 * The MCP gateway key (`MCP_API_KEY`) and the service-role path both grant
 * unrestricted access *today* — the key gates `/mcp` and every DB-backed
 * `/api/*` route, and the service-role path additionally demands
 * `INTERNAL_ADMIN_KEY` plus an IP allowlist. Mapping them to admin claims keeps
 * behaviour identical; what changes is that a plain **user JWT** can no longer
 * write without genuinely resolving to admin, which is the bug class this
 * whole mechanism defends against.
 */
export const TRUSTED_SERVICE_CONTEXT: DbRequestContext = Object.freeze({
    role: 'admin',
    email: 'service@internal',
    sub: 'service',
})

/**
 * Operations that must carry identity to the database.
 *
 * Reads are deliberately absent. Catalog reads are public, they are the hot
 * path (`/api/books` p50 307ms, already dominated by database round-trip), and
 * wrapping them in a transaction to set claims would add two round-trips to
 * every page load on bryandebaun.dev for no security gain. Writes are where an
 * authorization bug actually costs something, so writes are what we protect.
 */
export const IDENTITY_REQUIRED_OPERATIONS = new Set([
    'create',
    'createMany',
    'createManyAndReturn',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
])
