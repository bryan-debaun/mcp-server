import express from "express";
import cors from "cors";
import { registerHealthRoute } from "./health-route.js";
import { registerPlaybackRoute } from "./playback-route.js";

export function createHttpApp() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    registerHealthRoute(app);
    registerPlaybackRoute(app);

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
