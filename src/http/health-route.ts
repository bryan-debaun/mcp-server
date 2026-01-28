import type { Request, Response } from "express";

export function registerHealthRoute(app: any): void {
  app.get("/health", (_req: Request, res: Response) => {
    // Add checks here in the future (DB, token store, etc.)
    res.status(200).json({ status: "ok" });
  });
}
