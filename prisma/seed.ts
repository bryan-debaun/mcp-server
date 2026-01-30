import 'dotenv/config'
import pkg from '@prisma/client'
const { PrismaClient } = pkg as any
import { PrismaPg } from '@prisma/adapter-pg'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required for seeding')
}

const adapter = new PrismaPg({ connectionString: dbUrl })
const prisma = new PrismaClient({ adapter })

async function main() {
    console.log('Seeding DB...')

    // Create default roles
    const adminRole = await prisma.role.upsert({
        where: { name: 'admin' },
        update: {},
        create: { name: 'admin' },
    })

    const userRole = await prisma.role.upsert({
        where: { name: 'user' },
        update: {},
        create: { name: 'user' },
    })

    // Create a test admin user if none exists (for local development only)
    const admin = await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {},
        create: {
            email: 'admin@example.com',
            name: 'Local Admin',
            roleId: adminRole.id,
        },
    })

    console.log({ admin, adminRole, userRole })
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
