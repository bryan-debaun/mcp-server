import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required')
}

const adapter = new PrismaPg({ connectionString: dbUrl })
export const prisma = new PrismaClient({ adapter })

export async function testConnection() {
    // Basic connectivity check
    const res = await prisma.$queryRaw`SELECT 1 as ok`
    return res
}
