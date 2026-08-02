import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { __resetAuthCaches, jwtMiddleware } from '../../src/auth/jwt.js'
import { requireAdmin } from '../../src/auth/requireAdmin.js'
import { LogtoDirectory } from '../../src/auth/user-directory/logto.js'
import {
    cleanupOrphanedTestUsers,
    newRunId,
    seedTestUser,
} from '../../src/auth/user-directory/seed.js'
import { config } from '../../src/config.js'
import { prisma } from '../../src/db/index.js'

const RUN = process.env.RUN_LOGTO_INTEGRATION === 'true'

/**
 * End-to-end against the real Logto tenant (#154).
 *
 * Provisions a user, gives it the admin role, mints a token for it with no
 * browser, and drives that token through **our actual auth stack** —
 * `jwtMiddleware` → `verifyAccessToken` (real JWKS) → `resolveAppRole` →
 * `requireAdmin`. Then tears the user down.
 *
 * This is the acceptance criterion "an authenticated E2E test runs green
 * against a provisioned user". It is a vitest integration test rather than
 * Playwright because this repo has no browser surface — `mcp-server` is an API.
 * The browser-level equivalent belongs in `bryandebaun.dev` (#126), and the
 * spike established it can use this same headless minting rather than
 * `storageState`.
 *
 * Gated on RUN_LOGTO_INTEGRATION so the default suite needs no tenant.
 */
const MCP_RESOURCE = 'https://bad-mcp.onrender.com/mcp'

describe('Logto user provisioning, end to end', () => {
    if (!RUN) {
        it.skip('skipped - requires RUN_LOGTO_INTEGRATION=true', () => {})
        return
    }

    let directory: LogtoDirectory
    let runId: string
    let userId: string | undefined

    const saved = {
        discoveryBase: config.auth.oidc.discoveryBase,
        issuer: config.auth.oidc.issuer,
        audience: config.auth.oidc.audience,
        jwksFromEnv: config.auth.oidc.jwksUrlFromEnv,
        issuerFromEnv: config.auth.oidc.issuerFromEnv,
        roleClaimPaths: config.auth.oidc.roleClaimPaths,
    }

    beforeAll(async () => {
        directory = LogtoDirectory.fromConfig()
        runId = newRunId()

        // Point verification at Logto via discovery — exactly the Stage 2
        // configuration, and no code change, which is what #150 bought.
        config.auth.oidc.discoveryBase = config.logto.issuer
        config.auth.oidc.jwksUrlFromEnv = false
        config.auth.oidc.issuerFromEnv = false
        config.auth.oidc.audience = MCP_RESOURCE
        config.auth.oidc.roleClaimPaths = ['scope']
        __resetAuthCaches()

        // No database in this test: identity comes entirely from the token, so
        // the Profile lookup must never be what grants admin.
        ;(prisma as any).profile = {
            findMany: async () => [],
            findUnique: async () => null,
        }
    })

    afterAll(async () => {
        if (userId) await directory.deleteUser(userId)
        Object.assign(config.auth.oidc, {
            discoveryBase: saved.discoveryBase,
            issuer: saved.issuer,
            audience: saved.audience,
            jwksUrlFromEnv: saved.jwksFromEnv,
            issuerFromEnv: saved.issuerFromEnv,
            roleClaimPaths: saved.roleClaimPaths,
        })
        __resetAuthCaches()
    })

    it('provisions a roled test user', async () => {
        const user = await seedTestUser(directory, { runId, role: 'admin' })
        userId = user.id

        expect(user.created).toBe(true)
        expect(user.username).toBe(`test_${runId}`)
        // Opaque, non-UUID — the #151 premise, confirmed against the real API.
        expect(user.id).not.toMatch(/^[0-9a-fA-F-]{36}$/)

        const found = await directory.findByExternalId(user.id)
        expect(found?.id).toBe(user.id)
    })

    it('re-seeding the same runId is safe', async () => {
        const again = await seedTestUser(directory, { runId, role: 'admin' })
        expect(again.created).toBe(false)
        expect(again.id).toBe(userId)
    })

    // The acceptance criterion.
    it('grants admin through the real auth stack using a minted token', async () => {
        const token = await directory.mintUserToken({
            userId: userId as string,
            resource: MCP_RESOURCE,
            scope: 'admin',
        })

        const app = express()
        app.get('/admin', jwtMiddleware, requireAdmin, (req, res) =>
            res.json({ ok: true, user: (req as any).user }),
        )

        const res = await request(app)
            .get('/admin')
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.user.isAdmin).toBe(true)
        expect(res.body.user.role).toBe('admin')
        // Identity is the Logto subject, not an email — Logto resource tokens
        // carry no email claim, so `(issuer, externalId)` is the only path.
        expect(res.body.user.sub).toBe(userId)
    })

    it('rejects a token minted without the admin scope', async () => {
        const token = await directory.mintUserToken({
            userId: userId as string,
            resource: MCP_RESOURCE,
        })

        const app = express()
        app.get('/admin', jwtMiddleware, requireAdmin, (_req, res) =>
            res.json({ ok: true }),
        )

        const res = await request(app)
            .get('/admin')
            .set('Authorization', `Bearer ${token}`)

        // Authenticated but not authorized — and with no Profile to fall back
        // on, this is precisely the `unresolvedSubject` path from #151.
        expect(res.status).toBe(403)
    })

    it('tears the user down, and teardown is idempotent', async () => {
        await directory.deleteUser(userId as string)
        expect(await directory.findByExternalId(userId as string)).toBeNull()
        await expect(
            directory.deleteUser(userId as string),
        ).resolves.toBeUndefined()
        userId = undefined
    })

    it('leaves no orphaned test users behind', async () => {
        const remaining = await cleanupOrphanedTestUsers(directory, {
            dryRun: true,
        })
        expect(remaining.map((u) => u.username)).not.toContain(`test_${runId}`)
    })
})
