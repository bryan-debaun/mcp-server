import 'dotenv/config'

// Export a `prisma` object that is initialized synchronously when possible.
// If `DATABASE_URL` is set and `@prisma/client` is available (as in CI after
// running `prisma generate`), we create a real `PrismaClient` instance.
// Otherwise, export a minimal stub so tests can import and mock methods.
export const prisma: any = {}

let prismaReadyPromise: Promise<void> | null = null

export async function initPrisma() {
    if (prismaReadyPromise) return prismaReadyPromise

    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl) {
        // No DB configured; provide stub methods used in tests and safe no-op model stubs to avoid
        // runtime TypeErrors when server is running without a database (e.g., preview environments).
        // Read methods return empty results; write methods throw to indicate missing DB.
        prisma.$queryRaw = async () => { throw new Error('DATABASE_URL not configured') }
        prisma.$disconnect = async () => { /* noop */ }

        // Model stubs
        prisma.user = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('DATABASE_URL not configured') },
            update: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
        }

        prisma.invite = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('DATABASE_URL not configured') },
            update: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
        }

        prisma.role = {
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => ({ id: 1, name: 'user' }),
        }

        prisma.auditLog = {
            create: async (_data?: any) => ({ id: 1 })
        }

        prisma.accessRequest = {
            findMany: async (_opts?: any) => [],
            update: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
        }

        prismaReadyPromise = Promise.resolve()
        return prismaReadyPromise
    }

    prismaReadyPromise = (async () => {
        try {
            const pkg = await import('@prisma/client') as any
            const { PrismaClient } = pkg
            const adapterPkg = await import('@prisma/adapter-pg') as any
            const { PrismaPg } = adapterPkg
            const adapter = new PrismaPg({ connectionString: dbUrl })
            const real = new PrismaClient({ adapter })
            // Copy own instance properties and functions (via descriptors) so that
            // instance-defined methods (if any) are bound correctly.
            const descriptors = Object.getOwnPropertyDescriptors(real)
            for (const [k, d] of Object.entries(descriptors)) {
                if (typeof (d as any).value === 'function') {
                    (prisma as any)[k] = (d as any).value.bind(real)
                } else {
                    Object.defineProperty(prisma, k, d as PropertyDescriptor)
                }
            }
            // Also bind prototype methods (e.g., $queryRaw) so callers can invoke them directly on the
            // exported `prisma` object. This ensures mocked PrismaClients in tests (which often
            // define methods on prototypes) behave correctly.
            const proto = Object.getPrototypeOf(real)
            for (const k of Object.getOwnPropertyNames(proto)) {
                const v = (proto as any)[k]
                if (typeof v === 'function') {
                    (prisma as any)[k] = v.bind(real)
                }
            }
            console.error('PrismaClient initialized successfully')
            return
        } catch (err) {
            console.error('failed to initialize PrismaClient dynamically; falling back to stub', err)
        }

        // Fallback stubs when PrismaClient cannot be initialized
        prisma.$queryRaw = async () => { throw new Error('PrismaClient not initialized') }
        prisma.$disconnect = async () => { /* noop */ }

        // Provide minimal model stubs to avoid runtime TypeErrors when code attempts
        // to call model methods in preview or non-DB environments. Read methods return
        // empty results or null; write methods throw a clear error to fail fast.
        prisma.user = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('PrismaClient not initialized') },
            update: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
        }

        prisma.invite = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('PrismaClient not initialized') },
            update: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
        }

        prisma.role = {
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => ({ id: 1, name: 'user' }),
        }

        prisma.auditLog = {
            create: async (_data?: any) => ({ id: 1 })
        }

        prisma.accessRequest = {
            findMany: async (_opts?: any) => [],
            update: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
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
    // Basic connectivity check
    const res = await (prisma as any).$queryRaw`SELECT 1 as ok`
    return res
}
