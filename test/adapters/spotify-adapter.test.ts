/**
 * Unit tests for the Spotify adapter using mocked global fetch.
 *
 * Covers:
 * - fetchCurrentlyPlaying: 204 (nothing playing), 200 with full track payload,
 *   200 with null item, non-ok API error (no crash)
 * - refreshAccessToken: failure path (throws correctly)
 * - getLikedTracks: happy path and API error
 * - getPlaylists: happy path
 * - startSpotifyAdapter: disabled when config.spotify.enabled = false
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    startSpotifyAdapter,
    stopSpotifyAdapter,
    getLikedTracks,
    getPlaylists,
} from '../../src/adapters/spotify/spotify-adapter.js'
import { getPlayback, setPlayback } from '../../src/http/playback-store.js'
import { config } from '../../src/config.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock fetch that routes by URL substring. Token endpoint always resolves
 *  unless `tokenOk` is false, allowing separation of token vs API failures. */
function makeFetch(
    apiRoute: string,
    apiResponse: { ok: boolean; status: number; body?: any },
    tokenOk = true,
) {
    return vi.fn().mockImplementation(async (url: string) => {
        const u = url.toString()
        if (u.includes('accounts.spotify.com')) {
            if (!tokenOk) {
                return { ok: false, status: 401, text: async () => 'Unauthorized', json: async () => ({}) }
            }
            return { ok: true, status: 200, text: async () => '', json: async () => ({ access_token: 'tok-test', expires_in: 3600 }) }
        }
        if (u.includes(apiRoute)) {
            const { ok, status, body } = apiResponse
            return { ok, status, text: async () => '', json: async () => body ?? {} }
        }
        return { ok: false, status: 404, text: async () => 'not found', json: async () => ({}) }
    })
}

const TRACK_PAYLOAD = {
    is_playing: true,
    progress_ms: 12345,
    repeat_state: 'off',
    shuffle_state: false,
    item: {
        id: 'track-1',
        name: 'Test Track',
        artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
        album: { name: 'Test Album' },
        duration_ms: 200000,
    },
    device: { id: 'dev-1', name: 'My Speaker', volume_percent: 80 },
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const origEnabled = config.spotify.enabled
const origClientId = config.spotify.clientId
const origClientSecret = config.spotify.clientSecret
const origRefreshToken = config.spotify.refreshToken

beforeEach(() => {
    config.spotify.enabled = true
    config.spotify.clientId = 'test-cid'
    config.spotify.clientSecret = 'test-csecret'
    config.spotify.refreshToken = 'test-rtoken'
    // Reset playback to a known baseline
    setPlayback({ is_playing: false, track: null, progress_ms: null, device: null, repeat_state: null, shuffle_state: null })
})

afterEach(() => {
    config.spotify.enabled = origEnabled
    config.spotify.clientId = origClientId
    config.spotify.clientSecret = origClientSecret
    config.spotify.refreshToken = origRefreshToken
    vi.unstubAllGlobals()
    vi.useRealTimers()
    stopSpotifyAdapter()
})

// ---------------------------------------------------------------------------
// fetchCurrentlyPlaying (exercised via startSpotifyAdapter)
// ---------------------------------------------------------------------------

describe('fetchCurrentlyPlaying', () => {
    it('sets is_playing:false and clears track on 204 (nothing playing)', async () => {
        setPlayback({ is_playing: true, track: { id: 'x', title: 'X', artists: ['A'], album: null, duration_ms: 1000 } })

        vi.stubGlobal('fetch', makeFetch('me/player/currently-playing', { ok: true, status: 204 }))

        await startSpotifyAdapter()

        const state = getPlayback()
        expect(state.is_playing).toBe(false)
        expect(state.track).toBeNull()
    })

    it('maps a full Spotify currently-playing payload to PlaybackState', async () => {
        vi.stubGlobal('fetch', makeFetch('me/player/currently-playing', { ok: true, status: 200, body: TRACK_PAYLOAD }))

        await startSpotifyAdapter()

        const state = getPlayback()
        expect(state.is_playing).toBe(true)
        expect(state.progress_ms).toBe(12345)
        expect(state.repeat_state).toBe('off')
        expect(state.shuffle_state).toBe(false)
        expect(state.track).toEqual({
            id: 'track-1',
            title: 'Test Track',
            artists: ['Artist A', 'Artist B'],
            album: 'Test Album',
            duration_ms: 200000,
        })
        expect(state.device).toEqual({ id: 'dev-1', name: 'My Speaker', volume_percent: 80 })
    })

    it('sets track:null when item is null in the response', async () => {
        const payload = { ...TRACK_PAYLOAD, item: null, is_playing: true }
        vi.stubGlobal('fetch', makeFetch('me/player/currently-playing', { ok: true, status: 200, body: payload }))

        await startSpotifyAdapter()

        const state = getPlayback()
        expect(state.track).toBeNull()
        expect(state.is_playing).toBe(true)
    })

    it('logs error and does not crash on non-ok API response', async () => {
        vi.stubGlobal('fetch', makeFetch('me/player/currently-playing', { ok: false, status: 503 }))
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(startSpotifyAdapter()).resolves.not.toThrow()

        expect(spy).toHaveBeenCalledWith(
            expect.stringContaining('spotify-adapter'),
            expect.any(Error),
        )
        spy.mockRestore()
    })
})

// ---------------------------------------------------------------------------
// refreshAccessToken failure
// ---------------------------------------------------------------------------

describe('refreshAccessToken', () => {
    it('getLikedTracks throws when token refresh returns non-ok', async () => {
        // Advance time past token expiry to force a refresh attempt
        vi.useFakeTimers()
        vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000) // +2h

        vi.stubGlobal('fetch', makeFetch('me/tracks', { ok: true, status: 200, body: { items: [] } }, false))

        await expect(getLikedTracks()).rejects.toThrow('Spotify token refresh failed: 401')
    })
})

