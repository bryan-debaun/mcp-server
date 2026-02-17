import { Controller, Get, Route, Tags, Query, Response, SuccessResponse } from 'tsoa';
import { getPlayback, PlaybackState } from '../playback-store.js';

/**
 * Minimal typed responses for client generation. These intentionally mirror
 * the subset of fields the website currently needs — the adapter returns
 * the full Spotify payload for liked/playlists and we cast to these shapes.
 */
export interface LikedTrackItem {
    added_at: string;
    track: {
        id: string;
        name: string;
        artists: Array<{ name: string }>;
        album?: { name?: string } | null;
        duration_ms: number;
    };
}

export interface LikedTracksResponse {
    items: LikedTrackItem[];
    total: number;
    limit: number;
    offset: number;
}

export interface PlaylistItem {
    id: string;
    name: string;
    tracks: { total: number };
}

export interface PlaylistsResponse {
    items: PlaylistItem[];
    total: number;
    limit: number;
    offset: number;
}

@Route('api/spotify')
@Tags('Spotify')
export class SpotifyController extends Controller {
    @Get('/now-playing')
    @SuccessResponse('200', 'Current playback state')
    public async nowPlaying(): Promise<PlaybackState> {
        return getPlayback();
    }

    @Get('/liked')
    @SuccessResponse('200', 'Currently liked tracks (Spotify)')
    @Response('500', 'Spotify adapter not configured or failed')
    public async liked(@Query() limit?: number, @Query() offset?: number): Promise<LikedTracksResponse> {
        try {
            const { getLikedTracks } = await import('../../adapters/spotify/spotify-adapter.js');
            const res: any = await getLikedTracks(Number(limit ?? 20), Number(offset ?? 0));
            // Cast the Spotify response to a simplified typed shape for the client
            return {
                items: (res.items || []) as LikedTrackItem[],
                total: res.total ?? 0,
                limit: res.limit ?? Number(limit ?? 20),
                offset: res.offset ?? Number(offset ?? 0)
            };
        } catch (err: any) {
            console.error('SpotifyController.liked failed', err);
            this.setStatus(500);
            throw new Error(err?.message ?? 'spotify error');
        }
    }

    @Get('/playlists')
    @SuccessResponse('200', 'User playlists (Spotify)')
    @Response('500', 'Spotify adapter not configured or failed')
    public async playlists(@Query() limit?: number, @Query() offset?: number): Promise<PlaylistsResponse> {
        try {
            const { getPlaylists } = await import('../../adapters/spotify/spotify-adapter.js');
            const res: any = await getPlaylists(Number(limit ?? 20), Number(offset ?? 0));
            return {
                items: (res.items || []) as PlaylistItem[],
                total: res.total ?? 0,
                limit: res.limit ?? Number(limit ?? 20),
                offset: res.offset ?? Number(offset ?? 0)
            };
        } catch (err: any) {
            console.error('SpotifyController.playlists failed', err);
            this.setStatus(500);
            throw new Error(err?.message ?? 'spotify error');
        }
    }
}
