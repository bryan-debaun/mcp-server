import { config } from '../../config.js'
import { logger } from '../../logger.js'
import {
    type CreateUserInput,
    type DirectoryUser,
    UserAlreadyExistsError,
    type UserDirectory,
} from './types.js'

interface LogtoUser {
    id: string
    username?: string | null
    primaryEmail?: string | null
    name?: string | null
}

const toDirectoryUser = (u: LogtoUser): DirectoryUser => ({
    id: u.id,
    username: u.username ?? undefined,
    email: u.primaryEmail ?? undefined,
    name: u.name ?? undefined,
})

/**
 * `UserDirectory` backed by Logto's Management API.
 *
 * Reached by a machine-to-machine app holding the built-in "Logto Management API
 * access" role, via a `client_credentials` grant. Every mechanism here was
 * verified against the live tenant during the #153 spike rather than taken from
 * documentation.
 */
export class LogtoDirectory implements UserDirectory {
    private cachedToken?: { value: string; expiresAt: number }

    constructor(
        private readonly opts: {
            issuer: string
            managementApi: string
            clientId: string
            clientSecret: string
        },
    ) {}

    /** Build from config; throws with a specific message when unconfigured. */
    static fromConfig(): LogtoDirectory {
        const c = config.logto
        if (!c.enabled || !c.issuer || !c.managementApi) {
            throw new Error(
                'Logto is not configured. Set LOGTO_TENANT_ID, LOGTO_M2M_CLIENT_ID and LOGTO_M2M_CLIENT_SECRET.',
            )
        }
        return new LogtoDirectory({
            issuer: c.issuer,
            managementApi: c.managementApi,
            clientId: c.m2mClientId as string,
            clientSecret: c.m2mClientSecret as string,
        })
    }

    /**
     * Management API access token, cached until shortly before expiry.
     *
     * Tokens last an hour; the 60s margin avoids handing out one that expires
     * mid-flight. Cheap, and it keeps a seed run from minting a token per call.
     */
    private async token(): Promise<string> {
        if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
            return this.cachedToken.value
        }

        const basic = Buffer.from(
            `${this.opts.clientId}:${this.opts.clientSecret}`,
        ).toString('base64')

