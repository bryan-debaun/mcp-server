import request from 'supertest'
import { describe, it, expect, beforeEach } from 'vitest'
import { createHttpApp } from '../../src/http/server'

describe('POST /api/admin/spotify/oauth-callback', () => {
    beforeEach(() => {
        // ensure test env doesn't persist to .env.local
        process.env.NODE_ENV = 'test'
        delete process.env.SPOTIFY_REFRESH_TOKEN
    })

    it('sets SPOTIFY_REFRESH_TOKEN when refreshToken provided', async () => {
        const app = await createHttpApp()
        await request(app)
            .post('/api/admin/spotify/oauth-callback')
            .send({ refreshToken: 'test-refresh-token-123' })
            .expect(200)

        expect(process.env.SPOTIFY_REFRESH_TOKEN).toBe('test-refresh-token-123')
    })

    it('returns 400 when neither code nor refreshToken provided', async () => {
        const app = await createHttpApp()
        await request(app)
            .post('/api/admin/spotify/oauth-callback')
            .send({})
            .expect(400)
    })
})
