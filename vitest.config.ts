import { defineConfig } from "vitest/config";

const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === 'true';

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["test/**/*.test.ts"],
        // run DB integration tests serially to avoid cross-test DB teardown races
        threads: RUN_DB_INTEGRATION ? false : true,
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.d.ts"]
        }
    }
});
