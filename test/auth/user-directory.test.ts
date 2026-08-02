import { describe, expect, it } from 'vitest'
import { InMemoryDirectory } from '../../src/auth/user-directory/in-memory.js'
import {
    cleanupOrphanedTestUsers,
    findTestUserByRunId,
    newRunId,
    seedTestUser,
    teardownTestUser,
} from '../../src/auth/user-directory/seed.js'
import {
    isTestUser,
    testEmail,
    testUsername,
    UserAlreadyExistsError,
} from '../../src/auth/user-directory/types.js'

describe('InMemoryDirectory', () => {
    it('creates a user and returns an opaque, non-UUID id', async () => {
        const d = new InMemoryDirectory()
        const u = await d.createUser({ username: 'alice' })
        expect(u.id).toBeTruthy()
        // The fake mimics Logto's shape on purpose: a UUID-issuing fake would
        // let UUID assumptions creep back in — the exact defect #151 fixed.
        expect(u.id).not.toMatch(/^[0-9a-fA-F-]{36}$/)
        expect(u.username).toBe('alice')
    })

    it('rejects a create with neither username nor email', async () => {
        const d = new InMemoryDirectory()
        await expect(d.createUser({})).rejects.toThrow(/username or an email/i)
    })

    // Asserts the TYPE, not the message. The first version of this test checked
    // for /already exists/i, which the fake satisfied and Logto did not — it
    // says "username_already_in_use". The fake agreed with the code while
    // reality disagreed with both, and only the integration test caught it.
    it('rejects duplicates with the typed error the port promises', async () => {
        const d = new InMemoryDirectory()
        await d.createUser({ username: 'bob' })
        await expect(d.createUser({ username: 'bob' })).rejects.toBeInstanceOf(
            UserAlreadyExistsError,
        )
    })

    it('treats a duplicate email as a conflict too', async () => {
        const d = new InMemoryDirectory()
        await d.createUser({ username: 'a', email: 'x@y.z' })
        await expect(
            d.createUser({ username: 'b', email: 'x@y.z' }),
        ).rejects.toBeInstanceOf(UserAlreadyExistsError)
    })

    it('finds by external id and returns null for absent ones', async () => {
        const d = new InMemoryDirectory()
        const u = await d.createUser({ username: 'carol' })
        expect(await d.findByExternalId(u.id)).toMatchObject({
            username: 'carol',
        })
        expect(await d.findByExternalId('nope')).toBeNull()
    })

    // Contract: absence is not an error. Teardown after a partial failure must
    // not itself fail.
    it('deleteUser is idempotent', async () => {
        const d = new InMemoryDirectory()
        const u = await d.createUser({ username: 'dave' })
        await d.deleteUser(u.id)
        await expect(d.deleteUser(u.id)).resolves.toBeUndefined()
        expect(await d.findByExternalId(u.id)).toBeNull()
    })

    it('assignRole is idempotent and rejects unknown users', async () => {
        const d = new InMemoryDirectory()
        const u = await d.createUser({ username: 'erin' })
        await d.assignRole(u.id, 'admin')
        await d.assignRole(u.id, 'admin')
        expect(d.rolesOf(u.id)).toEqual(['admin'])
        await expect(d.assignRole('ghost', 'admin')).rejects.toThrow(
            /no such user/i,
        )
    })

    it('returns copies, so callers cannot mutate internal state', async () => {
        const d = new InMemoryDirectory()
        const u = await d.createUser({ username: 'frank' })
        u.username = 'tampered'
        expect((await d.findByExternalId(u.id))?.username).toBe('frank')
    })
})

describe('test-user namespacing', () => {
    it('builds namespaced handles', () => {
        expect(testUsername('abc123')).toBe('test_abc123')
        expect(testEmail('abc123')).toBe('test+abc123@bad-mcp.test')
    })

    it('recognises test users by either handle', () => {
        expect(isTestUser({ id: '1', username: 'test_x' })).toBe(true)
        expect(isTestUser({ id: '1', email: 'test+x@bad-mcp.test' })).toBe(true)
    })

    // The safety property that makes unattended cleanup acceptable: a real
    // account can never match the namespace.
    it('does not mistake a real account for a test user', () => {
        expect(
            isTestUser({
                id: '1',
                username: 'bryan',
                email: 'brn.dbn@gmail.com',
            }),
        ).toBe(false)
        expect(isTestUser({ id: '1', email: 'contest+x@example.com' })).toBe(
            false,
        )
    })

    it('generates distinct run ids', () => {
        expect(newRunId()).not.toBe(newRunId())
    })
})

