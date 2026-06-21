import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { auditAdminCatalogMutations } from '../../src/http/middleware/audit'
import { logger } from '../../src/logger'

type AuditCtx = Record<string, any>

let infoSpy: ReturnType<typeof vi.spyOn>
let breadcrumbSpy: ReturnType<typeof vi.spyOn>

const auditEntries = (): AuditCtx[] =>
    infoSpy.mock.calls
        .map((c) => c[0] as AuditCtx)
        .filter((ctx) => ctx?.audit === true)

const DEFAULT_USER = { sub: 'user-123', email: 'admin@example.com' }

function makeApp(user: unknown = DEFAULT_USER) {
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
        if (user) (req as any).user = user
        next()
    })
    app.use(auditAdminCatalogMutations)

    app.post('/api/books', (req, res) => {
        if ((req.body as any)?.fail) {
            return res.status(400).json({ error: 'bad request' })
        }
        res.status(201).json({ id: 42, title: (req.body as any)?.title })
    })
    app.put('/api/authors/:id', (_req, res) => res.json({ id: 7 }))
    app.delete('/api/movies/:id', (_req, res) =>
        res.status(200).json({ success: true }),
    )
    app.get('/api/books', (_req, res) => res.json({ books: [] }))
    app.post('/api/admin/spotify/oauth-callback', (_req, res) =>
        res.status(200).json({ ok: true }),
    )
    return app
}

describe('auditAdminCatalogMutations (#37 — admin catalog audit logging)', () => {
    beforeEach(() => {
        infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
        breadcrumbSpy = vi
            .spyOn(logger, 'breadcrumb')
            .mockImplementation(() => {})
    })
    afterEach(() => {
        infoSpy.mockRestore()
        breadcrumbSpy.mockRestore()
    })

    it('logs a create with the id captured from the response body', async () => {
        await request(makeApp())
            .post('/api/books')
            .send({ title: 'Dune' })
            .expect(201)

        const entries = auditEntries()
        expect(entries).toHaveLength(1)
        expect(entries[0]).toMatchObject({
            audit: true,
            action: 'create',
            entityType: 'book',
            entityId: 42,
            actor: { sub: 'user-123', email: 'admin@example.com' },
            status: 201,
        })
    })

    it('logs an update with the id taken from the path', async () => {
        await request(makeApp())
            .put('/api/authors/7')
            .send({ name: 'x' })
            .expect(200)
        const entries = auditEntries()
        expect(entries).toHaveLength(1)
        expect(entries[0]).toMatchObject({
            action: 'update',
            entityType: 'author',
            entityId: '7',
        })
    })

    it('logs a delete with the id taken from the path', async () => {
        await request(makeApp()).delete('/api/movies/9').expect(200)
        expect(auditEntries()[0]).toMatchObject({
            action: 'delete',
            entityType: 'movie',
            entityId: '9',
        })
    })

    it('does not log reads (GET)', async () => {
        await request(makeApp()).get('/api/books').expect(200)
        expect(auditEntries()).toHaveLength(0)
    })

    it('does not log failed mutations (4xx)', async () => {
        await request(makeApp())
            .post('/api/books')
            .send({ fail: true })
            .expect(400)
        expect(auditEntries()).toHaveLength(0)
    })

    it('does not log non-catalog routes', async () => {
        await request(makeApp())
            .post('/api/admin/spotify/oauth-callback')
            .expect(200)
        expect(auditEntries()).toHaveLength(0)
    })

    it('never logs request-body content (no PII/secrets beyond actor)', async () => {
        await request(makeApp())
            .post('/api/books')
            .send({ title: 'Sensitive Working Title' })
            .expect(201)

        const ctx = auditEntries()[0]
        expect(ctx).not.toHaveProperty('title')
        expect(JSON.stringify(ctx)).not.toContain('Sensitive Working Title')
    })

    it('passes through an incoming X-Request-Id, else generates one', async () => {
        await request(makeApp())
            .post('/api/books')
            .set('X-Request-Id', 'req-abc-123')
            .send({ title: 'x' })
            .expect(201)
        expect(auditEntries()[0].requestId).toBe('req-abc-123')

        infoSpy.mockClear()
        await request(makeApp()).delete('/api/movies/9').expect(200)
        // Generated fallback is a non-empty string (UUID).
        expect(typeof auditEntries()[0].requestId).toBe('string')
        expect(auditEntries()[0].requestId.length).toBeGreaterThan(0)
    })

    it('emits a Sentry breadcrumb for a successful mutation, but not for reads', async () => {
        const app = makeApp()
        await request(app).post('/api/books').send({ title: 'x' }).expect(201)
        expect(breadcrumbSpy).toHaveBeenCalledTimes(1)
        expect(breadcrumbSpy.mock.calls[0][0]).toMatchObject({
            category: 'audit',
            level: 'info',
            data: { action: 'create', entityType: 'book' },
        })

        breadcrumbSpy.mockClear()
        await request(app).get('/api/books').expect(200)
        expect(breadcrumbSpy).not.toHaveBeenCalled()
    })

    it('flags service-role actors', async () => {
        await request(makeApp({ sub: 'service', service: true }))
            .delete('/api/movies/9')
            .expect(200)
        expect(auditEntries()[0].actor).toMatchObject({
            sub: 'service',
            service: true,
        })
    })
})
