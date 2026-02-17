import type { Request, Response } from 'express';
import { getPlayback } from './playback-store.js';

// Adapter methods are imported dynamically in registerDbDependentRoutes so tests
// that don't enable Spotify won't fail to import this module.

export function registerSpotifyRoute(app: any) {
    // Read-only: now playing (mirrors playback-store)
    app.get('/api/spotify/now-playing', (_req: Request, res: Response) => {
        const payload = getPlayback();
        res.json(payload);
    });

    // Liked songs and playlists rely on the adapter; we dynamically import the
    // adapter here so the endpoint returns a meaningful error if not configured.
    app.get('/api/spotify/liked', async (req: Request, res: Response) => {
        try {
            const { getLikedTracks } = await import('../adapters/spotify/spotify-adapter.js');
            const limit = Number(req.query.limit ?? 20);
            const offset = Number(req.query.offset ?? 0);
            const result = await getLikedTracks(limit, offset);
            res.json(result);
        } catch (err: any) {
            console.error('spotify-route /liked error', err);
            res.status(500).json({ error: err?.message ?? 'spotify error' });
        }
    });

    app.get('/api/spotify/playlists', async (req: Request, res: Response) => {
        try {
            const { getPlaylists } = await import('../adapters/spotify/spotify-adapter.js');
            const limit = Number(req.query.limit ?? 20);
            const offset = Number(req.query.offset ?? 0);
            const result = await getPlaylists(limit, offset);
            res.json(result);
        } catch (err: any) {
            console.error('spotify-route /playlists error', err);
            res.status(500).json({ error: err?.message ?? 'spotify error' });
        }
    });
}
