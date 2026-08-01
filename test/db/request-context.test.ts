import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import {
    beginDbContext,
    getDbContext,
    IDENTITY_REQUIRED_OPERATIONS,
    runWithDbContext,
    setDbContextClaims,
    TRUSTED_SERVICE_CONTEXT,
} from '../../src/db/request-context.js'
import { dbContextMiddleware } from '../../src/http/middleware/db-context.js'

describe('db request context', () => {
    it('is undefined outside any scope', () => {
        expect(getDbContext()).toBeUndefined()
    })

    it('exposes claims inside a scope and drops them after', async () => {
        await runWithDbContext({ role: 'admin' }, async () => {
            expect(getDbContext()?.role).toBe('admin')
        })
        expect(getDbContext()).toBeUndefined()
    })

    // The whole reason beginDbContext exists: TSOA resolves auth inside route
    // handling, so the scope has to be opened empty and filled in later.
    it('lets a later caller fill in a scope opened empty', async () => {
        await beginDbContext(async () => {
            expect(getDbContext()).toEqual({})
            setDbContextClaims({ role: 'admin', email: 'a@b.c' })
            expect(getDbContext()).toMatchObject({
                role: 'admin',
                email: 'a@b.c',
            })
        })
    })

    it('setDbContextClaims is a no-op outside a scope (never throws)', () => {
        expect(() => setDbContextClaims({ role: 'admin' })).not.toThrow()
        expect(getDbContext()).toBeUndefined()
    })

    it('keeps concurrent scopes isolated from each other', async () => {
        const seen: string[] = []
        await Promise.all([
            runWithDbContext({ role: 'admin' }, async () => {
                await new Promise((r) => setTimeout(r, 20))
                seen.push(`a:${getDbContext()?.role}`)
            }),
            runWithDbContext({ role: 'user' }, async () => {
                seen.push(`b:${getDbContext()?.role}`)
            }),
        ])
        expect(seen.sort()).toEqual(['a:admin', 'b:user'])
    })

    it('treats writes — and only writes — as identity-required', () => {
        for (const op of ['create', 'update', 'upsert', 'delete', 'deleteMany'])
            expect(IDENTITY_REQUIRED_OPERATIONS.has(op)).toBe(true)
        // Reads stay off the wrapped path so the hot catalog route keeps its
        // single round-trip.
        for (const op of ['findMany', 'findUnique', 'findFirst', 'count'])
            expect(IDENTITY_REQUIRED_OPERATIONS.has(op)).toBe(false)
    })

    it('trusted service context carries admin', () => {
        expect(TRUSTED_SERVICE_CONTEXT.role).toBe('admin')
    })
})

describe('dbContextMiddleware', () => {
    it('opens a scope that downstream handlers can fill and read', async () => {
        const app = express()
        app.use(dbContextMiddleware)
        app.get('/x', (_req, res) => {
            setDbContextClaims({ role: 'admin', email: 'x@y.z' })
            res.json({ ctx: getDbContext() })
        })
        const res = await request(app).get('/x').expect(200)
        expect(res.body.ctx).toMatchObject({ role: 'admin', email: 'x@y.z' })
    })

    it('survives an async boundary in the handler', async () => {
        const app = express()
        app.use(dbContextMiddleware)
        app.get('/x', async (_req, res) => {
            setDbContextClaims({ role: 'admin' })
            await new Promise((r) => setTimeout(r, 10))
            res.json({ role: getDbContext()?.role })
        })
        const res = await request(app).get('/x').expect(200)
        expect(res.body.role).toBe('admin')
    })

    it('does not bleed claims between requests', async () => {
        const app = express()
        app.use(dbContextMiddleware)
        app.get('/set', (_req, res) => {
            setDbContextClaims({ role: 'admin' })
            res.json({ ok: true })
        })
        app.get('/read', (_req, res) => res.json({ ctx: getDbContext() }))

        await request(app).get('/set').expect(200)
        const res = await request(app).get('/read').expect(200)
        // A fresh request must start empty — otherwise one admin call would
        // silently authorise every later caller on that connection.
        expect(res.body.ctx).toEqual({})
    })
})
