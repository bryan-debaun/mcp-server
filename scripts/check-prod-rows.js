import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })
try {
    const movies = await db.movie.count()
    const videogames = await db.videoGame.count()
    const contentCreators = await db.contentCreator.count()
    console.log({ movies, videogames, contentCreators })
} catch (e) {
    console.error('error', e)
} finally {
    await db.$disconnect()
}
