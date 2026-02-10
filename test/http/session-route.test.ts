import request from 'supertest'
import { startHttpServer } from '../../src/http/server.js'
import { prisma } from '../../src/db/index.js'
import { SignJWT } from 'jose'
import { testConnection } from '../../src/db/index.js'

let server: any


function signToken(payload: any, opts?: { expiresIn?: string }) {
    const secret = process.env.SESSION_JWT_SECRET || 'test-secret'
    const encoder = new TextEncoder().encode(secret)
    const jwt = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    if (opts?.expiresIn) jwt.setExpirationTime(opts.expiresIn)
    return jwt.sign(encoder as any)
}

// Skip this DB-dependent suite when DATABASE_URL or Prisma client is not available
const shouldRunDbTests = (() => {
    // Developer convenience: if DATABASE_URL isn't set in the environment, try
    // to load a local `.env.local` file (this mirrors common local-dev setups).
    if (!process.env.DATABASE_URL) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const dotenv = require('dotenv')
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const path = require('path')
            dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })
        } catch (e) { /* noop - we'll skip tests if env still missing */ }
    }

    if (!process.env.DATABASE_URL) return false
    try {
        // Try requiring the Prisma package synchronously. If the generated client
        // (inside .prisma/client) is missing this will throw and we'll skip the
        // DB-dependent tests instead of letting initPrisma throw inside beforeAll.
        // Use require rather than require.resolve so we observe any runtime errors
        // thrown while loading the package (e.g., missing generated client files).
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require('@prisma/client')
        if (!pkg || typeof pkg.PrismaClient !== 'function') {
            console.warn('Skipping session-route tests: @prisma/client does not export PrismaClient')
            return false
        }
        return true
    } catch (e) {
        console.warn('Skipping session-route tests: @prisma/client failed to load (generated client may be missing)')
        return false
    }
})()

if (!shouldRunDbTests) {
    describe.skip('GET /api/auth/session', () => {
        console.warn('Skipping session-route tests because the DB or Prisma client is not available')
    })
} else {
    describe('GET /api/auth/session', () => {
        const origMcp = process.env.MCP_API_KEY
        beforeEach(() => { delete process.env.MCP_API_KEY })
        afterEach(() => { if (typeof origMcp === 'undefined') delete process.env.MCP_API_KEY; else process.env.MCP_API_KEY = origMcp })

        beforeAll(async () => {
            // Start server and ensure DB is responsive before running tests that write to it
            const srv = await startHttpServer(0, '127.0.0.1')
            server = srv
            await testConnection()
        })

        afterAll(async () => {
            try { await prisma.$disconnect() } catch (e) { /* noop */ }
            try { server.close() } catch (e) { /* noop */ }
        })

        it('returns 401 when cookie missing', async () => {
            const res = await request(server).get('/api/auth/session')
            expect(res.status).toBe(401)
        })

        it('returns user info for signed token', async () => {
            // create role and user (use upsert to avoid unique constraint when seeded)
            const role = await prisma.role.upsert({ where: { name: 'user' }, update: {}, create: { name: 'user' } })
            const user = await prisma.user.create({ data: { email: `u1+${Date.now()}@example.com`, roleId: role.id } })

            process.env.SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET ?? 'test-secret'
            const token = await signToken({ sub: user.email, userId: user.id }, { expiresIn: '7d' })

            const res = await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            expect(res.status).toBe(200)
            expect(res.body).toMatchObject({ id: user.id, email: user.email, role: 'user', isAdmin: false })
        })

        it('returns user info for dev unsigned token (base64)', async () => {
            delete process.env.SESSION_JWT_SECRET
            const user = await prisma.user.create({ data: { email: `u2+${Date.now()}@example.com` } })
            const token = Buffer.from(JSON.stringify({ sub: user.email, userId: user.id })).toString('base64')
            const res = await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            expect(res.status).toBe(200)
            expect(res.body).toMatchObject({ id: user.id, email: user.email })
        })

        it('returns 401 for invalid token', async () => {
            process.env.SESSION_JWT_SECRET = 'another-secret'
            const res = await request(server).get('/api/auth/session').set('Cookie', `session=not-a-token`)
            expect(res.status).toBe(401)
        })

        it('returns 401 for expired token', async () => {
            process.env.SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET ?? 'test-secret'
            const role = await prisma.role.upsert({ where: { name: 'user2' }, update: {}, create: { name: 'user2' } })
            const user = await prisma.user.create({ data: { email: `u3+${Date.now()}@example.com`, roleId: role.id } })
            // sign an already-expired token
            const secret = process.env.SESSION_JWT_SECRET
            const encoder = new TextEncoder().encode(secret)
            const token = await new SignJWT({ sub: user.email, userId: user.id }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) - 10).sign(encoder as any)
            const res = await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            expect(res.status).toBe(401)
        })

        it('rate limits per IP', async () => {
            // Set a low limit for test
            process.env.SESSION_RATE_LIMIT_PER_IP = '2'
            delete process.env.SESSION_JWT_SECRET
            const user = await prisma.user.create({ data: { email: `rls+${Date.now()}@example.com` } })
            const token = Buffer.from(JSON.stringify({ sub: user.email, userId: user.id })).toString('base64')
            await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            const res = await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            expect(res.status).toBe(429)
        })
    })
}
