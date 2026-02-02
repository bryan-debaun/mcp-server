import type { Request, Response } from "express";
import { isReady } from './readiness.js'

export function registerHealthRoute(app: any): void {
    // Liveness probe — always returns 200 to indicate process is alive
    app.get("/healthz", (_req: Request, res: Response) => {
        const uptime = process.uptime();
        const version = process.version;
        res.status(200).json({ status: "ok", uptime_seconds: uptime, node: version });
    });

    // Readiness probe — returns 200 when the app is ready to serve traffic,
    // otherwise 503 while initialization (DB, etc.) is in progress.
    app.get('/readyz', (_req: Request, res: Response) => {
        if (isReady()) {
            return res.status(200).json({ status: 'ready' });
        }
        return res.status(503).json({ status: 'initializing' });
    });
}
