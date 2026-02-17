import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'

// Mock the spotify adapter module before importing server code
const mockStart = vi.fn().mockResolvedValue(undefined)
vi.mock('../../src/adapters/spotify/spotify-adapter', () => ({
    startSpotifyAdapter: mockStart
}))

import { registerDbDependentRoutes } from '../../src/http/server.js'

describe('Spotify adapter auto-start', () => {
    const origClientId = process.env.SPOTIFY_CLIENT_ID
    const origClientSecret = process.env.SPOTIFY_CLIENT_SECRET
    const origRefresh = process.env.SPOTIFY_REFRESH_TOKEN

    beforeEach(() => {
        vi.resetAllMocks()
        delete process.env.SPOTIFY_CLIENT_ID
        delete process.env.SPOTIFY_CLIENT_SECRET
        delete process.env.SPOTIFY_REFRESH_TOKEN
    })

    afterEach(() => {
        if (typeof origClientId === 'undefined') delete process.env.SPOTIFY_CLIENT_ID
        else process.env.SPOTIFY_CLIENT_ID = origClientId
        if (typeof origClientSecret === 'undefined') delete process.env.SPOTIFY_CLIENT_SECRET
        else process.env.SPOTIFY_CLIENT_SECRET = origClientSecret
        if (typeof origRefresh === 'undefined') delete process.env.SPOTIFY_REFRESH_TOKEN
        else process.env.SPOTIFY_REFRESH_TOKEN = origRefresh
    })

    it('does not attempt to auto-start when SPOTIFY env missing', async () => {
        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)
        expect(mockStart).not.toHaveBeenCalled()
    })

    it('requests adapter auto-start when SPOTIFY envs are present', async () => {
        process.env.SPOTIFY_CLIENT_ID = 'x'
        process.env.SPOTIFY_CLIENT_SECRET = 'y'
        process.env.SPOTIFY_REFRESH_TOKEN = 'z'

        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)

        // IIFE in registerSpotifyRoute should import and call startSpotifyAdapter
        expect(mockStart).toHaveBeenCalled()
    })
})