import { initPrisma, prisma } from '../../src/db/index.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const argv = yargs(hideBin(process.argv))
    .option('batch-size', { type: 'number', default: 100 })
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

export default async function backfill(batchSize = Number(argv['batch-size'])) {
    await initPrisma()
    console.log(`Starting backfill of book aggregates (batchSize=${batchSize}) dryRun=${argv['dry-run']}`)

    let processed = 0

    // Iterate books in batches
    let lastId = 0
    while (true) {
        const books = await prisma.book.findMany({ where: { id: { gt: lastId } }, orderBy: { id: 'asc' }, take: batchSize, select: { id: true } })
        if (!books.length) break

        for (const b of books) {
            lastId = b.id
            const agg: any = await prisma.$queryRaw`SELECT COUNT(*)::int AS count, ROUND(AVG("rating")::numeric, 2) AS avg FROM "Rating" WHERE "bookId" = ${b.id}`
            const count = Number(agg?.[0]?.count ?? 0)
            const avg = agg?.[0]?.avg !== null && agg?.[0]?.avg !== undefined ? Number(agg[0].avg) : null

            if (!argv['dry-run']) {
                await prisma.book.update({ where: { id: b.id }, data: { ratingCount: count, averageRating: avg } })
                await prisma.$executeRaw`INSERT INTO "RatingAggregate"(entity_type, entity_id, rating_count, average_rating) VALUES ('book', ${b.id}, ${count}, ${avg}) ON CONFLICT (entity_type, entity_id) DO UPDATE SET rating_count = EXCLUDED.rating_count, average_rating = EXCLUDED.average_rating;`
            } else {
                console.log(`[dry-run] book ${b.id} -> count=${count} avg=${avg}`)
            }

            processed++
        }
    }

    console.log(`Backfill completed: processed=${processed}`)

    try {
        const metrics = await import('../../src/http/metrics-route.js')
        if (!argv['dry-run']) {
            metrics.bookAggregatesLastBackfillTimestamp?.set?.(Math.floor(Date.now() / 1000))
            console.log('Set metric book_aggregates_last_backfill_timestamp')
        } else {
            console.log('[dry-run] skipped setting backfill timestamp metric')
        }
    } catch (err) {
        console.warn('Could not set backfill metric', err)
    }
}

// If invoked directly
if (process.argv[1] && process.argv[1].endsWith('backfill-book-aggregates.ts')) {
    backfill().catch(err => { console.error('Backfill failed', err); process.exit(1) })
}
