import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { jwtMiddleware, verifySupabaseJwt } from '../../src/auth/jwt'
import express from 'express'
import request from 'supertest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'

let publicJwk: any
let privateKey: CryptoKey
let jwksUrl = 'https://example.local/.well-known/jwks.json'
let issuer = 'https://nanodcvcpklffksxofbm.supabase.co'
let audience = 'authenticated'

beforeAll(async () => {
    // generate keys for test
    const { publicKey, privateKey: pk } = await generateKeyPair('RS256')
    privateKey = pk
    publicJwk = await exportJWK(publicKey)
    publicJwk.kid = 'test-kid'

    // stub fetch used by createRemoteJWKSet
    vi.stubGlobal('fetch', async (url: string) => {
        if (url.toString().startsWith('https://example.local')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ keys: [publicJwk] }),
            }
        }
        return { ok: false, status: 404 }
    })

    // set env vars used by middleware
    process.env.SUPABASE_JWKS_URL = jwksUrl
    process.env.SUPABASE_ISS = issuer
    process.env.SUPABASE_AUD = audience
})

afterAll(() => {
    vi.unstubAllGlobals()
})

describe('JWT middleware', () => {
    it('verifies a valid token and attaches user', async () => {
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject('user-1')
            .setIssuedAt()
            .setExpirationTime('2h')
            .sign(privateKey as any)

        // create a tiny express app using the middleware
        const app = express()
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => {
            res.json({ user: (req as any).user })
        })

        const res = await request(app).get('/whoami').set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.user.sub).toBe('user-1')
    })

    it('rejects invalid token', async () => {
        const app = express()
        app.use(jwtMiddleware)
        app.get('/whoami', (req, res) => res.json({ user: (req as any).user }))

        const res = await request(app).get('/whoami').set('Authorization', `Bearer invalid-token`)
        expect(res.status).toBe(401)
    })

    it('verifySupabaseJwt fails for expired token', async () => {
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject('user-2')
            .setIssuedAt()
            .setExpirationTime('1s')
            .sign(privateKey as any)

        // wait to expire
        await new Promise((r) => setTimeout(r, 1100))

        await expect(verifySupabaseJwt(token)).rejects.toThrow()
    })
})