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

    // Attempt to auto-start the Spotify adapter when the route is registered.
    // This lets the adapter begin polling automatically on server boot when
    // credentials and refresh token are present.
    (async () => {
        // Only attempt auto-start when the Spotify configuration looks complete.
        if (!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REFRESH_TOKEN)) {
            console.error('spotify-adapter: auto-start skipped (missing SPOTIFY env)');
            return;
        }

        try {
            const { startSpotifyAdapter } = await import('../adapters/spotify/spotify-adapter.js');
            startSpotifyAdapter().catch((err) => console.error('spotify-adapter: auto-start failed', err));
            console.error('spotify-adapter: auto-start requested');
        } catch (err) {
            // Non-fatal — adapter may be unavailable in this runtime
            console.error('spotify-adapter: auto-start import failed', (err as any)?.message ?? err);
        }
    })();
}
