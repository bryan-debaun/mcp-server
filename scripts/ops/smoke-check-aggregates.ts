import { initPrisma, prisma } from '../../src/db/index.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const argv = yargs(hideBin(process.argv))
    .option('force', { type: 'boolean', default: false })
    .option('confirm-token', { type: 'string' })
    .help()
    .argv as any

const isProd = (process.env.DATABASE_URL || '').includes('supabase.co') || process.env.NODE_ENV === 'production'

if (isProd && !argv.force) {
    console.error('Refusing to run smoke check against production without --force. Pass --force and --confirm-token=REALLY_I_AGREE to proceed.')
    process.exit(1)
}

if (isProd && argv.force && (argv['confirm-token'] !== 'REALLY_I_AGREE' && process.env.CONFIRM !== 'REALLY_I_AGREE')) {
    console.error('Production run requires confirm token. Provide --confirm-token=REALLY_I_AGREE or set CONFIRM=REALLY_I_AGREE in the environment.')
    process.exit(1)
}

export default async function smoke() {
    await initPrisma()
    const bookCount = await prisma.book.count()
    const aggCountRaw: any = await prisma.$queryRaw`SELECT COUNT(*)::int as c FROM "RatingAggregate"`
    const aggCount = aggCountRaw?.[0]?.c ?? 0
    const sampleBooks = await prisma.book.findMany({ take: 3, select: { id: true, title: true, ratingCount: true, averageRating: true } })
    const sampleAggs: any = await prisma.$queryRaw`SELECT entity_type, entity_id, rating_count, average_rating FROM "RatingAggregate" LIMIT 3`

    console.log('bookCount=', bookCount)
    console.log('ratingAggregateCount=', aggCount)
    console.log('sampleBooks=', sampleBooks)
    console.log('sampleRatingAggregates=', sampleAggs)
}

if (process.argv[1] && process.argv[1].endsWith('smoke-check-aggregates.ts')) {
    smoke().catch(err => { console.error('Smoke check failed', err); process.exit(1) })
}
