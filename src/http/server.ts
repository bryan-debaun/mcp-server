import express from "express";
import cors from "cors";
import { registerHealthRoute } from "./health-route.js";
import { registerPlaybackRoute } from "./playback-route.js";
import { registerMetricsRoute, httpRequestsTotal, httpRequestDurationSeconds } from "./metrics-route.js";
import { registerAdminRoute } from './admin-route.js'

export function createHttpApp() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // HTTP instrumentation middleware
    app.use((req, res, next) => {
        const end = httpRequestDurationSeconds.startTimer();
        res.on("finish", () => {
            const labels = { method: req.method, path: req.path, status: String(res.statusCode) };
            httpRequestsTotal.inc(labels);
            end(labels);
        });
        next();
    });

    registerHealthRoute(app);
    registerPlaybackRoute(app);
    registerMetricsRoute(app);
    // Register admin routes
    registerAdminRoute(app)

    // Basic 404 handler
    app.use((_req, res) => res.status(404).json({ error: "not found" }));

    return app;
}

export function startHttpServer(port: number): Promise<import("http").Server> {
    const app = createHttpApp();
    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            console.error(`HTTP server listening on port ${port}`);
            resolve(server);
        });
    });
}
