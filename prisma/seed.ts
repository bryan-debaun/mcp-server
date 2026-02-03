import pkg from '@prisma/client'
const { PrismaClient } = pkg as any
import { PrismaPg } from '@prisma/adapter-pg'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required for seeding')
}

const adapter = new PrismaPg({ connectionString: dbUrl })
const prisma = new PrismaClient({ adapter })

export async function runSeed(prismaClient?: any) {
    const db = prismaClient ?? prisma

    // Quick presence check to avoid re-seeding on every cold start
    try {
        const existingAdmin = await db.role.findUnique({ where: { name: 'admin' } })
        if (existingAdmin) {
            console.log('DB already seeded; skipping.')
            return
        }
    } catch (err) {
        // If the check fails (e.g., table missing), proceed with seeding to surface errors
        console.error('seed presence check failed; proceeding with seed:', err)
    }

    console.log('Seeding DB...')

    // Create default roles
    const adminRole = await db.role.upsert({
        where: { name: 'admin' },
        update: {},
        create: { name: 'admin' },
    })

    const userRole = await db.role.upsert({
        where: { name: 'user' },
        update: {},
        create: { name: 'user' },
    })

    // Create Bryan's admin user
    const bryanAdmin = await db.user.upsert({
        where: { email: 'brn.dbn@gmail.com' },
        update: { isAdmin: true },
        create: {
            email: 'brn.dbn@gmail.com',
            name: 'Bryan DeBaun',
            roleId: adminRole.id,
            isAdmin: true,
        },
    })

    // Create a test admin user (for local development only)
    const admin = await db.user.upsert({
        where: { email: 'admin@example.com' },
        update: { isAdmin: true },
        create: {
            email: 'admin@example.com',
            name: 'Local Admin',
            roleId: adminRole.id,
            isAdmin: true,
        },
    })

    // If ADMIN_EMAIL is set, mark that user as admin or create a minimal users row
    const adminEmail = process.env.ADMIN_EMAIL
    if (adminEmail) {
        const existing = await db.user.findUnique({ where: { email: adminEmail } })
        if (existing) {
            await db.user.update({ where: { id: existing.id }, data: { isAdmin: true } })
            console.log(`Marked existing user ${adminEmail} as isAdmin = true`)
        } else {
            const minimal = await db.user.create({ data: { email: adminEmail, isAdmin: true } })
            console.warn(`Created minimal users row for ADMIN_EMAIL ${adminEmail}. Please create a Supabase Auth user for this email and sync external_id if needed.`)
        }
    }

    // Create sample authors
    const author1 = await db.author.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: 'Brandon Sanderson',
            bio: 'American fantasy and science fiction writer',
            website: 'https://www.brandonsanderson.com',
            createdBy: bryanAdmin.id,
        },
    })

    const author2 = await db.author.upsert({
        where: { id: 2 },
        update: {},
        create: {
            name: 'Patrick Rothfuss',
            bio: 'American writer of epic fantasy',
            website: 'https://www.patrickrothfuss.com',
            createdBy: bryanAdmin.id,
        },
    })

    // Create sample books
    const book1 = await db.book.upsert({
        where: { id: 1 },
        update: {},
        create: {
            title: 'The Way of Kings',
            status: 'NOT_STARTED',
            description: 'First book in The Stormlight Archive series',
            isbn: '9780765326355',
            publishedAt: new Date('2010-08-31'),
            createdBy: bryanAdmin.id,
        },
    })

    const book2 = await db.book.upsert({
        where: { id: 2 },
        update: {},
        create: {
            title: 'The Name of the Wind',
            status: 'NOT_STARTED',
            description: 'First book in The Kingkiller Chronicle series',
            isbn: '9780756404079',
            publishedAt: new Date('2007-03-27'),
            createdBy: bryanAdmin.id,
        },
    })

    const book3 = await db.book.upsert({
        where: { id: 3 },
        update: {},
        create: {
            title: 'Mistborn: The Final Empire',
            status: 'NOT_STARTED',
            description: 'First book in the Mistborn trilogy',
            isbn: '9780765311788',
            publishedAt: new Date('2006-07-17'),
            createdBy: bryanAdmin.id,
        },
    })

    // Create book-author associations
    await db.bookAuthor.upsert({
        where: { bookId_authorId: { bookId: book1.id, authorId: author1.id } },
        update: {},
        create: {
            bookId: book1.id,
            authorId: author1.id,
        },
    })

    await db.bookAuthor.upsert({
        where: { bookId_authorId: { bookId: book2.id, authorId: author2.id } },
        update: {},
        create: {
            bookId: book2.id,
            authorId: author2.id,
        },
    })

    await db.bookAuthor.upsert({
        where: { bookId_authorId: { bookId: book3.id, authorId: author1.id } },
        update: {},
        create: {
            bookId: book3.id,
            authorId: author1.id,
        },
    })

    // Create sample ratings
    const rating1 = await db.rating.upsert({
        where: { bookId_userId: { bookId: book1.id, userId: bryanAdmin.id } },
        update: {},
        create: {
            bookId: book1.id,
            userId: bryanAdmin.id,
            rating: 10,
            review: 'Epic fantasy masterpiece. The worldbuilding is incredible.',
        },
    })

    const rating2 = await db.rating.upsert({
        where: { bookId_userId: { bookId: book2.id, userId: admin.id } },
        update: {},
        create: {
            bookId: book2.id,
            userId: admin.id,
            rating: 9,
            review: 'Beautiful prose and compelling story.',
        },
    })

    console.log({
        roles: { admin: adminRole, user: userRole },
        users: { bryanAdmin, admin },
        authors: { author1, author2 },
        books: { book1, book2, book3 },
        ratings: { rating1, rating2 }
    })
}

async function main() {
    try {
        await runSeed()
    } catch (e) {
        console.error(e)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

main()

