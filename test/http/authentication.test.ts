import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the auth module so we can drive verification/role-resolution outcomes
// without real JWKS/JWTs. authentication.ts imports these named exports.
vi.mock('../../src/auth/jwt.js', () => ({
    verifySupabaseJwt: vi.fn(),
    resolveAppRole: vi.fn(),
}))

// Mock config so the api_key gate's MCP_API_KEY can be toggled per test without
// touching process.env (config is a validated singleton loaded at import time).
vi.mock('../../src/config.js', () => ({
    config: { security: { mcpApiKey: undefined as string | undefined } },
}))

import { resolveAppRole, verifySupabaseJwt } from '../../src/auth/jwt.js'
import { config } from '../../src/config.js'
import { expressAuthentication } from '../../src/http/authentication'

const mockVerify = verifySupabaseJwt as unknown as ReturnType<typeof vi.fn>
const mockResolve = resolveAppRole as unknown as ReturnType<typeof vi.fn>

const setMcpKey = (key: string | undefined) => {
    ;(config as any).security.mcpApiKey = key
}

const reqWith = (authorization?: string) =>
    ({ headers: authorization ? { authorization } : {} }) as any

const reqWithHeaders = (headers: Record<string, string>) => ({ headers }) as any

describe('expressAuthentication (#117 — clean 401/403 instead of "internal error")', () => {
    beforeEach(() => {
        mockVerify.mockReset()
        mockResolve.mockReset()
    })

    it('throws a 401 with a clean message when no token is provided', async () => {
        await expect(
            expressAuthentication(reqWith(), 'jwt'),
        ).rejects.toMatchObject({
            status: 401,
            message: 'No token provided',
        })
    })

    it('throws a 401 with a clean message (no jose internals) when verification fails', async () => {
        mockVerify.mockRejectedValueOnce(
            new Error('JWKS fetch failed: 404 Not Found'),
        )

        await expect(
            expressAuthentication(reqWith('Bearer bogus'), 'jwt', ['admin']),
        ).rejects.toMatchObject({
            status: 401,
            message: 'Invalid or expired token',
        })
    })

    it('throws a 403 when the token lacks the required scope', async () => {
        mockVerify.mockResolvedValueOnce({ sub: 'u1', role: 'authenticated' })
        mockResolve.mockResolvedValueOnce({ role: 'user', isAdmin: false })

        await expect(
            expressAuthentication(reqWith('Bearer ok'), 'jwt', ['admin']),
        ).rejects.toMatchObject({
            status: 403,
            message: 'Insufficient permissions',
        })
    })

    it('resolves the user for a valid admin token (app_metadata path)', async () => {
        mockVerify.mockResolvedValueOnce({ sub: 'u1' })
        mockResolve.mockResolvedValueOnce({ role: 'admin', isAdmin: true })

        const user = await expressAuthentication(reqWith('Bearer ok'), 'jwt', [
            'admin',
        ])
        expect(user).toMatchObject({ role: 'admin', isAdmin: true })
    })

    it('rejects an unknown security scheme', async () => {
        await expect(
            expressAuthentication(reqWith('Bearer x'), 'oauth2'),
        ).rejects.toThrow(/Unknown security name/)
    })
})

describe('expressAuthentication api_key (#117 — spec matches deployment for reads)', () => {
    beforeEach(() => {
        setMcpKey(undefined)
    })

    it('passes through (open) when MCP_API_KEY is unset — keeps CI / no-DB green', async () => {
        await expect(
            expressAuthentication(reqWith(), 'api_key'),
        ).resolves.toBeUndefined()
    })

    it('accepts the gateway key via the X-Mcp-Api-Key header', async () => {
        setMcpKey('secret-key')
        await expect(
            expressAuthentication(
                reqWithHeaders({ 'x-mcp-api-key': 'secret-key' }),
                'api_key',
            ),
        ).resolves.toMatchObject({ apiKey: true })
    })

    it('accepts the gateway key via Authorization: Bearer', async () => {
        setMcpKey('secret-key')
        await expect(
            expressAuthentication(reqWith('Bearer secret-key'), 'api_key'),
        ).resolves.toMatchObject({ apiKey: true })
    })

    it('rejects a missing key with a clean 401 when MCP_API_KEY is set', async () => {
        setMcpKey('secret-key')
        await expect(
            expressAuthentication(reqWith(), 'api_key'),
        ).rejects.toMatchObject({ status: 401, message: 'Unauthorized' })
    })

    it('rejects a wrong key with a clean 401 (no internal error)', async () => {
        setMcpKey('secret-key')
        await expect(
            expressAuthentication(reqWith('Bearer wrong'), 'api_key'),
        ).rejects.toMatchObject({ status: 401, message: 'Unauthorized' })
    })
})
