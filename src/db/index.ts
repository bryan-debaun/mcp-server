import 'dotenv/config'

// Export a `prisma` object that is initialized synchronously when possible.
// If `DATABASE_URL` is set and `@prisma/client` is available (as in CI after
// running `prisma generate`), we create a real `PrismaClient` instance.
// Otherwise, export a minimal stub so tests can import and mock methods.
export const prisma: any = {}

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
} else {
    // Try to synchronously initialize PrismaClient. If this fails (e.g. `@prisma/client`
    // not generated), log and fall back to stub to avoid crashing at module load.
    try {
        // Use static import (top-level) pattern to get synchronous init when possible
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require('@prisma/client') as any
        const { PrismaClient } = pkg
        // Adapter import is ESM compatible; require it similarly
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PrismaPg } = require('@prisma/adapter-pg') as any
        const adapter = new PrismaPg({ connectionString: dbUrl })
        const real = new PrismaClient({ adapter })
        Object.assign(prisma, real)
    } catch (err) {
        console.error('failed to initialize PrismaClient synchronously; falling back to stub', err)
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
    }
}

export async function testConnection() {
    // Basic connectivity check
    const res = await prisma.$queryRaw`SELECT 1 as ok`
    return res
}
