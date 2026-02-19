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
            // Start server and attempt to use the real DB. If testConnection fails
            // (e.g. local Postgres is not running), fall back to lightweight
            // in-memory Prisma stubs so the HTTP/session behavior can still be
            // exercised in CI/dev without a running DB.
            const srv = await startHttpServer(0, '127.0.0.1')
            server = srv

            try {
                await testConnection()
                // real DB available — proceed as normal
            } catch (err) {
                console.warn('testConnection failed — falling back to in-memory prisma stubs for session tests')

                // In-memory store used by the stubbed prisma methods below
                const roles: Record<string, any> = {}
                const usersById: Record<number, any> = {}
                const usersByEmail: Record<string, any> = {}
                let nextId = 1000

                // Stub role.upsert
                prisma.role.upsert = async ({ where, _update, create }: any) => {
                    const name = (where && where.name) || (create && create.name)
                    if (!name) throw new Error('role.upsert missing name')
                    if (!roles[name]) {
                        roles[name] = { id: Object.keys(roles).length + 1, name }
                    }
                    return roles[name]
                }

                // Stub profile.create
                prisma.profile.create = async ({ data }: any) => {
                    const id = nextId++
                    const user: any = {
                        id,
                        email: data.email,
                        roleId: data.roleId,
                        external_id: data.external_id,
                        isAdmin: data.isAdmin || false
                    }
                    usersById[id] = user
                    if (user.email) usersByEmail[user.email] = user
                    return user
                }

                // Stub profile.findUnique (supports lookups by id, external_id, or email)
                prisma.profile.findUnique = async ({ where, _include }: any) => {
                    if (where.id !== undefined) return usersById[Number(where.id)] ?? null
                    if (where.external_id) {
                        const u = Object.values(usersById).find((x: any) => x.external_id === where.external_id)
                        return u ?? null
                    }
                    if (where.email) return usersByEmail[where.email] ?? null
                    return null
                }
            }
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
            const user = await prisma.profile.create({ data: { email: `u1+${Date.now()}@example.com`, roleId: role.id } })

            process.env.SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET ?? 'test-secret'
            const token = await signToken({ sub: user.email, userId: user.id }, { expiresIn: '7d' })

            const res = await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            expect(res.status).toBe(200)
            expect(res.body).toMatchObject({ id: user.id, email: user.email, role: 'user', isAdmin: false })
        })

        it('returns user info for dev unsigned token (base64)', async () => {
            delete process.env.SESSION_JWT_SECRET
            const user = await prisma.profile.create({ data: { email: `u2+${Date.now()}@example.com` } })
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
            const user = await prisma.profile.create({ data: { email: `u3+${Date.now()}@example.com`, roleId: role.id } })
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
            const user = await prisma.profile.create({ data: { email: `rls+${Date.now()}@example.com` } })
            const token = Buffer.from(JSON.stringify({ sub: user.email, userId: user.id })).toString('base64')
            await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            const res = await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            expect(res.status).toBe(429)
        })

        it('lazy-provisions a local users row from Supabase when external_id present', async () => {
            // Configure Supabase admin access and stub network call (prefer new env var names)
            process.env.SUPABASE_SECRET_KEY = 'key'
            process.env.PUBLIC_SUPABASE_URL = 'https://supabase.example'
            const supabaseId = '33333333-4444-5555-6666-777777777777'
            const oldFetch = (global as any).fetch
                ; (global as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: supabaseId, email: 'lazy@example.com', user_metadata: { name: 'Lazy' } }) })

            // Avoid IP rate limiting in this test
            process.env.SESSION_RATE_LIMIT_PER_IP = '1000'

            // Sign a session token whose sub is the Supabase user id
            process.env.SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET ?? 'test-secret'
            const token = await signToken({ sub: supabaseId }, { expiresIn: '7d' })

            const res = await request(server).get('/api/auth/session').set('Cookie', `session=${token}`)
            expect(res.status).toBe(200)
            expect(res.body).toMatchObject({ email: 'lazy@example.com', external_id: supabaseId })

            delete process.env.SUPABASE_SECRET_KEY
            delete process.env.PUBLIC_SUPABASE_URL
                ; (global as any).fetch = oldFetch
        })
    })
}
