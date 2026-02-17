import { setPlayback } from '../../http/playback-store.js';

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms
let pollHandle: NodeJS.Timeout | null = null;

function nowMs() { return Date.now(); }

async function refreshAccessToken(): Promise<string> {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) throw new Error('Spotify credentials not configured');

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });

    const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Spotify token refresh failed: ${res.status} ${txt}`);
    }

    const json: any = await res.json();
    cachedAccessToken = json.access_token;
    const expiresIn = Number(json.expires_in || 3600);
    tokenExpiresAt = nowMs() + (expiresIn - 30) * 1000; // refresh a bit early
    return cachedAccessToken as string;
}

async function getAccessToken(): Promise<string> {
    if (cachedAccessToken && nowMs() < tokenExpiresAt) return cachedAccessToken;
    return await refreshAccessToken();
}

async function fetchSpotifyApi(path: string, opts: RequestInit = {}) {
    const token = await getAccessToken();
    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers: {
            ...(opts.headers || {}),
            Authorization: `Bearer ${token}`
        }
    });
    return res;
}

async function fetchCurrentlyPlaying(): Promise<void> {
    try {
        const res = await fetchSpotifyApi('/me/player/currently-playing');
        if (res.status === 204) {
            // no content — not playing
            setPlayback({ is_playing: false, track: null });
            return;
        }
        if (!res.ok) {
            throw new Error(`spotify currently-playing ${res.status}`);
        }
        const j: any = await res.json();
        // Map Spotify response to PlaybackState partial
        const item = j.item;
        const track = item ? {
            id: item.id,
            title: item.name,
            artists: item.artists.map((a: any) => a.name),
            album: item.album?.name ?? null,
            duration_ms: item.duration_ms
        } : null;

        const device = j.device ? { id: j.device.id, name: j.device.name, volume_percent: j.device.volume_percent } : null;

        setPlayback({ is_playing: j.is_playing, progress_ms: j.progress_ms ?? null, track, device, repeat_state: j.repeat_state ?? null, shuffle_state: j.shuffle_state ?? null });
    } catch (err) {
        console.error('spotify-adapter: failed to fetch currently-playing', err);
    }
}

export async function getLikedTracks(limit = 20, offset = 0): Promise<any> {
    const res = await fetchSpotifyApi(`/me/tracks?limit=${limit}&offset=${offset}`);
    if (!res.ok) {
        throw new Error(`spotify liked tracks failed: ${res.status}`);
    }
    return res.json();
}

export async function getPlaylists(limit = 20, offset = 0): Promise<any> {
    const res = await fetchSpotifyApi(`/me/playlists?limit=${limit}&offset=${offset}`);
    if (!res.ok) {
        throw new Error(`spotify playlists failed: ${res.status}`);
    }
    return res.json();
}

export async function startSpotifyAdapter() {
    const enabled = !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REFRESH_TOKEN);
    if (!enabled) return;

    // Prime a token so errors are visible on startup
    try {
        await getAccessToken();
    } catch (err) {
        console.error('spotify-adapter: failed to refresh token on startup', err);
    }

    const intervalMs = Number(process.env.SPOTIFY_POLL_INTERVAL_MS || 15000);
    if (pollHandle) clearInterval(pollHandle);
    // Immediately fetch once, then poll
    await fetchCurrentlyPlaying();
    pollHandle = setInterval(fetchCurrentlyPlaying, intervalMs);
    console.error('spotify-adapter: started polling (interval ms)', intervalMs);
}

export async function stopSpotifyAdapter() {
    if (pollHandle) {
        clearInterval(pollHandle);
        pollHandle = null;
    }
}
