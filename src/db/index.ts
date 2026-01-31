import 'dotenv/config'

// Export a mutable `prisma` object so tests and other modules can import it
// synchronously and attach mocks. If a real DATABASE_URL is provided, we will
// attempt to dynamically initialize the real PrismaClient and copy its
// methods onto this object. If not, keep stub methods that throw when used.
export const prisma: any = {}

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
    // Keep minimal stub methods for tests
    prisma.$queryRaw = async () => { throw new Error('DATABASE_URL not configured') }
    prisma.$disconnect = async () => { /* noop */ }
} else {
    // Dynamically import Prisma packages; if generation hasn't been run this
    // will fail and we log the error but keep the stub to avoid throwing at
    // module load time.
    import('@prisma/client').then((pkg) => {
        import('@prisma/adapter-pg').then(({ PrismaPg }) => {
            try {
                const { PrismaClient } = pkg as any
                const adapter = new PrismaPg({ connectionString: dbUrl })
                const real = new PrismaClient({ adapter })
                // Copy methods/props onto exported object
                Object.assign(prisma, real)
            } catch (err) {
                console.error('failed to initialize PrismaClient', err)
            }
        }).catch((err) => console.error('failed to import Prisma adapter', err))
    }).catch((err) => console.error('failed to import @prisma/client (is prisma generate run?)', err))
}

export async function testConnection() {
    // Basic connectivity check
    const res = await prisma.$queryRaw`SELECT 1 as ok`
    return res
}
