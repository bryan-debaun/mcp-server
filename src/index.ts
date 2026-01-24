#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { registerTools } from "./tools/index.js";

/**
 * Main entry point for the MCP server.
 * Sets up the server with stdio transport for VS Code integration.
 */
async function main(): Promise<void> {
    const server = createServer();

    // Register all tools
    registerTools(server);

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);

    // Log to stderr (stdout is reserved for MCP protocol)
    console.error("MCP server started on stdio transport");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
