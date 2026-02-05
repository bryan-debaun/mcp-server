import express from "express";
import cors from "cors";
import { registerHealthRoute } from "./health-route.js";
import { registerPlaybackRoute } from "./playback-route.js";
import { registerMetricsRoute, httpRequestsTotal, httpRequestDurationSeconds } from "./metrics-route.js";
import { registerAdminRoute } from './admin-route.js';
import { registerInviteRoutes } from './invite-route.js';
// Magic link endpoints are now implemented as a TSOA controller (src/http/controllers/MagicLinkController.ts) and will be registered by `RegisterRoutes(app)`.

import { registerBooksRoute } from './books-route.js';
import { registerAuthorsRoute } from './authors-route.js';
import { registerRatingsRoute } from './ratings-route.js';
import { initPrisma } from '../db/index.js';
import { RegisterRoutes } from './tsoa-routes.js';
import { registerSwaggerRoute } from './swagger-route.js';

export async function createHttpApp() {
    // Backwards-compatible: keep existing behavior when callers expect Prisma initialized
    // before the app is returned.
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
    // Magic-link auth routes are provided by the TSOA controller and registered via `RegisterRoutes(app)`
    // Book catalog routes
    registerBooksRoute(app)
    registerAuthorsRoute(app)
    registerRatingsRoute(app)

    // Register tsoa-generated routes
    RegisterRoutes(app);

    // Register Swagger UI documentation
    registerSwaggerRoute(app);



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

// New helper: create a minimal app that can listen early and expose liveness/readiness
export function createBasicApp() {
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

    // Minimal publicly safe routes (liveness, readiness, playback, metrics)
    registerHealthRoute(app);
    registerPlaybackRoute(app);
    registerMetricsRoute(app);

    // Do NOT register the final 404 handler here - it must be registered *after*
    // DB-dependent routes so that routes added later are reachable. The 404 handler
    // is registered by `createHttpApp` (backwards-compatible caller) or by
    // `registerDbDependentRoutes` when DB-dependent registration completes.

    return app;
}

// Helper to register DB-dependent routes and optional extras after DB init
import { mcpAuthMiddleware } from './middleware/mcp-auth.js';
export async function registerDbDependentRoutes(app: any) {
    // Install MCP API key middleware to protect DB-dependent routes when `MCP_API_KEY` is set
    app.use(mcpAuthMiddleware)

    // Register admin routes
    registerAdminRoute(app)
    // Public invite routes
    registerInviteRoutes(app)
    // Magic-link auth routes are provided by the TSOA controller and registered via `RegisterRoutes(app)`
    // Book catalog routes
    registerBooksRoute(app)
    registerAuthorsRoute(app)
    registerRatingsRoute(app)

    // Register tsoa-generated routes
    RegisterRoutes(app);

    // Register Swagger UI documentation
    registerSwaggerRoute(app);

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

    // Basic 404 handler (must be registered after all other routes so it doesn't
    // intercept later-registered DB-dependent routes)
    app.use((_req: any, res: any) => res.status(404).json({ error: "not found" }));
}

import { WebSocketServer } from 'ws'
import { WsServerTransport } from './mcp-ws.js'

export async function startHttpServer(port: number, host?: string, opts?: { earlyStart?: boolean }): Promise<import("http").Server> {
    const app = createBasicApp();

    return new Promise((resolve) => {
        const bindHost = host ?? process.env.HOST ?? '0.0.0.0';
        const server = app.listen(port, bindHost, async () => {
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

            const early = opts?.earlyStart === true || process.env.EARLY_START === 'true'

            // Initialize Prisma and register DB-dependent routes.
            // If `early` is true, do this in the background and resolve immediately.
            // Otherwise, await completion before resolving so callers (tests/consumers)
            // get a fully-initialized app.
            const initAndRegister = async () => {
                try {
                    console.error('Starting DB initialization')
                    await initPrisma();
                    try {
                        await registerDbDependentRoutes(app)
                    } catch (err) {
                        console.error('Error registering DB-dependent routes', err)
                    }

                    // Mark readiness so readiness probes return success
                    try {
                        const { setReady } = await import('./readiness.js')
                        setReady(true)
                    } catch (err) {
                        console.error('failed to set readiness flag', err)
                    }

                    console.error('DB initialized; app ready')
                } catch (err) {
                    console.error('DB initialization failed', err)
                    throw err
                }
            }

            if (early) {
                // Run init in background and return immediately
                initAndRegister().catch(() => { /* logged above */ })
                resolve(server)
            } else {
                // Wait for full init before returning
                initAndRegister().then(() => resolve(server)).catch(() => resolve(server))
            }
        });
    });
}
