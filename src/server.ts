import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
    runWithDbContext,
    TRUSTED_SERVICE_CONTEXT,
} from './db/request-context.js'

/**
 * Creates and configures the MCP server instance.
 * The server is configured with tool capabilities for GitHub Issues operations.
 */
export function createServer(): McpServer {
    const server = new McpServer(
        {
            name: 'bryan-debaun-mcp-server',
            version: '0.1.0',
        },
        {
            capabilities: {
                tools: {},
            },
        },
    )

    return withToolDbContext(server)
}

/**
 * Give every MCP tool call a database identity.
 *
 * MCP callers do not carry a user JWT — they are gated by `MCP_API_KEY` on the
 * HTTP/WebSocket transports, or are a local stdio process the developer started
 * themselves. Both are already full trust: the key unlocks every DB-backed
 * route, and stdio means someone with the machine. Without claims, RLS would
 * refuse every MCP write, so tools would break the moment enforcement lands.
 *
 * Wrapping here rather than in each `registerXxxTool` covers all three
 * transports from one place, and — importantly — does **not** touch the fake
 * server in `src/tools/local.ts`. That one backs the REST facade, where the
 * caller's real identity has already been established by the auth layer and
 * must not be overwritten with service claims.
 */
function withToolDbContext(server: McpServer): McpServer {
    const original = server.registerTool.bind(server)

    ;(server as any).registerTool = (name: string, config: any, handler: any) =>
        original(name, config, (...args: any[]) =>
            // `async () => await …` is deliberate: the handler's promise must be
            // created AND awaited inside the scope. Returning it unawaited lets
            // it execute after the scope exits, at which point the claims are
            // gone and every write is refused. See runWithDbContext.
            runWithDbContext(
                { ...TRUSTED_SERVICE_CONTEXT },
                async () => await handler(...args),
            ),
        )

    return server
}
