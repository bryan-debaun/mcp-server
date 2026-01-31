import 'dotenv/config'
import { defineConfig, env } from '@prisma/config'

// Make DATABASE_URL optional for local builds and CI where DB isn't required
// Default to a local SQLite file so `prisma generate` and other commands work
// without a full Postgres environment.
let dbUrl: string
try {
    dbUrl = env('DATABASE_URL')
} catch (e) {
    // Fallback to a local SQLite file for development and CI builds
    dbUrl = 'file:./dev.db'
}

export default defineConfig({
    datasource: {
        url: dbUrl,
    },
    migrations: {
        // Seed command used by `prisma db seed`
        seed: "node --loader ts-node/esm prisma/seed.ts",
    },
})
