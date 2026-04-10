import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'

// Mock the spotify adapter module before importing server code
const mockStart = vi.fn().mockResolvedValue(undefined)
vi.mock('../../src/adapters/spotify/spotify-adapter', () => ({
    startSpotifyAdapter: mockStart
}))

import { registerDbDependentRoutes } from '../../src/http/server.js'
import { config } from '../../src/config.js'

describe('Spotify adapter auto-start', () => {
    const origEnabled = config.spotify.enabled
    const origClientId = config.spotify.clientId
    const origClientSecret = config.spotify.clientSecret
    const origRefresh = config.spotify.refreshToken

    beforeEach(() => {
        vi.resetAllMocks()
        config.spotify.enabled = false
        config.spotify.clientId = undefined
        config.spotify.clientSecret = undefined
        config.spotify.refreshToken = undefined
    })

    afterEach(() => {
        config.spotify.enabled = origEnabled
        config.spotify.clientId = origClientId
        config.spotify.clientSecret = origClientSecret
        config.spotify.refreshToken = origRefresh
    })

    it('does not attempt to auto-start when SPOTIFY env missing', async () => {
        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)
        expect(mockStart).not.toHaveBeenCalled()
    })

    it('requests adapter auto-start when SPOTIFY envs are present', async () => {
        config.spotify.enabled = true
        config.spotify.clientId = 'x'
        config.spotify.clientSecret = 'y'
        config.spotify.refreshToken = 'z'

        // Re-apply mock implementation after vi.resetAllMocks() cleared it in beforeEach
        mockStart.mockResolvedValue(undefined)

        const app = express()
        app.use(express.json())
        await registerDbDependentRoutes(app)

        // The Spotify auto-start is a fire-and-forget IIFE; flush microtasks so it completes
        await new Promise(resolve => setTimeout(resolve, 0))

        // IIFE in registerSpotifyRoute should import and call startSpotifyAdapter
        expect(mockStart).toHaveBeenCalled()
    })
})