import express from "express";
import cors from "cors";
import { registerHealthRoute } from "./health-route.js";
import { registerPlaybackRoute } from "./playback-route.js";
import { registerMetricsRoute, httpRequestsTotal, httpRequestDurationSeconds } from "./metrics-route.js";
import { registerAdminRoute } from './admin-route.js';
import { registerInviteRoutes } from './invite-route.js';
import { registerBooksRoute } from './books-route.js';
import { registerAuthorsRoute } from './authors-route.js';
import { registerRatingsRoute } from './ratings-route.js';
import { initPrisma } from '../db/index.js';

export async function createHttpApp() {
    // Initialize Prisma before registering any routes that might use it
    await initPrisma();
    const app = express();
    app.use(cors());
    app.use(express.json());

    // Diagnostic request logging to help debug hosting/proxy issues
    app.use((req, res, next) => {
        try {
            console.error(`incoming request: ${req.method} ${req.path} authPresent=${!!req.headers.authorization}`);
        } catch (e) { /* noop */ }
        next();
    });

    // HTTP instrumentation middleware
    app.use((req, res, next) => {
        const end = httpRequestDurationSeconds.startTimer();
        res.on("finish", () => {
            const labels = { method: req.method, path: req.path, status: String(res.statusCode) };
            httpRequestsTotal.inc(labels);
            end(labels);
        });
        next();
    });

    registerHealthRoute(app);
    registerPlaybackRoute(app);
    registerMetricsRoute(app);
    // Register admin routes
    registerAdminRoute(app)
    // Public invite routes
    registerInviteRoutes(app)
    // Book catalog routes
    registerBooksRoute(app)
    registerAuthorsRoute(app)
    registerRatingsRoute(app)



    // MCP HTTP transport (HTTP Stream + SSE fallback)
    try {
        const mod = await import('./mcp-http.js');
        try {
            mod.registerMcpHttp(app);
            console.error('registered MCP HTTP transport (routes mounted at /mcp)');
            try {
                const routes = (app as any)._router?.stack?.filter((l: any) => l.route).map((l: any) => ({ path: l.route.path, methods: l.route.methods }));
                console.error('registered routes:', JSON.stringify(routes));
            } catch (e) {
                console.error('failed to enumerate routes', e);
            }
        } catch (err) {
            console.error('failed to register MCP HTTP transport', err)
        }
    } catch (err) {
        console.error('failed to import MCP HTTP transport', err)
    }

    // Basic 404 handler
    app.use((_req, res) => res.status(404).json({ error: "not found" }));

    return app;
}

import { WebSocketServer } from 'ws'
import { WsServerTransport } from './mcp-ws.js'

export async function startHttpServer(port: number, host?: string): Promise<import("http").Server> {
    const app = await createHttpApp();
    return new Promise((resolve) => {
        const bindHost = host ?? process.env.HOST ?? '0.0.0.0';
        const server = app.listen(port, bindHost, () => {
            console.error(`HTTP server listening on ${bindHost}:${port}`);
            // Attach WebSocket server for MCP remote transport when enabled via MCP_API_KEY
            const mcpKey = process.env.MCP_API_KEY
            if (mcpKey) {
                const wss = new WebSocketServer({ server, path: '/mcp/ws' })
                wss.on('connection', (ws, req) => {
                    try {
                        const auth = (req.headers.authorization || '').toString()
                        if (auth !== `Bearer ${mcpKey}`) {
                            ws.close(1008, 'unauthorized')
                            console.error('mcp ws: unauthorized connection attempt')
                            return
                        }

                        const transport = new WsServerTransport(ws as any)
                        // We will import the MCP server lazily so this module doesn't need a direct dependency cycle
                        import('../server.js').then((mod) => {
                            // create a temporary server instance for this connection
                            const serverInstance = mod.createServer()
                            serverInstance.connect(transport).catch((err) => console.error('mcp ws connect failed', err))
                        }).catch((err) => console.error('failed to load MCP server for ws connection', err))
                    } catch (err) {
                        console.error('error handling mcp ws connection', err)
                        ws.close(1011, 'internal error')
                    }
                })
                console.error('MCP WebSocket endpoint enabled at /mcp/ws')
            }
            resolve(server);
        });
    });
}
