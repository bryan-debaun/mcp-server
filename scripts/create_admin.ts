#!/usr/bin/env tsx
import pkg from '@prisma/client'
const { PrismaClient } = pkg as any
import { PrismaPg } from '@prisma/adapter-pg'

async function main() {
    const emailArgIndex = process.argv.findIndex(a => a === '--email' || a === '-e')
    const email = emailArgIndex >= 0 ? process.argv[emailArgIndex + 1] : process.env.ADMIN_EMAIL

    if (!email) {
        console.error('Usage: tsx scripts/create_admin.ts --email admin@example.com')
        process.exit(1)
    }

    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl) {
        console.error('DATABASE_URL environment variable is required')
        process.exit(2)
    }

    const adapter = new PrismaPg({ connectionString: dbUrl })
    const prisma = new PrismaClient({ adapter })

    try {
        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) {
            await prisma.user.update({ where: { id: existing.id }, data: { isAdmin: true } })
            console.log(`Marked existing user ${email} as admin (id=${existing.id}).`)
            console.log('If this user does not have a Supabase Auth account, create one in the Supabase dashboard and set external_id on the users row if desired.')
        } else {
            const created = await prisma.user.create({ data: { email, isAdmin: true } })
            console.warn(`Created minimal users row for ${email} (id=${created.id}).`)
            console.warn('Please create a Supabase Auth user for this email and sync external_id into users.external_id if needed.')
        }
    } catch (err: any) {
        console.error('Error creating/syncing admin user:', err)
        process.exit(3)
    } finally {
        await prisma.$disconnect()
    }
}

main()