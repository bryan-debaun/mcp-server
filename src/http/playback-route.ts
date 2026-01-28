import type { Request, Response } from "express";
import { getPlayback } from "./playback-store.js";

export function registerPlaybackRoute(app: any): void {
  app.get("/api/playback", (_req: Request, res: Response) => {
    const payload = getPlayback();
    res.json(payload);
  });
}
