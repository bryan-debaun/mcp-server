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

    // Start HTTP server if a PORT is provided (Render/hosting) or explicitly enabled
    try {
        const port = process.env.PORT ? Number(process.env.PORT) : undefined;
        if (port) {
            const { startHttpServer } = await import("./http/server.js");
            await startHttpServer(port);
        }
    } catch (err) {
        console.error("Failed to start HTTP server:", err);
    }

    // Log to stderr (stdout is reserved for MCP protocol)
    console.error("MCP server started on stdio transport");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
