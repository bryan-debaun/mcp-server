import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { config } from '../../src/config.js'
import { mcpAuthMiddleware } from '../../src/http/middleware/mcp-auth.js'
import { registerProtectedResourceMetadata } from '../../src/http/protected-resource-metadata.js'

const WELL_KNOWN = '/.well-known/oauth-protected-resource'

const ORIGINAL = {
    publicBaseUrl: config.oauth.publicBaseUrl,
    resourceIdentifier: config.oauth.resourceIdentifier,
    authorizationServers: config.oauth.authorizationServers,
    scopesSupported: config.oauth.scopesSupported,
    issuer: config.auth.oidc.issuer,
    mcpApiKey: config.security.mcpApiKey,
}

const makeApp = () => {
    const app = express()
    registerProtectedResourceMetadata(app)
    return app
}

beforeEach(() => {
    ;(config as any).oauth.publicBaseUrl = 'https://bad-mcp.example.com'
    ;(config as any).oauth.resourceIdentifier = undefined
    ;(config as any).oauth.authorizationServers = []
    ;(config as any).oauth.scopesSupported = []
    ;(config as any).auth.oidc.issuer = 'https://issuer.example.com/auth/v1'
})

afterEach(() => {
    ;(config as any).oauth.publicBaseUrl = ORIGINAL.publicBaseUrl
    ;(config as any).oauth.resourceIdentifier = ORIGINAL.resourceIdentifier
    ;(config as any).oauth.authorizationServers = ORIGINAL.authorizationServers
    ;(config as any).oauth.scopesSupported = ORIGINAL.scopesSupported
    ;(config as any).auth.oidc.issuer = ORIGINAL.issuer
    ;(config as any).security.mcpApiKey = ORIGINAL.mcpApiKey
})

describe('RFC 9728 Protected Resource Metadata (#152)', () => {
    it('serves a valid document at the bare well-known path', async () => {
        const res = await request(makeApp()).get(WELL_KNOWN).expect(200)
        // `resource` is the one REQUIRED member (RFC 9728 §2).
        expect(res.body.resource).toBe('https://bad-mcp.example.com')
        expect(res.body.bearer_methods_supported).toEqual(['header'])
    })

    // RFC 9728 §3.1 inserts the resource's path component after the well-known
    // prefix — this is the form standards-based MCP clients actually request.
    it('serves the path-inserted document for the /mcp resource', async () => {
        const res = await request(makeApp())
            .get(`${WELL_KNOWN}/mcp`)
            .expect(200)
        expect(res.body.resource).toBe('https://bad-mcp.example.com/mcp')
    })

    it('defaults authorization_servers to the OIDC issuer we already verify against', async () => {
        const res = await request(makeApp()).get(`${WELL_KNOWN}/mcp`)
        expect(res.body.authorization_servers).toEqual([
            'https://issuer.example.com/auth/v1',
        ])
    })

    it('takes the authorization server from config when set, not the issuer', async () => {
        ;(config as any).oauth.authorizationServers = [
            'https://tenant.logto.app/oidc',
        ]
        const res = await request(makeApp()).get(`${WELL_KNOWN}/mcp`)
        expect(res.body.authorization_servers).toEqual([
            'https://tenant.logto.app/oidc',
        ])
    })

    it('takes the resource identifier from config when set', async () => {
        ;(config as any).oauth.resourceIdentifier =
            'https://api.example.com/mcp'
        const res = await request(makeApp()).get(`${WELL_KNOWN}/mcp`)
        expect(res.body.resource).toBe('https://api.example.com/mcp')
    })

    it('omits authorization_servers rather than emitting an empty array', async () => {
        ;(config as any).auth.oidc.issuer = undefined
        const res = await request(makeApp()).get(`${WELL_KNOWN}/mcp`)
        expect(res.body).not.toHaveProperty('authorization_servers')
    })

    it('advertises scopes only when configured', async () => {
        const before = await request(makeApp()).get(`${WELL_KNOWN}/mcp`)
        expect(before.body).not.toHaveProperty('scopes_supported')

        ;(config as any).oauth.scopesSupported = ['mcp:read', 'mcp:write']
        const after = await request(makeApp()).get(`${WELL_KNOWN}/mcp`)
        expect(after.body.scopes_supported).toEqual(['mcp:read', 'mcp:write'])
    })

    it('derives the origin from forwarded headers when no base URL is pinned', async () => {
        ;(config as any).oauth.publicBaseUrl = undefined
        const res = await request(makeApp())
            .get(`${WELL_KNOWN}/mcp`)
            .set('X-Forwarded-Proto', 'https')
            .set('X-Forwarded-Host', 'derived.example.com')
        expect(res.body.resource).toBe('https://derived.example.com/mcp')
    })

    it('is publicly reachable — the document must not sit behind the gate it describes', async () => {
        ;(config as any).security.mcpApiKey = 'secret-key'
        const app = express()
        registerProtectedResourceMetadata(app)
        app.use(mcpAuthMiddleware)
        app.get('/protected', (_req, res) => res.json({ ok: true }))

        await request(app).get(`${WELL_KNOWN}/mcp`).expect(200)
        // Sanity check that the gate is genuinely active in this app.
        await request(app).get('/protected').expect(401)
    })
})

describe('WWW-Authenticate on MCP 401s (#152)', () => {
    const gatedApp = () => {
        ;(config as any).security.mcpApiKey = 'secret-key'
        const app = express()
        app.use(mcpAuthMiddleware)
        app.get('/mcp', (_req, res) => res.json({ ok: true }))
        return app
    }

    it('returns 401 carrying a resource_metadata pointer', async () => {
        const res = await request(gatedApp()).get('/mcp').expect(401)
        const header = res.headers['www-authenticate']
        expect(header).toContain('Bearer')
        expect(header).toContain(
            `resource_metadata="https://bad-mcp.example.com${WELL_KNOWN}/mcp"`,
        )
    })

    it('includes a machine-readable error code', async () => {
        const res = await request(gatedApp()).get('/mcp').expect(401)
        expect(res.headers['www-authenticate']).toContain(
            'error="invalid_token"',
        )
    })

    it('still lets a valid MCP_API_KEY through unchanged', async () => {
        const res = await request(gatedApp())
            .get('/mcp')
            .set('Authorization', 'Bearer secret-key')
            .expect(200)
        expect(res.body).toEqual({ ok: true })
        expect(res.headers['www-authenticate']).toBeUndefined()
    })

    it('still accepts the X-Mcp-Api-Key second-factor form unchanged', async () => {
        await request(gatedApp())
            .get('/mcp')
            .set('X-Mcp-Api-Key', 'secret-key')
            .expect(200)
    })

    it('stays a no-op when MCP_API_KEY is unset', async () => {
        ;(config as any).security.mcpApiKey = undefined
        const app = express()
        app.use(mcpAuthMiddleware)
        app.get('/mcp', (_req, res) => res.json({ ok: true }))
        await request(app).get('/mcp').expect(200)
    })
})
