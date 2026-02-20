import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Load .env.local for tests
config({ path: ".env.local" });

const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === 'true';

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["test/**/*.test.ts"],
        // run DB integration tests serially to avoid cross-test DB teardown races
        fileParallelism: !RUN_DB_INTEGRATION,
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.d.ts"]
        }
    }
});
