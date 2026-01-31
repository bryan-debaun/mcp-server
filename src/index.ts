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

    // Decide transport based on runtime environment.
    // In hosted environments (when PORT is provided) we should not attach to stdio.
    try {
        const port = process.env.PORT ? Number(process.env.PORT) : undefined;
        if (port) {
            // Hosted mode: start HTTP server and do not use stdio transport.
            const { startHttpServer } = await import("./http/server.js");
            await startHttpServer(port);
            console.error(`MCP server started in HTTP mode on port ${port}`);
        } else {
            // Local dev / extension-host mode: use stdio transport for extension integration.
            const transport = new StdioServerTransport();
            await server.connect(transport);
            console.error("MCP server started on stdio transport");
        }
    } catch (err) {
        console.error("Failed to start server transport or HTTP server:", err);
    }

    // Note: transport-specific startup messages are logged in each branch above.

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
