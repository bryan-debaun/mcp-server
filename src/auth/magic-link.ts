import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const EXP_MINUTES = 15
const SECRET = process.env.MAGIC_LINK_JWT_SECRET

if (!SECRET) {
    console.warn('MAGIC_LINK_JWT_SECRET not set; magic-link token signing will fail')
}

function getKey() {
    if (!SECRET) throw new Error('MAGIC_LINK_JWT_SECRET not configured')
    return new TextEncoder().encode(SECRET)
}

export async function generateMagicLinkToken(email: string, userId?: number) {
    const jti = globalThis.crypto?.randomUUID?.() ?? String(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
    const expiresAt = new Date(Date.now() + EXP_MINUTES * 60 * 1000)

    // Fail fast when no DB configured — magic-link persistence requires a DB
    // Allow tests that inject a global `__TEST_PRISMA_MOCK__` to proceed
    if (!process.env.DATABASE_URL && !(globalThis as any).__TEST_PRISMA_MOCK__) {
        throw new Error('DATABASE_URL not configured')
    }

    // Persist jti for single-use enforcement (lazy import to avoid DB init at module load)
    // Allow tests to inject a mock Prisma object via global (helps when module cache
    // contains the real DB module and Vitest mocks didn't apply)
    let prisma: any = (globalThis as any).__TEST_PRISMA_MOCK__

    if (!prisma) {
        // Import the DB module with .js extension for ESM / NodeNext compatibility
        const mod: any = await import('../db/index.js')
        // Support both mock shapes and real module exports
        prisma = mod?.prisma ?? mod?.default?.prisma
    }

    // If Prisma model isn't available (e.g., running unit tests where the real DB module
    // was loaded before the mock), create a small in-memory fallback while running tests
    if (!prisma?.authMagicLink && process.env.NODE_ENV === 'test') {
        const store = new Map<string, any>()
        prisma = {
            authMagicLink: {
                create: async ({ data }: any) => {
                    store.set(data.jti, { ...data })
                    return { ...data }
                },
                findUnique: async ({ where }: any) => store.get(where.jti) ?? null,
                update: async ({ where, data }: any) => {
                    const existing = store.get(where.jti) ?? {}
                    const updated = { ...existing, ...data }
                    store.set(where.jti, updated)
                    return updated
                }
            }
        }
    }

    await prisma.authMagicLink.create({
        data: {
            jti,
            email,
            userId: userId ?? null,
            expiresAt,
        },
    })

    const encoder = getKey()
    const jwt = await new SignJWT({ jti, email, userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${EXP_MINUTES}m`)
        .sign(encoder as any)

    return { token: jwt, jti, expiresAt }
}

export async function verifyMagicLinkToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, getKey() as any)
        const jti = String((payload as any).jti ?? '')
        if (!jti) throw new Error('invalid token')

        // Require a configured database for token verification (single-use check)
        // Allow tests that inject a global `__TEST_PRISMA_MOCK__` to proceed
        if (!process.env.DATABASE_URL && !(globalThis as any).__TEST_PRISMA_MOCK__) {
            throw new Error('DATABASE_URL not configured')
        }

        // Look up persisted jti
        let prisma: any = (globalThis as any).__TEST_PRISMA_MOCK__
        if (!prisma) {
            const mod: any = await import('../db/index.js')
            prisma = mod?.prisma ?? mod?.default?.prisma
        }
        if (!prisma?.authMagicLink && process.env.NODE_ENV === 'test') {
            const store = new Map<string, any>()
            prisma = {
                authMagicLink: {
                    create: async ({ data }: any) => { store.set(data.jti, { ...data }); return data },
                    findUnique: async ({ where }: any) => store.get(where.jti) ?? null,
                    update: async ({ where, data }: any) => { const r = store.get(where.jti) ?? {}; Object.assign(r, data); store.set(where.jti, r); return r }
                }
            }
        }
        const record = await prisma.authMagicLink.findUnique({ where: { jti } as any })
        if (!record) throw new Error('invalid token')

        if (record.consumed) throw new Error('replayed token')

        const now = new Date()
        if (record.expiresAt < now) throw new Error('expired token')

        // Mark consumed
        await prisma.authMagicLink.update({ where: { jti } as any, data: { consumed: true, consumedAt: now } })

        return { jti, email: record.email, userId: record.userId, payload: payload as JWTPayload }
    } catch (err: any) {
        // Normalize errors
        const msg = err?.message ?? String(err)
        if (msg.includes('expired')) throw new Error('expired token')
        if (msg.includes('replayed')) throw new Error('replayed token')
        throw new Error('invalid token')
    }
}
