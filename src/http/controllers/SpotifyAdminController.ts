import { Controller, Post, Route, Tags, Body, SuccessResponse, Response } from 'tsoa'
import { logger } from "../../logger.js";
import fs from 'fs'
import path from 'path'
import { config } from '../../config.js'

interface SeedRequest {
    code?: string
    refreshToken?: string
}

interface SeedResponse {
    success: boolean
    persistedToEnvFile?: boolean
    message?: string
}

@Route('api/admin/spotify')
@Tags('Admin')
export class SpotifyAdminController extends Controller {
    /**
     * Accept a Spotify OAuth `code` (server-side exchange) or a `refreshToken` and seed
     * the server's SPOTIFY_REFRESH_TOKEN value so the adapter can start.
     *
     * Notes:
     * - This endpoint is intended as a one-time admin helper. In production prefer setting
     *   `SPOTIFY_REFRESH_TOKEN` via your host/secret manager (Render, etc.).
     * - When running in `development` this will also persist the token to `.env.local`.
     */
    @Post('/oauth-callback')
    @SuccessResponse('200', 'Refresh token seeded')
    @Response('400', 'Invalid request')
    @Response('500', 'Server error')
    public async seedRefreshToken(@Body() body: SeedRequest): Promise<SeedResponse> {
        // Validate early so validation errors escape the function (TSOA will map status correctly)
        if (!body || (!body.code && !body.refreshToken)) {
            logger.error('spotify-admin: validation failed - missing code or refreshToken', { body })
            this.setStatus(400)
            const err: any = new Error('Either `code` or `refreshToken` must be provided')
            err.status = 400
            throw err
        }

        try {
            let refreshToken: string | undefined = body.refreshToken

            // If an authorization code was provided, exchange it for tokens
            if (body.code) {
                const clientId = config.spotify.clientId
                const clientSecret = config.spotify.clientSecret
                const redirectUri = config.spotify.redirectUri
                if (!clientId || !clientSecret || !redirectUri) {
                    this.setStatus(400)
                    const err: any = new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REDIRECT_URI must be configured to exchange code')
                    err.status = 400
                    throw err
                }

                const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
                const params = new URLSearchParams({ grant_type: 'authorization_code', code: body.code, redirect_uri: redirectUri })
                const res = await fetch('https://accounts.spotify.com/api/token', {
                    method: 'POST',
                    headers: {
                        Authorization: `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: params.toString()
                })

                if (!res.ok) {
                    const txt = await res.text()
                    throw new Error(`Failed to exchange code: ${res.status} ${txt}`)
                }

                const json: any = await res.json()
                refreshToken = json.refresh_token
                if (!refreshToken) throw new Error('Spotify did not return a refresh_token')
            }

            if (!refreshToken) {
                this.setStatus(400)
                const err: any = new Error('No refresh token available')
                err.status = 400
                throw err
            }

            // Seed the token into the adapter in-process so it's used immediately
            // (the adapter reads its own override, not process.env).
            const adapter = await import('../../adapters/spotify/spotify-adapter.js')
            adapter.setSpotifyRefreshToken(refreshToken)

            // Persist to .env.local in development for convenience (do NOT persist in test/prod)
            let persisted = false
            if (!config.isProduction) {
                try {
                    const envPath = path.resolve(process.cwd(), '.env.local')
                    let content = ''
                    try { content = fs.readFileSync(envPath, { encoding: 'utf8' }) } catch { content = '' }
                    const key = 'SPOTIFY_REFRESH_TOKEN'
                    const regex = new RegExp(`^${key}=.*$`, 'm')
                    if (regex.test(content)) {
                        content = content.replace(regex, `${key}=${refreshToken}`)
                    } else {
                        if (content && !content.endsWith('\n')) content += '\n'
                        content += `${key}=${refreshToken}\n`
                    }
                    fs.writeFileSync(envPath, content, { encoding: 'utf8' })
                    persisted = true
                } catch (err) {
                    // non-fatal — continue but report not persisted
                    logger.error('spotify-admin: failed to persist .env.local', err)
                }
            }

            // Start/restart the adapter so the new token is used immediately
            // (idempotent; no-ops if prerequisites are still missing).
            try {
                await adapter.startSpotifyAdapter()
            } catch (err) {
                logger.error('spotify-admin: failed to start adapter after seeding token', err)
            }

            return { success: true, persistedToEnvFile: persisted }
        } catch (err: any) {
            logger.error('spotify-admin: seedRefreshToken failed', err)
            // Preserve validation status if already set
            if (this.getStatus && this.getStatus() === 400) { this.setStatus(400); throw err }
            this.setStatus(500)
            throw new Error(err?.message ?? 'Failed to seed refresh token')
        }
    }
}
