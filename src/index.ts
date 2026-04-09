#!/usr/bin/env node

// config.ts loads dotenv at module init — import it before anything else.
import { config } from "./config.js";
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
        console.error('startup diagnostic:', JSON.stringify(diag));
    } catch (e) {
        console.error('startup diagnostic failed', e);
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
            console.error('transport decision: NODE_ENV=production and PORT present; forcing HTTP transport. Set MCP_TRANSPORT=stdio to force stdio.');
        } else if (decision.reason === 'stdin-attached-port-prefers-stdio') {
            console.error('transport decision: stdin attached and PORT present; preferring stdio transport to support LocalProcess. Set MCP_TRANSPORT=http to force HTTP.');
        }

        const useStdio = decision.useStdio;

        if (!useStdio) {
            // Hosted mode: start HTTP server and do not use stdio transport.
            const { startHttpServer } = await import("./http/server.js");
            await startHttpServer(port as number);
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
    if (config.security.adminDebugEnabled) {
        if (config.isProduction) {
            console.warn('ADMIN_DEBUG_ENABLED is set in production - this exposes diagnostic endpoints. Consider disabling this in production.')
        } else {
            console.error('ADMIN_DEBUG_ENABLED is enabled for this process; debug endpoints will be registered (preview/staging only)')
        }
    }

    // SendGrid configuration warning (non-blocking)
    if (config.isProduction) {
        if (!config.email.sendgridApiKey || !config.email.senderEmail) {
            console.warn('SendGrid not fully configured for production. Missing SENDGRID_API_KEY or SENDER_EMAIL; transactional emails will not be sent. See docs/runbooks/sendgrid.md for setup.')
        } else {
            console.error('SendGrid appears configured for production (SENDER_EMAIL present).')
        }
    } else {
        if (!config.email.sendgridApiKey || !config.email.senderEmail) {
            console.error('SendGrid not configured for local/testing — this is expected in development. Set SENDGRID_API_KEY/SENDER_EMAIL to test email sending.')
        } else {
            console.error('SendGrid configured in non-production environment (SENDER_EMAIL=%s).', config.email.senderEmail)
        }
    }
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
