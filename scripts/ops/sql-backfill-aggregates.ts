import { initPrisma, prisma } from '../../src/db/index.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const argv = yargs(hideBin(process.argv))
    .option('dry-run', { type: 'boolean', default: false })
    .option('force', { type: 'boolean', default: false })
    .option('confirm-token', { type: 'string' })
    .help()
    .argv as any

const isProd = (process.env.DATABASE_URL || '').includes('supabase.co') || process.env.NODE_ENV === 'production'

if (isProd && !argv.force) {
    console.error('Refusing to run against production without --force. Pass --force and --confirm-token=REALLY_I_AGREE to proceed.')
    process.exit(1)
}

if (isProd && argv.force && (argv['confirm-token'] !== 'REALLY_I_AGREE' && process.env.CONFIRM !== 'REALLY_I_AGREE')) {
    console.error('Production run requires confirm token. Provide --confirm-token=REALLY_I_AGREE or set CONFIRM=REALLY_I_AGREE in the environment.')
    process.exit(1)
}

export default async function run() {
    await initPrisma()

    if (argv['dry-run']) {
        console.log('[dry-run] Would run SQL-based aggregate backfill (no writes)')
        return
    }

    console.log('Running SQL-based aggregate backfill...')

    await prisma.$executeRaw`WITH agg AS (SELECT "bookId" AS book_id, COUNT(*) AS rating_count, ROUND(AVG("rating")::numeric, 2) AS average_rating FROM "Rating" GROUP BY "bookId")
        UPDATE "Book" SET rating_count = agg.rating_count::int, average_rating = agg.average_rating::numeric FROM agg WHERE "Book".id = agg.book_id;`

    await prisma.$executeRaw`INSERT INTO "RatingAggregate"(entity_type, entity_id, rating_count, average_rating)
        SELECT 'book', book_id, rating_count, average_rating FROM (SELECT "bookId" AS book_id, COUNT(*) AS rating_count, ROUND(AVG("rating")::numeric,2) AS average_rating FROM "Rating" GROUP BY "bookId") AS s
        ON CONFLICT (entity_type, entity_id) DO UPDATE SET rating_count = EXCLUDED.rating_count, average_rating = EXCLUDED.average_rating;`

    console.log('SQL backfill finished')
}

if (process.argv[1] && process.argv[1].endsWith('sql-backfill-aggregates.ts')) {
    run().catch(err => { console.error('SQL backfill failed', err); process.exit(1) })
}