describe('seedTestUser', () => {
    it('creates a roled user', async () => {
        const d = new InMemoryDirectory()
        const runId = 'run001'
        const u = await seedTestUser(d, { runId, role: 'admin' })
        expect(u.created).toBe(true)
        expect(u.username).toBe('test_run001')
        expect(u.password).toBeTruthy()
        expect(d.rolesOf(u.id)).toEqual(['admin'])
    })

    // The acceptance criterion: running it twice is safe.
    it('is idempotent — a second run returns the same user, not an error', async () => {
        const d = new InMemoryDirectory()
        const runId = 'run002'
        const first = await seedTestUser(d, { runId, role: 'admin' })
        const second = await seedTestUser(d, { runId, role: 'admin' })

        expect(second.created).toBe(false)
        expect(second.id).toBe(first.id)
        expect(d.list()).toHaveLength(1)
        // No password is returned the second time — we don't know the original,
        // and inventing one would be worse than admitting that.
        expect(second.password).toBeUndefined()
        expect(d.rolesOf(second.id)).toEqual(['admin'])
    })

    // A duplicate is expected on re-run; anything else is real and must surface.
    it('propagates non-duplicate failures instead of swallowing them', async () => {
        const d = new InMemoryDirectory()
        const boom = Object.assign(Object.create(Object.getPrototypeOf(d)), d, {
            createUser: async () => {
                throw new Error('tenant unreachable')
            },
        })
        await expect(seedTestUser(boom, { runId: 'run003' })).rejects.toThrow(
            /tenant unreachable/,
        )
    })

    it('finds a seeded user by run id', async () => {
        const d = new InMemoryDirectory()
        await seedTestUser(d, { runId: 'run004' })
        expect(await findTestUserByRunId(d, 'run004')).toMatchObject({
            username: 'test_run004',
        })
        expect(await findTestUserByRunId(d, 'absent')).toBeNull()
    })
})

describe('teardown and orphan cleanup', () => {
    it('tears down a seeded user and tolerates undefined', async () => {
        const d = new InMemoryDirectory()
        const u = await seedTestUser(d, { runId: 'run005' })
        await teardownTestUser(d, u.id)
        expect(d.list()).toHaveLength(0)
        await expect(teardownTestUser(d, undefined)).resolves.toBeUndefined()
    })

    // Why the namespace exists: a crashed run leaks users into a shared tenant.
    it('removes orphans from earlier runs but never real accounts', async () => {
        const d = new InMemoryDirectory()
        await seedTestUser(d, { runId: 'old1' })
        await seedTestUser(d, { runId: 'old2' })
        await d.createUser({ username: 'bryan', email: 'brn.dbn@gmail.com' })

        const removed = await cleanupOrphanedTestUsers(d)

        expect(removed.map((u) => u.username).sort()).toEqual([
            'test_old1',
            'test_old2',
        ])
        expect(d.list().map((u) => u.username)).toEqual(['bryan'])
    })

    it('keeps the current run when asked', async () => {
        const d = new InMemoryDirectory()
        await seedTestUser(d, { runId: 'old' })
        const keep = await seedTestUser(d, { runId: 'current' })

        const removed = await cleanupOrphanedTestUsers(d, {
            keepRunId: 'current',
        })

        expect(removed.map((u) => u.username)).toEqual(['test_old'])
        expect(await d.findByExternalId(keep.id)).not.toBeNull()
    })

    it('dryRun reports without deleting', async () => {
        const d = new InMemoryDirectory()
        await seedTestUser(d, { runId: 'old' })
        const would = await cleanupOrphanedTestUsers(d, { dryRun: true })
        expect(would).toHaveLength(1)
        expect(d.list()).toHaveLength(1)
    })
})
