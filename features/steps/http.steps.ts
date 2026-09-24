import assert from 'node:assert/strict'
import { type DataTable, Given, Then, When } from '@cucumber/cucumber'
import { config } from '../../src/config.js'
import { mutableConfig, type ServerWorld } from '../support/world.js'

// --- setup --------------------------------------------------------------------

Given(
    'the server is running with no database configured',
    async function (this: ServerWorld) {
        assert.equal(config.database.url, undefined, 'the BDD run is DB-free')
        await this.start()
    },
)

Given('MCP_API_KEY is {string}', function (key: string) {
    mutableConfig.security.mcpApiKey = key
})

Given('MCP_API_KEY is not set', function () {
    mutableConfig.security.mcpApiKey = undefined
})

Given('the public base URL is {string}', function (url: string) {
    mutableConfig.oauth.publicBaseUrl = url
    mutableConfig.oauth.resourceIdentifier = undefined
})

// --- requests -----------------------------------------------------------------

When(
    'GET {word} is requested',
    async function (this: ServerWorld, path: string) {
        await this.request('GET', path)
    },
)

When(
    'GET {word} is requested with no credentials',
    async function (this: ServerWorld, path: string) {
        await this.request('GET', path)
    },
)

When(
    'GET {word} is requested with bearer {string}',
    async function (this: ServerWorld, path: string, token: string) {
        await this.request('GET', path, { authorization: `Bearer ${token}` })
    },
)

When(
    'GET {word} is requested with header X-Mcp-Api-Key {string}',
    async function (this: ServerWorld, path: string, key: string) {
        await this.request('GET', path, { 'x-mcp-api-key': key })
    },
)

When(
    'POST {word} is requested with no credentials',
    async function (this: ServerWorld, path: string) {
        await this.request('POST', path, {}, '{}')
    },
)

When(
    'POST {word} is requested with bearer {string}',
    async function (this: ServerWorld, path: string, token: string) {
        await this.request(
            'POST',
            path,
            { authorization: `Bearer ${token}` },
            '{}',
        )
    },
)

const INITIALIZE = {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'bdd-harness', version: '0.0.0' },
}

When(
    'an MCP initialize request is sent with bearer {string}',
    async function (this: ServerWorld, token: string) {
        await this.mcp('initialize', INITIALIZE, {
            authorization: `Bearer ${token}`,
        })
    },
)

When(
    'an MCP initialize request is sent with no credentials',
    async function (this: ServerWorld) {
        await this.mcp('initialize', INITIALIZE)
    },
)

When(
    // `/` is alternation in a Cucumber expression, hence the escape.
    'an MCP tools\\/list request is sent with bearer {string}',
    async function (this: ServerWorld, token: string) {
        await this.mcp('tools/list', {}, { authorization: `Bearer ${token}` })
    },
)

// --- responses ----------------------------------------------------------------

Then(
    'the response status is {int}',
    function (this: ServerWorld, status: number) {
        assert.equal(
            this.responded().status,
            status,
            JSON.stringify(this.body ?? this.rpc),
        )
    },
)

Then(
    'the response status is not {int}',
    function (this: ServerWorld, status: number) {
        assert.notEqual(this.responded().status, status)
    },
)

Then(
    'the body reports status {string} with the Node version and uptime',
    function (this: ServerWorld, status: string) {
        assert.equal(this.body?.status, status)
        assert.equal(this.body?.node, process.version)
        assert.equal(typeof this.body?.uptime_seconds, 'number')
    },
)

Then(
    'the body reports the database as {string}',
    function (this: ServerWorld, db: string) {
        assert.equal(this.body?.db, db)
    },
)

Then(
    'the body reports the optional integrations',
    function (this: ServerWorld) {
        assert.equal(typeof this.body?.capabilities, 'object')
    },
)

Then(
    'the WWW-Authenticate header points at the protected resource metadata',
    function (this: ServerWorld) {
        const header = this.responded().headers.get('www-authenticate') ?? ''
        assert.match(header, /^Bearer /)
        assert.match(
            header,
            /resource_metadata="[^"]*\/\.well-known\/oauth-protected-resource/,
        )
    },
)

Then(
    'the WWW-Authenticate header names resource_metadata {string}',
    function (this: ServerWorld, url: string) {
        const header = this.responded().headers.get('www-authenticate') ?? ''
        assert.ok(header.includes(`resource_metadata="${url}"`), header)
    },
)

Then(
    'the metadata names {string} as the resource',
    function (this: ServerWorld, resource: string) {
        assert.equal(this.body?.resource, resource)
    },
)

Then(
    'the metadata supports the {string} bearer method',
    function (this: ServerWorld, method: string) {
        assert.ok(
            (
                (this.body?.bearer_methods_supported as string[] | undefined) ??
                []
            ).includes(method),
            JSON.stringify(this.body),
        )
    },
)

Then(
    'the JSON-RPC result names the server and its protocol version',
    function (this: ServerWorld) {
        const result = this.result()
        const serverInfo = result.serverInfo as { name?: string } | undefined
        assert.ok(serverInfo?.name, 'serverInfo.name')
        assert.equal(typeof result.protocolVersion, 'string')
    },
)

Then('the result advertises tools', function (this: ServerWorld) {
    const capabilities = this.result().capabilities as Record<string, unknown>
    assert.ok(capabilities.tools, 'capabilities.tools')
})

Then(
    'the listed tools include:',
    function (this: ServerWorld, table: DataTable) {
        const tools = this.result().tools as { name: string }[]
        const names = new Set(tools.map((t) => t.name))
        for (const expected of table.raw().flat()) {
            assert.ok(
                names.has(expected),
                `${expected} is not listed (${[...names].join(', ')})`,
            )
        }
    },
)
