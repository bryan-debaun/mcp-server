import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Creates and configures the MCP server instance.
 * The server is configured with tool capabilities for GitHub Issues operations.
 */
export function createServer(): McpServer {
    const server = new McpServer(
        {
            name: "bryan-debaun-mcp-server",
            version: "0.1.0"
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    return server;
}
