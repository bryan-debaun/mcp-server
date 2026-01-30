import 'dotenv/config'
import { defineConfig, env } from '@prisma/config'

export default defineConfig({
    datasource: {
        // Read DATABASE_URL from env (set in .env or CI environment)
        url: env('DATABASE_URL'),
    },
    migrations: {
        // Seed command used by `prisma db seed`
        seed: "node --loader ts-node/esm prisma/seed.ts",
    },
})
