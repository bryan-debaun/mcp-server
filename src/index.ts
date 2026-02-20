#!/usr/bin/env node

// Load environment variables first (before any imports that might use them)
if (process.env.NODE_ENV !== 'production') {
    try {
        await import('dotenv/config');
    } catch {
        // dotenv not available, environment variables provided by hosting platform
    }
}

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
            PORT: process.env.PORT,
            MCP_TRANSPORT: process.env.MCP_TRANSPORT,
            NODE_ENV: process.env.NODE_ENV,
            stdinIsTTY: typeof process.stdin.isTTY !== 'undefined' ? process.stdin.isTTY : null,
            // Whether stdin is in flowing mode (a crude check; true for many interactive/stdio use-cases)
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
        const explicitEnv = process.env.MCP_TRANSPORT;
        const port = process.env.PORT ? Number(process.env.PORT) : undefined;
        const stdinAttached = Boolean(process.stdin && (process.stdin.isTTY || process.stdin.readable || (process.stdin as any).readableFlowing));
        const env = process.env.NODE_ENV || 'development';

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
    const adminDebug = (process.env.ADMIN_DEBUG_ENABLED || '').toLowerCase()
    const env = process.env.NODE_ENV || 'development'
    if (adminDebug === '1' || adminDebug === 'true') {
        if (env === 'production') {
            console.warn('ADMIN_DEBUG_ENABLED is set in production - this exposes diagnostic endpoints. Consider disabling this in production.')
        } else {
            console.error('ADMIN_DEBUG_ENABLED is enabled for this process; debug endpoints will be registered (preview/staging only)')
        }
    }

    // SendGrid configuration warning (non-blocking)
    const sendgridKey = process.env.SENDGRID_API_KEY
    const senderEmail = process.env.SENDER_EMAIL ?? process.env.FROM_EMAIL

    if (env === 'production') {
        if (!sendgridKey || !senderEmail) {
            console.warn('SendGrid not fully configured for production. Missing SENDGRID_API_KEY or SENDER_EMAIL; transactional emails will not be sent. See docs/runbooks/sendgrid.md for setup.')
        } else {
            console.error('SendGrid appears configured for production (SENDER_EMAIL present).')
        }
    } else {
        if (!sendgridKey || !senderEmail) {
            console.error('SendGrid not configured for local/testing — this is expected in development. Set SENDGRID_API_KEY/SENDER_EMAIL to test email sending.')
        } else {
            console.error('SendGrid configured in non-production environment (SENDER_EMAIL=%s).', senderEmail)
        }
    }
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
