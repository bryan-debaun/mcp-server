import { config } from '../config.js'

// `prisma` is captured by reference by importers. `initPrisma()` populates it
// with either a real PrismaClient (model accessors + raw helpers forwarded) or,
// when `DATABASE_URL` is unset or the client can't load, a set of stubs so the
// server still starts in a degraded, DB-less mode (reads empty, writes throw).
// It stays a plain mutable object so tests can override individual models.
export const prisma: any = {}

let prismaReadyPromise: Promise<void> | null = null

/**
 * Models the application uses — the single source of truth for both stub
 * generation and real-client forwarding. Keep in sync with `prisma/schema.prisma`;
 * the `test/db/stub-coverage.test.ts` guard fails if a schema model is missing
 * here. (A few entries — `user`/`invite`/`role`/`accessRequest`/`authMagicLink` —
 * back legacy auth code and are intentionally retained beyond the current schema.)
 */
const MODEL_NAMES = [
    'user', 'profile', 'invite', 'role', 'auditLog', 'accessRequest',
    'author', 'book', 'bookAuthor', 'movie', 'videoGame', 'contentCreator',
    'rating', 'authMagicLink',
] as const

/** A model stub: reads resolve empty, writes throw a clear "not configured" error. */
function makeStubModel(fail: () => never) {
    return {
        findMany: async (_opts?: any) => [],
        findUnique: async (_opts?: any) => null,
        findFirst: async (_opts?: any) => null,
        create: async (_data?: any) => fail(),
        update: async (_opts?: any) => fail(),
        upsert: async (_opts?: any) => fail(),
        delete: async (_opts?: any) => fail(),
        deleteMany: async (_opts?: any) => fail(),
    }
}

/**
 * Install DB-less stubs onto `prisma`. Used both when `DATABASE_URL` is unset and
 * when the Prisma client fails to load; `reason` is the error thrown by writes.
 */
function applyStubs(reason: string) {
    const fail = (): never => { throw new Error(reason) }

    prisma.$queryRaw = async () => fail()
    prisma.$executeRaw = async () => fail()
    prisma.$transaction = async () => fail()
    prisma.$disconnect = async () => { /* noop */ }

    for (const name of MODEL_NAMES) prisma[name] = makeStubModel(fail)

    // A couple of stubs intentionally return values rather than throwing so
    // best-effort callers (role provisioning, audit logging) don't crash sans DB.
    prisma.role = { findUnique: async () => null, create: async () => ({ id: 1, name: 'user' }) }
    prisma.auditLog = { create: async () => ({ id: 1 }) }
}

export async function initPrisma() {
    if (prismaReadyPromise) return prismaReadyPromise

    const dbUrl = config.database.url
    if (!dbUrl) {
        // No DB configured: provide safe stubs so the server (e.g. GitHub-only
        // tooling, preview envs) still runs without a database.
        applyStubs('DATABASE_URL not configured')
        prismaReadyPromise = Promise.resolve()
        return prismaReadyPromise
    }

    prismaReadyPromise = (async () => {
        try {
            const { PrismaClient } = await import('@prisma/client') as any
            const { PrismaPg } = await import('@prisma/adapter-pg') as any
            const adapter = new PrismaPg({ connectionString: dbUrl })
            const real = new PrismaClient({ adapter })

            // Forward the raw helpers and model accessors onto the shared `prisma`
            // object. Direct assignment keeps each model reassignable by tests.
            prisma.$queryRaw = (...args: any[]) => real.$queryRaw(...args)
            prisma.$executeRaw = (...args: any[]) => real.$executeRaw(...args)
            prisma.$transaction = (...args: any[]) => real.$transaction(...args)
            prisma.$disconnect = () => (real.$disconnect ? real.$disconnect() : Promise.resolve())

            for (const name of MODEL_NAMES) {
                if (name in real) prisma[name] = (real as any)[name]
            }

            console.error('PrismaClient initialized successfully')
        } catch (err) {
            console.error('failed to initialize PrismaClient dynamically; falling back to stub', err)
            applyStubs('PrismaClient not initialized')
        }
    })()

    return prismaReadyPromise
}

export function prismaReady() {
    return prismaReadyPromise ?? Promise.resolve()
}

export async function testConnection() {
    // Wait for the async Prisma initialization to complete to avoid races in tests/CI
    await initPrisma()

    // Basic connectivity check with retries to tolerate transient connection errors
    const maxAttempts = 10
    const delayMs = 500
    let lastErr: any = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await (prisma as any).$queryRaw`SELECT 1 as ok`
            return res
        } catch (err) {
            lastErr = err
            console.error(`testConnection attempt ${attempt} failed:`, (err as any)?.message ?? err)
            if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, delayMs))
                continue
            }
            break
        }
    }

    // If we get here, all retries failed — surface the last error for diagnostics
    throw lastErr
}
