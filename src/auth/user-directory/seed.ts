import { randomBytes } from 'node:crypto'
import { logger } from '../../logger.js'
import {
    type DirectoryUser,
    isTestUser,
    testEmail,
    testUsername,
    UserAlreadyExistsError,
    type UserDirectory,
} from './types.js'

/**
 * Seed and tear down namespaced test users.
 *
 * Written against the `UserDirectory` port rather than Logto directly, so the
 * whole thing is testable with `InMemoryDirectory` — no tenant, no network, no
 * credentials. That is the payoff for the port existing at all.
 *
 * ADR 0001: this runs against a **shared hosted tenant**, not a clean local
 * database. So it cannot assume a fresh slate (hence idempotence) and a crashed
 * run must leave something identifiable behind (hence the namespace).
 */

export interface SeededUser extends DirectoryUser {
    /** The generated password, when one was set. Never logged. */
    password?: string
    /** True when this run created the user; false when it already existed. */
    created: boolean
}

/** Short, filesystem- and email-safe run identifier. */
export function newRunId(): string {
    return randomBytes(5).toString('hex')
}

/** A password meeting Logto's complexity rules without being guessable. */
function generatePassword(): string {
    return `Aa1!${randomBytes(16).toString('base64url')}`
}

/**
 * Ensure a roled test user exists for `runId`.
 *
 * **Idempotent**: running it twice with the same `runId` returns the existing
 * user rather than failing on the duplicate. `assignRole` is idempotent by the
 * port's contract, so re-running re-asserts the role harmlessly.
 */
export async function seedTestUser(
    directory: UserDirectory,
    opts: { runId: string; role?: string; emailDomain?: string } = {
        runId: newRunId(),
    },
): Promise<SeededUser> {
    const username = testUsername(opts.runId)
    const email = testEmail(opts.runId, opts.emailDomain)
    const password = generatePassword()

    let user: DirectoryUser
    let created = true
    try {
        user = await directory.createUser({
            username,
            email,
            password,
            name: `Test user ${opts.runId}`,
        })
    } catch (err: unknown) {
        // A duplicate is the expected outcome of a re-run, not a failure. Any
        // other error is real and must propagate — swallowing everything here
        // would turn a broken tenant into a silently empty seed.
        //
        // Checked by TYPE, not by message. Matching on `/already exist/i` is
        // what the first version did, and it passed against the fake while
        // failing against Logto's "username_already_in_use".
        if (!(err instanceof UserAlreadyExistsError)) throw err

        const existing = await findTestUserByRunId(directory, opts.runId)
        if (!existing) throw err
        user = existing
        created = false
        logger.debug('seed: test user already present', { runId: opts.runId })
    }

    if (opts.role) await directory.assignRole(user.id, opts.role)

    return { ...user, password: created ? password : undefined, created }
}

/** Locate a run's user without knowing its id. */
export async function findTestUserByRunId(
    directory: UserDirectory,
    runId: string,
): Promise<DirectoryUser | null> {
    const users = await listAll(directory)
    const username = testUsername(runId)
    return (
        users.find(
            (u) => u.username === username || u.email?.includes(`+${runId}@`),
        ) ?? null
    )
}

/** Remove a run's user. Safe to call when nothing was created. */
export async function teardownTestUser(
    directory: UserDirectory,
    userId: string | undefined,
): Promise<void> {
    if (!userId) return
    await directory.deleteUser(userId)
}

/**
 * Delete test users left behind by earlier runs.
 *
 * The reason the namespace exists: a crashed run leaks a user into a shared
 * tenant, and without a way to recognise it later those accumulate forever.
 * Only touches users matching the test namespace — a real account can never
 * match, which is the safety property that makes this runnable unattended.
 */
export async function cleanupOrphanedTestUsers(
    directory: UserDirectory,
    opts: { keepRunId?: string; dryRun?: boolean } = {},
): Promise<DirectoryUser[]> {
    const users = await listAll(directory)
    const keepUsername = opts.keepRunId ? testUsername(opts.keepRunId) : null

    const orphans = users.filter(
        (u) => isTestUser(u) && u.username !== keepUsername,
    )

    if (!opts.dryRun) {
        for (const u of orphans) await directory.deleteUser(u.id)
    }
    return orphans
}

/**
 * List every user, via whichever affordance the implementation offers.
 *
 * Listing is deliberately absent from the port — it is not part of provisioning
 * and would push the interface toward being a general identity facade. Both
 * implementations expose it in their own way, so this narrows to that.
 */
async function listAll(directory: UserDirectory): Promise<DirectoryUser[]> {
    const anyDir = directory as unknown as {
        listUsers?: () => Promise<DirectoryUser[]>
        list?: () => DirectoryUser[]
    }
    if (typeof anyDir.listUsers === 'function') return anyDir.listUsers()
    if (typeof anyDir.list === 'function') return anyDir.list()
    throw new Error(
        'directory cannot enumerate users; cleanup and idempotence need listUsers()/list()',
    )
}
