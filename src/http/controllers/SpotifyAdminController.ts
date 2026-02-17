import { Controller, Post, Route, Tags, Body, SuccessResponse, Response } from 'tsoa'
import fs from 'fs'
import path from 'path'

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
            console.error('spotify-admin: validation failed - missing code or refreshToken', { body })
            this.setStatus(400)
            const err: any = new Error('Either `code` or `refreshToken` must be provided')
            err.status = 400
            throw err
        }

        try {
            let refreshToken: string | undefined = body.refreshToken

            // If an authorization code was provided, exchange it for tokens
            if (body.code) {
                const clientId = process.env.SPOTIFY_CLIENT_ID
                const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
                const redirectUri = process.env.SPOTIFY_REDIRECT_URI
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

            // Set in-process so adapter picks it up immediately
            process.env.SPOTIFY_REFRESH_TOKEN = refreshToken

            // Persist to .env.local in development for convenience (do NOT persist in test/prod)
            let persisted = false
            if ((process.env.NODE_ENV || 'development') === 'development') {
                try {
                    const envPath = path.resolve(process.cwd(), '.env.local')
                    let content = ''
                    try { content = fs.readFileSync(envPath, { encoding: 'utf8' }) } catch (e) { content = '' }
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
                    console.error('spotify-admin: failed to persist .env.local', err)
                }
            }

            // If adapter is running/available, attempt to start/restart it so the new token is used immediately
            try {
                const mod = await import('../../adapters/spotify/spotify-adapter.js')
                if (mod && typeof mod.startSpotifyAdapter === 'function') {
                    // startSpotifyAdapter is idempotent and will no-op if prerequisites missing
                    await mod.startSpotifyAdapter()
                }
            } catch (err) {
                console.error('spotify-admin: failed to start adapter after seeding token', err)
            }

            return { success: true, persistedToEnvFile: persisted }
        } catch (err: any) {
            console.error('spotify-admin: seedRefreshToken failed', err)
            // Preserve validation status if already set
            if (this.getStatus && this.getStatus() === 400) { this.setStatus(400); throw err }
            this.setStatus(500)
            throw new Error(err?.message ?? 'Failed to seed refresh token')
        }
    }
}
