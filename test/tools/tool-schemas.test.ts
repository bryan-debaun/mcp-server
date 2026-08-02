import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerTools } from '../../src/tools/index.js'

/**
 * `inputSchema` is the contract every MCP client sees.
 *
 * The Zod schemas in `src/tools/**\/schemas.ts` are not the interface — the
 * JSON Schema the SDK *derives* from them is, and that derivation is owned by
 * whichever Zod major is installed. Nothing tested it. Upgrading zod 3 -> 4
 * rewrote 69 of 71 tool schemas, dropped `additionalProperties: false` from 78
 * places to 4, and the entire suite stayed green, because no assertion had ever
 * looked at the generated output.
 *
 * Same shape as the `$queryRawUnsafe` and unregistered-metric bugs: the tests
 * agreed with the code while neither was looking at the thing that moved.
 *
 * So this snapshots the derived schemas. It is deliberately not a test of the
 * Zod source — a dependency upgrade can rewrite the output without touching a
 * line of ours, which is precisely the case it exists to catch. When it fails,
 * read the diff and decide whether the contract change was intended before
 * running `vitest -u`.
 */
describe('MCP tool input schemas', () => {
    let tools: Array<{ name: string; inputSchema: unknown }>

    beforeAll(async () => {
        const server = new McpServer({ name: 'schema-test', version: '0.0.0' })
        registerTools(server)

        const [clientTransport, serverTransport] =
            InMemoryTransport.createLinkedPair()
        const client = new Client({ name: 'schema-test', version: '0.0.0' })
        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport),
        ])

        const listed = await client.listTools()
        tools = listed.tools
            .map((t) => ({ name: t.name, inputSchema: t.inputSchema }))
            .sort((a, b) => a.name.localeCompare(b.name))
    })

    it('registers every tool with an object input schema', () => {
        expect(tools.length).toBeGreaterThan(60)
        const malformed = tools.filter(
            (t) => (t.inputSchema as { type?: string })?.type !== 'object',
        )
        expect(malformed.map((t) => t.name)).toEqual([])
    })

    it('exposes no duplicate tool names', () => {
        const names = tools.map((t) => t.name)
        expect(names).toEqual([...new Set(names)])
    })

    it('matches the recorded client-facing schemas', async () => {
        await expect(`${JSON.stringify(tools, null, 2)}\n`).toMatchFileSnapshot(
            './__snapshots__/tool-schemas.json',
        )
    })
})