        const res = await fetch(`${this.opts.issuer}/token`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${basic}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                resource: this.opts.managementApi,
                scope: 'all',
            }),
        })
        if (!res.ok) {
            throw new Error(
                `Logto token request failed (${res.status}): ${await res.text()}`,
            )
        }
        const json = (await res.json()) as {
            access_token: string
            expires_in: number
        }
        this.cachedToken = {
            value: json.access_token,
            expiresAt: Date.now() + (json.expires_in - 60) * 1000,
        }
        return json.access_token
    }

    private async request<T>(
        path: string,
        init: RequestInit = {},
    ): Promise<{ status: number; body: T | undefined }> {
        const res = await fetch(`${this.opts.managementApi}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${await this.token()}`,
                'Content-Type': 'application/json',
                ...(init.headers ?? {}),
            },
        })
        // 204 (and any empty body) must not be fed to JSON.parse.
        const text = await res.text()
        const body = text ? (JSON.parse(text) as T) : undefined
        return { status: res.status, body }
    }

    private async requireOk<T>(
        path: string,
        init: RequestInit,
        what: string,
    ): Promise<T> {
        const { status, body } = await this.request<T>(path, init)
        if (status >= 400) {
            throw new Error(
                `Logto ${what} failed (${status}): ${JSON.stringify(body)}`,
            )
        }
        return body as T
    }

    async createUser(input: CreateUserInput): Promise<DirectoryUser> {
        if (!input.username && !input.email) {
            throw new Error('createUser requires a username or an email')
        }
        const { status, body } = await this.request<
            LogtoUser & { code?: string }
        >('/users', {
            method: 'POST',
            body: JSON.stringify({
                username: input.username,
                primaryEmail: input.email,
                password: input.password,
                name: input.name,
            }),
        })

        // Logto reports a duplicate as 422 with a `user.*_already_in_use` code.
        // Translate it to the port's typed error so callers never have to match
        // on a provider's wording — which is exactly how the first version of
        // the seed script broke.
        if (status === 422 && /already_in_use/.test(String(body?.code))) {
            throw new UserAlreadyExistsError(
                (input.username ?? input.email) as string,
            )
        }
        if (status >= 400) {
            throw new Error(
                `Logto createUser failed (${status}): ${JSON.stringify(body)}`,
            )
        }
        return toDirectoryUser(body as LogtoUser)
    }

    async deleteUser(id: string): Promise<void> {
        const { status, body } = await this.request(`/users/${id}`, {
            method: 'DELETE',
        })
        // 404 means the goal state already holds. Teardown after a partial
        // failure must not itself fail, or cleanup becomes the thing that needs
        // cleaning up.
        if (status === 404) return
        if (status >= 400) {
            throw new Error(
                `Logto deleteUser failed (${status}): ${JSON.stringify(body)}`,
            )
        }
    }

    async assignRole(userId: string, roleName: string): Promise<void> {
        const roles = await this.requireOk<Array<{ id: string; name: string }>>(
            '/roles',
            { method: 'GET' },
            'listRoles',
        )
        const role = roles.find((r) => r.name === roleName)
        if (!role) {
            throw new Error(
                `Logto role not found: ${roleName}. Create it in the console first — roles are configuration, not something a test should invent.`,
            )
        }

        const { status, body } = await this.request(`/users/${userId}/roles`, {
            method: 'POST',
            body: JSON.stringify({ roleIds: [role.id] }),
        })
        // Logto returns 422 when the user already holds the role. The port
        // promises idempotence, so that is success.
        if (status === 422) {
            logger.debug('logto: role already assigned', { userId, roleName })
            return
        }
        if (status >= 400) {
            throw new Error(
                `Logto assignRole failed (${status}): ${JSON.stringify(body)}`,
            )
        }
    }

    async findByExternalId(id: string): Promise<DirectoryUser | null> {
        const { status, body } = await this.request<LogtoUser>(`/users/${id}`)
        if (status === 404) return null
        if (status >= 400) {
            throw new Error(
                `Logto findByExternalId failed (${status}): ${JSON.stringify(body)}`,
            )
        }
        return body ? toDirectoryUser(body) : null
    }

    // ── Beyond the port ────────────────────────────────────────────────────
    // Provider-specific, and deliberately NOT on `UserDirectory`. Callers here
    // have knowingly opted into Logto; the port stays a directory.

    /** Every user, paged through. Used by orphan cleanup. */
    async listUsers(pageSize = 100): Promise<DirectoryUser[]> {
        const out: DirectoryUser[] = []
        for (let page = 1; ; page++) {
            const batch = await this.requireOk<LogtoUser[]>(
                `/users?page=${page}&page_size=${pageSize}`,
                { method: 'GET' },
                'listUsers',
            )
            if (!batch?.length) break
            out.push(...batch.map(toDirectoryUser))
            if (batch.length < pageSize) break
        }
        return out
    }

    /**
     * Mint a real access token for a user, with no browser.
     *
     * Management API subject token → RFC 8693 token exchange. This is what makes
     * authenticated E2E tests possible without a login flow or `storageState`
     * (#153 question 3).
     *
     * Two prerequisites, both discovered the hard way during the spike:
     *   - the exchange must be performed by the **client** application, not the
     *     M2M app, which Logto rejects with "requested grant type is not
     *     allowed for this client";
     *   - "Allow token exchange" is **off by default** on new applications.
     */
    async mintUserToken(args: {
        userId: string
        resource: string
        scope?: string
    }): Promise<string> {
        const { webClientId, webClientSecret } = config.logto
        if (!webClientId || !webClientSecret) {
            throw new Error(
                'Token exchange needs LOGTO_WEB_CLIENT_ID and LOGTO_WEB_CLIENT_SECRET (the client application — the M2M app is not permitted this grant).',
            )
        }

        const { subjectToken } = await this.requireOk<{
            subjectToken: string
        }>(
            '/subject-tokens',
            { method: 'POST', body: JSON.stringify({ userId: args.userId }) },
            'subjectToken',
        )

        const basic = Buffer.from(`${webClientId}:${webClientSecret}`).toString(
            'base64',
        )

        const res = await fetch(`${this.opts.issuer}/token`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${basic}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                subject_token: subjectToken,
                subject_token_type:
                    'urn:ietf:params:oauth:token-type:access_token',
                resource: args.resource,
                ...(args.scope ? { scope: args.scope } : {}),
            }),
        })
        if (!res.ok) {
            throw new Error(
                `Logto token exchange failed (${res.status}): ${await res.text()}`,
            )
        }
        return ((await res.json()) as { access_token: string }).access_token
    }
}
