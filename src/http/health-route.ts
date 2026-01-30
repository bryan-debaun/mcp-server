import type { Request, Response } from "express";

export function registerHealthRoute(app: any): void {
    app.get("/healthz", (_req: Request, res: Response) => {
        // Add checks here in the future (DB, token store, etc.)
        const uptime = process.uptime();
        const version = process.version;
        res.status(200).json({ status: "ok", uptime_seconds: uptime, node: version });
    });
}
