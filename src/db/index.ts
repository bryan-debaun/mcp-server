// Load dotenv only in development - production environments provide variables directly
if (process.env.NODE_ENV !== 'production') {
  try {
    await import('dotenv/config')
  } catch {
    // dotenv not available, environment variables provided by hosting platform
  }
}

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
        prisma.profile = {
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

        // Stub for magic-link single-use token persistence
        prisma.authMagicLink = {
            create: async (_data?: any) => { throw new Error('DATABASE_URL not configured') },
            findUnique: async (_opts?: any) => null,
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

        prisma.author = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('DATABASE_URL not configured') },
            update: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
            delete: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
        }

        prisma.book = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('DATABASE_URL not configured') },
            update: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
            delete: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
        }

        prisma.bookAuthor = {
            findMany: async (_opts?: any) => [],
            create: async (_data?: any) => { throw new Error('DATABASE_URL not configured') },
            deleteMany: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
        }

        prisma.movie = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('DATABASE_URL not configured') },
            update: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
            delete: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
        }

        prisma.videoGame = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('DATABASE_URL not configured') },
            update: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
            delete: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
        }

        prisma.contentCreator = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('DATABASE_URL not configured') },
            update: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
            delete: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
        }

        prisma.rating = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            findFirst: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('DATABASE_URL not configured') },
            update: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
            upsert: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
            delete: async (_opts?: any) => { throw new Error('DATABASE_URL not configured') },
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

            // Ensure commonly used raw query helpers are always available and callable as template-tag
            // functions. Some Prisma client internals expose these via non-enumerable or lazy accessors
            // so we explicitly forward them to the real client to avoid runtime "not a function" errors
            // in CI and runtime environments.
            (prisma as any).$queryRaw = (...args: any[]) => (real as any).$queryRaw(...args);
            (prisma as any).$executeRaw = (...args: any[]) => (real as any).$executeRaw(...args);
            (prisma as any).$transaction = (...args: any[]) => (real as any).$transaction(...args);
            (prisma as any).$disconnect = (real as any).$disconnect?.bind(real) ?? (async () => { });

            // Explicitly forward model accessors (user, book, etc.) to ensure they're available
            // These are often defined as getters on the Prisma client and may not be enumerable
            const modelNames = ['user', 'profile', 'invite', 'role', 'auditLog', 'accessRequest', 'author', 'book', 'bookAuthor', 'movie', 'videoGame', 'contentCreator', 'rating', 'authMagicLink'];
            for (const modelName of modelNames) {
                if (modelName in real) {
                    Object.defineProperty(prisma, modelName, {
                        get() { return (real as any)[modelName]; },
                        enumerable: true,
                        configurable: true
                    });
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
        prisma.profile = {
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

        // Fallback stub for magic-link single-use token persistence
        prisma.authMagicLink = {
            create: async (_data?: any) => { throw new Error('PrismaClient not initialized') },
            findUnique: async (_opts?: any) => null,
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

        prisma.author = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('PrismaClient not initialized') },
            update: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
            delete: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
        }

        prisma.book = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('PrismaClient not initialized') },
            update: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
            delete: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
        }

        prisma.bookAuthor = {
            findMany: async (_opts?: any) => [],
            create: async (_data?: any) => { throw new Error('PrismaClient not initialized') },
            deleteMany: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
        }

        prisma.rating = {
            findMany: async (_opts?: any) => [],
            findUnique: async (_opts?: any) => null,
            findFirst: async (_opts?: any) => null,
            create: async (_data?: any) => { throw new Error('PrismaClient not initialized') },
            update: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
            upsert: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
            delete: async (_opts?: any) => { throw new Error('PrismaClient not initialized') },
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
            // Log and retry on transient connection errors
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
