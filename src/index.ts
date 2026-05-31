#!/usr/bin/env node

// config.ts loads dotenv at module init — import it before anything else.
import { config } from "./config.js";
import { logger } from "./logger.js";
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

    // Diagnostic: log key environment variables and stdio status so we can detect how the extension launched us
    try {
        const diag = {
            PORT: config.server.port,
            MCP_TRANSPORT: config.server.mcpTransport,
            NODE_ENV: config.nodeEnv,
            stdinIsTTY: typeof process.stdin.isTTY !== 'undefined' ? process.stdin.isTTY : null,
            stdinReadable: Boolean(process.stdin && (process.stdin.readable || process.stdin.readableFlowing)),
        };
        logger.info('startup diagnostic:', JSON.stringify(diag));
    } catch (e) {
        logger.warn('startup diagnostic failed', e);
    }

    // Decide transport based on runtime environment.
    // Priority:
    // 1. `MCP_TRANSPORT` env if explicitly set to 'stdio' or 'http'
    // 2. If unset, prefer stdio when stdin appears attached (common for LocalProcess) even if PORT is set
    // 3. Otherwise, if PORT is set, run HTTP server
    try {
        const explicitEnv = config.server.mcpTransport;
        const port = config.server.port;
        const stdinAttached = Boolean(process.stdin && (process.stdin.isTTY || process.stdin.readable || (process.stdin as any).readableFlowing));
        const env = config.nodeEnv;

        // Determine transport via a testable helper
        const { decideTransport } = await import('./transport-selection.js');
        const decision = decideTransport({ mcpTransport: explicitEnv, port, nodeEnv: env, stdinAttached });

        // Mirror previous logging behavior for the notable cases
        if (decision.reason === 'production-port-prefers-http') {
            logger.info('transport decision: NODE_ENV=production and PORT present; forcing HTTP transport. Set MCP_TRANSPORT=stdio to force stdio.');
        } else if (decision.reason === 'stdin-attached-port-prefers-stdio') {
            logger.info('transport decision: stdin attached and PORT present; preferring stdio transport to support LocalProcess. Set MCP_TRANSPORT=http to force HTTP.');
        }

        const useStdio = decision.useStdio;

        if (!useStdio) {
            // Hosted mode: start HTTP server and do not use stdio transport.
            const { startHttpServer } = await import("./http/server.js");
            await startHttpServer(port as number);
            logger.info(`MCP server started in HTTP mode on port ${port}`);
        } else {
            // Local dev / extension-host mode: use stdio transport for extension integration.
            const transport = new StdioServerTransport();
            await server.connect(transport);
            logger.info("MCP server started on stdio transport");
        }
    } catch (err) {
        logger.error("Failed to start server transport or HTTP server:", err);
    }

    // Note: transport-specific startup messages are logged in each branch above.

    // Admin debug endpoint startup messaging
    if (config.security.adminDebugEnabled) {
        if (config.isProduction) {
            // Hard block: the endpoint is suppressed in production regardless of the flag.
            // Error-level so operators notice this in production logs.
            logger.warn('ADMIN_DEBUG_ENABLED is set but IGNORED in production — debug endpoints are never registered in production. Unset this flag to silence this message.')
        } else {
            logger.info('ADMIN_DEBUG_ENABLED is enabled for this process; debug endpoints will be registered (preview/staging only)')
        }
    }
}

main().catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
});
