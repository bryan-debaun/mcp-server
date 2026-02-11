import { prisma } from '../db/index.js'

export async function updateAggregates(entityType: string, entityId: number, tx?: any) {
    // If tx provided, use it; otherwise use global prisma
    const client = tx || prisma

    // Compute aggregates from Rating table for the given entityType/entityId
    const agg = await client.rating.aggregate({
        where: { entityType, entityId },
        _count: { _all: true },
        _avg: { rating: true }
    })

    const count = agg._count?._all || 0
    const avg = agg._avg?.rating !== null && agg._avg?.rating !== undefined
        ? Number(Number(agg._avg.rating).toFixed(2))
        : null

    // Upsert into RatingAggregate
    await client.ratingAggregate.upsert({
        where: {
            entityType_entityId: {
                entityType,
                entityId
            }
        },
        create: {
            entityType,
            entityId,
            ratingCount: count,
            averageRating: avg
        },
        update: {
            ratingCount: count,
            averageRating: avg
        }
    })

    return { count, avg }
}

export async function backfillAllBookAggregates(batchSize = 200) {
    // Create rating aggregates for all books (throttled)
    console.log('Starting rating aggregate backfill for books...')
    let lastId = 0
    let processed = 0
    let hasMore = true

    while (hasMore) {
        const books = await prisma.book.findMany({
            where: { id: { gt: lastId } },
            orderBy: { id: 'asc' },
            take: batchSize,
            select: { id: true }
        })
        if (!books.length) {
            hasMore = false
            break
        }

        for (const b of books) {
            lastId = b.id
            await updateAggregates('book', b.id)
            processed++
        }

        // If we got fewer than a full batch, we're at the end
        if (books.length < batchSize) hasMore = false
    }

    console.log(`Backfill done: processed=${processed}`)
}

export default { updateAggregates, backfillAllBookAggregates }
