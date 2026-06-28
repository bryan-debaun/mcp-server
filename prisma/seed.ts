import { pathToFileURL } from 'node:url'
import pkg from '@prisma/client'
const { PrismaClient } = pkg as any
import { PrismaPg } from '@prisma/adapter-pg'
import { cptsdArticle } from './seed-data/cptsd.js'

// Lazily construct the real client so importing this module (e.g. from tests
// that inject a mock `db`) has no side effects and doesn't require DATABASE_URL.
let _prisma: any
function getPrisma() {
    if (!_prisma) {
        const dbUrl = process.env.DATABASE_URL
        if (!dbUrl) {
            throw new Error(
                'DATABASE_URL environment variable is required for seeding',
            )
        }
        _prisma = new PrismaClient({
            adapter: new PrismaPg({ connectionString: dbUrl }),
        })
    }
    return _prisma
}

/**
 * Upsert canonical, hand-curated content that must exist in every environment
 * (currently the published CPTSD article). This runs regardless of the
 * sample-data presence guard below: that guard short-circuits the bulk demo data
 * (ADR-0008), but canonical content added after a DB was first seeded must still
 * reach it via the deploy-time seed. Idempotent; tolerant of a not-yet-migrated
 * table so it never breaks the rest of the seed.
 */
async function ensureCanonicalContent(db: any) {
    try {
        await db.article.upsert({
            where: { slug: cptsdArticle.slug },
            update: {},
            create: cptsdArticle,
        })
        console.log('Ensured canonical article:', cptsdArticle.slug)
    } catch (err) {
        console.error(
            'Failed to ensure canonical article (is the Article table migrated?):',
            err,
        )
    }
}

export async function runSeed(prismaClient?: any) {
    const db = prismaClient ?? getPrisma()

    // Canonical content is ensured on every run, even when the DB is already seeded.
    await ensureCanonicalContent(db)

    // Quick presence check to avoid re-seeding bulk sample data on every cold
    // start. Bryan's admin profile is the canonical marker.
    try {
        const existingAdmin = await db.profile.findUnique({ where: { email: 'brn.dbn@gmail.com' } })
        if (existingAdmin) {
            console.log('DB already seeded; skipping sample data.')
            return
        }
    } catch (err) {
        // If the check fails (e.g., table missing), proceed with seeding to surface errors
        console.error('seed presence check failed; proceeding with seed:', err)
    }

    console.log('Seeding DB...')

    // Generate UUIDs for profiles (matching Supabase Auth format)
    const crypto = await import('crypto')
    // Bryan's Profile.id MUST equal his Supabase Auth user.id for JWT admin auth
    // to resolve him as admin (see issue #90). Supply it via ADMIN_SUPABASE_UUID.
    const adminSupabaseUuid = process.env.ADMIN_SUPABASE_UUID
    if (!adminSupabaseUuid) {
        console.warn(
            'ADMIN_SUPABASE_UUID not set — using a random UUID for the admin Profile. ' +
            'JWT admin auth will not match the Supabase user until this is set and any ' +
            'existing prod row is reconciled (see issue #90).'
        )
    }
    const bryanUuid = adminSupabaseUuid ?? crypto.randomUUID()
    const adminUuid = crypto.randomUUID()

    // Create Bryan's admin profile
    // NOTE: In production, this ID should match the Supabase Auth user.id
    const bryanAdmin = await db.profile.upsert({
        where: { email: 'brn.dbn@gmail.com' },
        update: { isAdmin: true },
        create: {
            id: bryanUuid,
            email: 'brn.dbn@gmail.com',
            name: 'Bryan DeBaun',
            isAdmin: true,
        },
    })

    // Create a test admin user (for local development only)
    const admin = await db.profile.upsert({
        where: { email: 'admin@example.com' },
        update: { isAdmin: true },
        create: {
            id: adminUuid,
            email: 'admin@example.com',
            name: 'Local Admin',
            isAdmin: true,
        },
    })

    console.log('Created admin profiles:', { bryanAdmin, admin })

    // Create sample authors
    const author1 = await db.author.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: 'Brandon Sanderson',
            bio: 'American fantasy and science fiction writer',
            website: 'https://www.brandonsanderson.com',
        },
    })

    const author2 = await db.author.upsert({
        where: { id: 2 },
        update: {},
        create: {
            name: 'Patrick Rothfuss',
            bio: 'American writer of epic fantasy',
            website: 'https://www.patrickrothfuss.com',
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
            rating: 10,
            review: 'Epic fantasy masterpiece. The worldbuilding is incredible.',
            ratedAt: new Date(),
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
            rating: 9,
            review: 'Beautiful prose and compelling story.',
            ratedAt: new Date(),
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
        },
    })

    const cc2 = await db.contentCreator.upsert({
        where: { id: 2 },
        update: {},
        create: {
            name: 'FilmCritic',
            description: 'Film reviews and essays',
            website: 'https://filmcritic.example',
        },
    })

    const cc3 = await db.contentCreator.upsert({
        where: { id: 3 },
        update: {},
        create: {
            name: 'IndieDevChannel',
            description: 'Indie game dev diaries',
            website: 'https://indiedev.example',
        },
    })

    // Note: the canonical CPTSD article is upserted by ensureCanonicalContent()
    // at the top of runSeed, so it is seeded even on an already-seeded DB.

    console.log({
        profiles: { bryanAdmin, admin },
        authors: { author1, author2 },
        books: { book1, book2, book3 },
        movies: { movie1, movie2, movie3 },
        games: { game1, game2, game3 },
        contentCreators: { cc1, cc2, cc3 }
    })

    // Reset sequences to ensure they're ahead of any manually-inserted IDs (fixes CI test flakes with duplicate key violations)
    // Profile now uses UUID so no sequence to reset
    const sequenceResets = [
        { table: 'Author', sequence: 'Author_id_seq' },
        { table: 'Movie', sequence: 'Movie_id_seq' },
        { table: 'VideoGame', sequence: 'VideoGame_id_seq' },
        { table: 'ContentCreator', sequence: 'ContentCreator_id_seq' },
        { table: 'Article', sequence: 'Article_id_seq' },
    ]

    for (const { table, sequence } of sequenceResets) {
        try {
            await db.$executeRawUnsafe(`SELECT setval('"${sequence}"', (SELECT COALESCE(MAX(id), 1) FROM "${table}"))`)
            console.log(`${table} sequence reset successfully`)
        } catch (err) {
            console.error(`Failed to reset ${table} sequence:`, err)
            // Non-fatal, continue
        }
    }
}

async function main() {
    try {
        await runSeed()
    } catch (e) {
        console.error(e)
        process.exit(1)
    } finally {
        await getPrisma().$disconnect()
    }
}

// Only run when executed directly (`node dist/seed.js` / `prisma db seed`),
// not when imported (e.g. by tests) — importing must have no side effects.
const isMain =
    !!process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
    main()
}

