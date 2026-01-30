import express from "express";
import cors from "cors";
import { registerHealthRoute } from "./health-route.js";
import { registerPlaybackRoute } from "./playback-route.js";
import { registerMetricsRoute, httpRequestsTotal, httpRequestDurationSeconds } from "./metrics-route.js";
import { registerAdminRoute } from './admin-route.js'
import { registerInviteRoutes } from './invite-route.js'

export function createHttpApp() {
    const app = express();
    app.use(cors());
    app.use(express.json());

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

    // Basic 404 handler
    app.use((_req, res) => res.status(404).json({ error: "not found" }));

    return app;
}

import { WebSocketServer } from 'ws'
import { WsServerTransport } from './mcp-ws.js'

export function startHttpServer(port: number): Promise<import("http").Server> {
    const app = createHttpApp();
    return new Promise((resolve) => {
        const server = app.listen(port, () => {
            console.error(`HTTP server listening on port ${port}`);
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