// ---------------------------------------------------------------------------
// getLikedTracks
// ---------------------------------------------------------------------------

describe('getLikedTracks', () => {
    it('returns items from Spotify liked tracks endpoint', async () => {
        const body = { items: [{ track: { id: '1', name: 'A' } }], total: 1, limit: 20, offset: 0 }
        vi.stubGlobal('fetch', makeFetch('me/tracks', { ok: true, status: 200, body }))

        const result = await getLikedTracks(20, 0)
        expect(result.items).toHaveLength(1)
        expect(result.total).toBe(1)
    })

    it('throws on non-ok liked tracks response', async () => {
        vi.stubGlobal('fetch', makeFetch('me/tracks', { ok: false, status: 500 }))

        await expect(getLikedTracks()).rejects.toThrow('spotify liked tracks failed: 500')
    })
})

// ---------------------------------------------------------------------------
// getPlaylists
// ---------------------------------------------------------------------------

describe('getPlaylists', () => {
    it('returns items from Spotify playlists endpoint', async () => {
        const body = { items: [{ id: 'pl1', name: 'My Playlist', tracks: { total: 10 } }], total: 1, limit: 20, offset: 0 }
        vi.stubGlobal('fetch', makeFetch('me/playlists', { ok: true, status: 200, body }))

        const result = await getPlaylists(20, 0)
        expect(result.items[0].name).toBe('My Playlist')
    })

    it('throws on non-ok playlists response', async () => {
        vi.stubGlobal('fetch', makeFetch('me/playlists', { ok: false, status: 403 }))

        await expect(getPlaylists()).rejects.toThrow('spotify playlists failed: 403')
    })
})

// ---------------------------------------------------------------------------
// startSpotifyAdapter guard
// ---------------------------------------------------------------------------

describe('startSpotifyAdapter', () => {
    it('does nothing when spotify is disabled', async () => {
        config.spotify.enabled = false
        const spy = vi.fn()
        vi.stubGlobal('fetch', spy)

        await startSpotifyAdapter()

        expect(spy).not.toHaveBeenCalled()
    })
})
