/**
 * `UserDirectory` — the one identity abstraction ADR 0001 sanctions.
 *
 * The ADR explicitly rules out an `IIdentityProvider` wrapper over token
 * verification: OIDC discovery + JWKS + standard claims already *is* the
 * vendor-neutral interface, and wrapping it would re-abstract something already
 * abstract. **Provisioning is the exception**, because that is where lock-in
 * actually bites — `/api/users` is Logto's own shape, not a standard — and
 * because it has two genuine implementations rather than one plus a hypothetical.
 *
 * Deliberately four methods. It is a *directory*, not an identity facade: no
 * token minting, no session handling, no profile sync. Resist growing it —
 * `LogtoDirectory` may expose provider-specific extras beyond this contract for
 * callers that have knowingly opted into Logto (integration tests do), but those
 * do not belong on the port.
 */

/**
 * Thrown when a user with the same handle already exists.
 *
 * A **typed** error rather than a message convention on purpose. The seed
 * script's idempotence hinges on telling "already provisioned" apart from "the
 * tenant is broken", and the first version matched on `/already exist/i` —
 * which `InMemoryDirectory` satisfied and Logto did not (it says
 * `user.username_already_in_use`). The fake agreed with the code and reality
 * disagreed with both; only the integration test caught it. Implementations now
 * have to throw the same type, so the fake cannot drift from the contract.
 */
export class UserAlreadyExistsError extends Error {
    constructor(handle: string) {
        super(`user already exists: ${handle}`)
        this.name = 'UserAlreadyExistsError'
    }
}

/** A user as this codebase cares about it — deliberately not Logto's shape. */
export interface DirectoryUser {
    /**
     * The identity-provider subject. **Opaque** — Logto issues 12-character
     * lowercase alphanumeric ids, Supabase issues UUIDs, and nothing may assume
     * a shape. This is what lands in `Profile.externalId` (#151).
     */
    id: string
    username?: string
    email?: string
    name?: string
}

export interface CreateUserInput {
    username?: string
    email?: string
    /** Omit to create a user who cannot password-authenticate. */
    password?: string
    name?: string
}

/**
 * Provisioning operations. Every method is expected to throw on transport or
 * authorization failure — callers are scripts and tests that should fail loudly,
 * not degrade.
 */
export interface UserDirectory {
    createUser(input: CreateUserInput): Promise<DirectoryUser>

    /** Idempotent: deleting an already-absent user must not throw. */
    deleteUser(id: string): Promise<void>

    /** Idempotent: assigning an already-held role must not throw. */
    assignRole(userId: string, roleName: string): Promise<void>

    /** `null` when no such user exists — absence is not an error. */
    findByExternalId(id: string): Promise<DirectoryUser | null>
}

/**
 * Namespace for provisioned test users.
 *
 * ADR 0001 notes these run against a **shared hosted tenant**, not a clean local
 * database. Two consequences drive this prefix: a run cannot assume a fresh
 * slate, and an orphan left by a crashed run must be identifiable later. Both
 * are solved by making test users obviously test users.
 */
export const TEST_USER_PREFIX = 'test_'

/** `test_<runId>` — the username stem for one run's users. */
export function testUsername(runId: string, suffix = ''): string {
    return `${TEST_USER_PREFIX}${runId}${suffix}`
}

/** `test+<runId>@…` — the email form the issue specifies. */
export function testEmail(runId: string, domain = 'bad-mcp.test'): string {
    return `test+${runId}@${domain}`
}

/** True for anything this project provisioned as a test user. */
export function isTestUser(user: DirectoryUser): boolean {
    return (
        String(user.username ?? '').startsWith(TEST_USER_PREFIX) ||
        String(user.email ?? '').startsWith('test+')
    )
}
