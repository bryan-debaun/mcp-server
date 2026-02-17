#!/usr/bin/env tsx
/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

type SpotifyTokenResponse = {
    access_token?: string
    token_type?: string
    expires_in?: number
    scope?: string
    refresh_token?: string
    error?: string
    error_description?: string
}

// Load .env.local into process.env (only for keys not already set)
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8')
    raw.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) return
        const idx = trimmed.indexOf('=')
        if (idx === -1) return
        const k = trimmed.substring(0, idx)
        const v = trimmed.substring(idx + 1)
        if (!process.env[k]) process.env[k] = v
    })
    console.error('.env.local loaded (selective)')
} else {
    console.error('.env.local not found; using current environment')
}

async function exchangeRefreshToken(clientId: string, clientSecret: string, refreshToken: string) {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    })
    const json = (await res.json()) as SpotifyTokenResponse
    return { status: res.status, body: json }
}

async function run() {
    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken) {
        console.error('Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN in environment')
        process.exitCode = 2
        return
    }

    console.error('Attempting token exchange (refresh token → access token)')
    try {
        const tokenRes = await exchangeRefreshToken(clientId, clientSecret, refreshToken)
        console.error('Token exchange status:', tokenRes.status)
        console.error('Token response scopes:', tokenRes.body.scope ?? '(none)')
        if (!tokenRes.body.access_token) {
            console.error('No access_token in response:', JSON.stringify(tokenRes.body))
        }

        // Try adapter helpers (getPlaylists / getLikedTracks) if available
        try {
            const mod = await import('../src/adapters/spotify/spotify-adapter')
            const { getPlaylists, getLikedTracks } = mod

            console.error('\nCalling getPlaylists()')
            try {
                const p = await getPlaylists(5, 0)
                console.log('getPlaylists result (trimmed):', JSON.stringify(p, null, 2).slice(0, 800))
            } catch (err) {
                console.error('getPlaylists error:', (err as any)?.message ?? err)
            }

            console.error('\nCalling getLikedTracks()')
            try {
                const l = await getLikedTracks(5, 0)
                console.log('getLikedTracks result (trimmed):', JSON.stringify(l, null, 2).slice(0, 800))
            } catch (err: any) {
                console.error('getLikedTracks error:', err?.message ?? err)
                // Show raw /me/tracks response using the freshly exchanged access token when available
                if (tokenRes.body.access_token) {
                    try {
                        const r = await fetch('https://api.spotify.com/v1/me/tracks?limit=1', { headers: { Authorization: `Bearer ${tokenRes.body.access_token}` } })
                        const txt = await r.text()
                        console.error('Raw /me/tracks response status:', r.status, 'body:', txt)
                    } catch (err2) {
                        console.error('Failed to fetch raw /me/tracks:', (err2 as any)?.message ?? err2)
                    }
                }
            }
        } catch (err) {
            console.error('spotify-adapter module not importable from src — is this a compiled/runtime mismatch?', (err as any)?.message ?? err)
        }
    } catch (err) {
        console.error('Token exchange failed:', (err as any)?.message ?? err)
        process.exitCode = 3
    }
}

run().then(() => process.exit())
