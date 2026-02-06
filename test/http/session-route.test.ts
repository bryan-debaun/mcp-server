import request from 'supertest'
import { startHttpServer } from '../../src/http/server.js'
import { prisma } from '../../src/db/index.js'
import { SignJWT } from 'jose'
import { testConnection } from '../../src/db/index.js'

let server: any
beforeAll(async () => {
    const srv = await startHttpServer(0, '127.0.0.1')
    server = srv
    // Ensure DB is responsive before running tests that write to it
    await testConnection()
})

afterAll(async () => {
    try { await prisma.$disconnect() } catch (e) { /* noop */ }
    try { server.close() } catch (e) { /* noop */ }
})

function signToken(payload: any, opts?: { expiresIn?: string }) {
    const secret = process.env.SESSION_JWT_SECRET || 'test-secret'
    const encoder = new TextEncoder().encode(secret)
    const jwt = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    if (opts?.expiresIn) jwt.setExpirationTime(opts.expiresIn)
    return jwt.sign(encoder as any)
}

describe('GET /api/auth/session', () => {
    const origMcp = process.env.MCP_API_KEY
    beforeEach(() => { delete process.env.MCP_API_KEY })
    afterEach(() => { if (typeof origMcp === 'undefined') delete process.env.MCP_API_KEY; else process.env.MCP_API_KEY = origMcp })

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
