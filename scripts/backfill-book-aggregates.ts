import { prisma } from '../src/db/index.js'
import { performance } from 'perf_hooks'

async function backfill(batchSize = 100) {
    console.log('Starting backfill of book aggregates...')
    const start = performance.now()
    let processed = 0
    // Process books in batches by id to avoid long-running transactions
    let lastId = 0
    while (true) {
        const books = await prisma.book.findMany({
            where: { id: { gt: lastId } },
            orderBy: { id: 'asc' },
            take: batchSize,
            select: { id: true }
        })
        if (!books.length) break

        for (const b of books) {
            lastId = b.id
            // Compute aggregates for this book
            const agg = await prisma.rating.aggregate({
                where: { bookId: b.id },
                _count: { _all: true },
                _avg: { rating: true }
            })
            const count = agg._count._all || 0
            const avg = agg._avg.rating !== null && agg._avg.rating !== undefined
                ? Number(Number(agg._avg.rating).toFixed(2))
                : null

            await prisma.book.update({
                where: { id: b.id },
                data: {
                    ratingCount: count,
                    averageRating: avg
                }
            })
            processed++
        }
    }

    const duration = ((performance.now() - start) / 1000).toFixed(2)
    console.log(`Backfill completed: processed=${processed} duration_s=${duration}`)

    // Try to set last backfill timestamp metric (epoch seconds)
    try {
        const metrics = await import('../src/http/metrics-route.js')
        metrics.bookAggregatesLastBackfillTimestamp?.set?.(Math.floor(Date.now() / 1000))
        console.log('Set metric book_aggregates_last_backfill_timestamp')
    } catch (err) {
        console.warn('Could not set backfill metric', err)
    }
}


if (require.main === module) {
    const batch = Number(process.env.BACKFILL_BATCH_SIZE || '100')
    backfill(batch).catch(err => {
        console.error('Backfill failed', err)
        process.exit(1)
    })
}

export default backfill
