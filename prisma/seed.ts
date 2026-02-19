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

    // Quick presence check to avoid re-seeding on every cold start.
    // If the canonical marker (admin role) exists we EXIT EARLY to prevent
    // runtime re-seeding on cold-starts (avoids repeated failures / deploy loops).
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
    const bryanAdmin = await db.profile.upsert({
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
    const admin = await db.profile.upsert({
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
        const existing = await db.profile.findUnique({ where: { email: adminEmail } })
        if (existing) {
            await db.profile.update({ where: { id: existing.id }, data: { isAdmin: true } })
            console.log(`Marked existing user ${adminEmail} as isAdmin = true`)
        } else {
            const createData: any = { email: adminEmail, isAdmin: true }
            if (process.env.ADMIN_EXTERNAL_ID) createData.external_id = process.env.ADMIN_EXTERNAL_ID
            const minimal = await db.profile.create({ data: createData })
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
        where: { isbn: '9780765326355' },
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
        where: { isbn: '9780756404079' },
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
        where: { isbn: '9780765311788' },
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
        where: { entityType_entityId_userId: { entityType: 'book', entityId: book1.id, userId: bryanAdmin.id } },
        update: {},
        create: {
            entityType: 'book',
            entityId: book1.id,
            bookId: book1.id,
            userId: bryanAdmin.id,
            rating: 10,
            review: 'Epic fantasy masterpiece. The worldbuilding is incredible.',
        },
    })

    const rating2 = await db.rating.upsert({
        where: { entityType_entityId_userId: { entityType: 'book', entityId: book2.id, userId: admin.id } },
        update: {},
        create: {
            entityType: 'book',
            entityId: book2.id,
            bookId: book2.id,
            userId: admin.id,
            rating: 9,
            review: 'Beautiful prose and compelling story.',
        },
    })

    // Sample Movies
    // Use the unique `iasn` as the upsert key so creating this seed won't
    // conflict if a different row already exists with the same IASN.
    const movie1 = await db.movie.upsert({
        where: { iasn: 'IASN-001' },
        update: {},
        create: {
            title: 'Dune',
            description: 'Epic science fiction adaptation',
            iasn: 'IASN-001',
            imdbId: 'tt1160419',
            releasedAt: new Date('2021-10-22'),
            createdBy: bryanAdmin.id,
        },
    })

    const movie2 = await db.movie.upsert({
        where: { iasn: 'IASN-002' },
        update: {},
        create: {
            title: 'Blade Runner 2049',
            description: 'Neo-noir science fiction film',
            iasn: 'IASN-002',
            imdbId: 'tt1856101',
            releasedAt: new Date('2017-10-6'),
            createdBy: bryanAdmin.id,
        },
    })

    const movie3 = await db.movie.upsert({
        where: { iasn: 'IASN-003' },
        update: {},
        create: {
            title: 'The Matrix',
            description: 'Groundbreaking sci-fi action film',
            iasn: 'IASN-003',
            imdbId: 'tt0133093',
            releasedAt: new Date('1999-03-31'),
            createdBy: bryanAdmin.id,
        },
    })

    // Sample VideoGames
    const game1 = await db.videoGame.upsert({
        where: { id: 1 },
        update: {},
        create: {
            title: 'The Witcher 3',
            description: 'Open world RPG',
            platform: 'PC',
            igdbId: 'wg-001',
            releasedAt: new Date('2015-05-18'),
            createdBy: bryanAdmin.id,
        },
    })

    const game2 = await db.videoGame.upsert({
        where: { id: 2 },
        update: {},
        create: {
            title: 'God of War',
            description: 'Action-adventure',
            platform: 'PlayStation',
            igdbId: 'wg-002',
            releasedAt: new Date('2018-04-20'),
            createdBy: bryanAdmin.id,
        },
    })

    const game3 = await db.videoGame.upsert({
        where: { id: 3 },
        update: {},
        create: {
            title: 'Halo Infinite',
            description: 'First-person shooter',
            platform: 'Xbox',
            igdbId: 'wg-003',
            releasedAt: new Date('2021-12-08'),
            createdBy: bryanAdmin.id,
        },
    })

    // Sample ContentCreators
    const cc1 = await db.contentCreator.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: 'GameTheory',
            description: 'Video game analysis & lore',
            website: 'https://youtube.com/gametheory',
            createdBy: bryanAdmin.id,
        },
    })

    const cc2 = await db.contentCreator.upsert({
        where: { id: 2 },
        update: {},
        create: {
            name: 'FilmCritic',
            description: 'Film reviews and essays',
            website: 'https://filmcritic.example',
            createdBy: bryanAdmin.id,
        },
    })

    const cc3 = await db.contentCreator.upsert({
        where: { id: 3 },
        update: {},
        create: {
            name: 'IndieDevChannel',
            description: 'Indie game dev diaries',
            website: 'https://indiedev.example',
            createdBy: bryanAdmin.id,
        },
    })

    console.log({
        roles: { admin: adminRole, user: userRole },
        users: { bryanAdmin, admin },
        authors: { author1, author2 },
        books: { book1, book2, book3 },
        ratings: { rating1, rating2 },
        movies: { movie1, movie2, movie3 },
        games: { game1, game2, game3 },
        contentCreators: { cc1, cc2, cc3 }
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

