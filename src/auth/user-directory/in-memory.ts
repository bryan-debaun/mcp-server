import {
    type CreateUserInput,
    type DirectoryUser,
    UserAlreadyExistsError,
    type UserDirectory,
} from './types.js'

/**
 * In-memory `UserDirectory` for tests.
 *
 * This is the second *genuine* implementation that makes the port honest rather
 * than speculative — an interface with one implementation is just indirection.
 * It also lets the seed script and anything built on the port be tested without
 * a network, a tenant, or credentials.
 *
 * Ids deliberately mimic Logto's shape: 12-character lowercase alphanumeric,
 * **not** UUIDs. A fake that hands out UUIDs would let UUID assumptions creep
 * back in unnoticed — which is exactly the defect #151 fixed.
 */
export class InMemoryDirectory implements UserDirectory {
    private readonly users = new Map<string, DirectoryUser>()
    private readonly roles = new Map<string, Set<string>>()
    private counter = 0

    /** Deterministic, Logto-shaped ids so tests can assert on them. */
    private nextId(): string {
        this.counter += 1
        return `mem${String(this.counter).padStart(9, '0')}`
    }

    async createUser(input: CreateUserInput): Promise<DirectoryUser> {
        if (!input.username && !input.email) {
            throw new Error('createUser requires a username or an email')
        }
        const clash = [...this.users.values()].find(
            (u) =>
                (input.username && u.username === input.username) ||
                (input.email && u.email === input.email),
        )
        if (clash) {
            // Same TYPE Logto's adapter throws, so the seed script's idempotence
            // path is exercised identically here and against the real tenant.
            throw new UserAlreadyExistsError(
                (input.username ?? input.email) as string,
            )
        }

        const user: DirectoryUser = {
            id: this.nextId(),
            username: input.username,
            email: input.email,
            name: input.name,
        }
        this.users.set(user.id, user)
        return { ...user }
    }

    async deleteUser(id: string): Promise<void> {
        // Idempotent by contract — absence is not an error.
        this.users.delete(id)
        this.roles.delete(id)
    }

    async assignRole(userId: string, roleName: string): Promise<void> {
        if (!this.users.has(userId)) {
            throw new Error(`no such user: ${userId}`)
        }
        const set = this.roles.get(userId) ?? new Set<string>()
        set.add(roleName) // Set membership gives idempotence for free.
        this.roles.set(userId, set)
    }

    async findByExternalId(id: string): Promise<DirectoryUser | null> {
        const u = this.users.get(id)
        return u ? { ...u } : null
    }

    // ── Test affordances (not part of the port) ────────────────────────────

    /** Roles currently held by a user. */
    rolesOf(userId: string): string[] {
        return [...(this.roles.get(userId) ?? [])].sort()
    }

    /** Every user currently held. */
    list(): DirectoryUser[] {
        return [...this.users.values()].map((u) => ({ ...u }))
    }

    /** Find by username or email — used by the seed script's idempotence check. */
    findByHandle(handle: string): DirectoryUser | null {
        const u = [...this.users.values()].find(
            (x) => x.username === handle || x.email === handle,
        )
        return u ? { ...u } : null
    }
}
