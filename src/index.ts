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

    // Warn if admin debug is enabled in what looks like production
    const adminDebug = (process.env.ADMIN_DEBUG_ENABLED || '').toLowerCase()
    const env = process.env.NODE_ENV || 'development'
    if (adminDebug === '1' || adminDebug === 'true') {
        if (env === 'production') {
            console.warn('ADMIN_DEBUG_ENABLED is set in production - this exposes diagnostic endpoints. Consider disabling this in production.')
        } else {
            console.error('ADMIN_DEBUG_ENABLED is enabled for this process; debug endpoints will be registered (preview/staging only)')
        }
    }
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
