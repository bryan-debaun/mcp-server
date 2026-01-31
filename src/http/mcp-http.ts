import { Application, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Simple newline-delimited JSON HTTP stream transport
export class HttpStreamTransport {
    private req: Request;
    private res: Response;
    private readBuffer = "";

    onmessage?: (msg: any) => void;
    onerror?: (err: any) => void;
    onclose?: () => void;

    constructor(req: Request, res: Response) {
        this.req = req;
        this.res = res;

        // keep response open for streaming
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");

        // Basic keepalive: send newline every 15s to avoid proxies closing
        const keepalive = setInterval(() => {
            try { res.write("\n"); } catch (e) { void e; }
        }, 15000);

        req.on("data", (chunk: any) => this.handleData(chunk));
        req.on("end", () => {
            clearInterval(keepalive);
            this.onclose?.();
        });
        req.on("error", (err) => this.onerror?.(err));
    }

    async start(): Promise<void> {
        // no-op; connection established by handler
        return;
    }

    async close(): Promise<void> {
        try {
            this.res.end();
        } catch (e) {
            void e;
        }
        this.onclose?.();
    }

    async send(message: any): Promise<void> {
        const json = JSON.stringify(message) + "\n";
        return new Promise((resolve, reject) => {
            try {
                this.res.write(json, (err: any) => (err ? reject(err) : resolve()));
            } catch (e) {
                reject(e);
            }
        });
    }

    private handleData(chunk: any) {
        try {
            const txt = typeof chunk === "string" ? chunk : chunk.toString();
            this.readBuffer += txt;
            let idx: number;
            while ((idx = this.readBuffer.indexOf("\n")) !== -1) {
                const line = this.readBuffer.slice(0, idx).replace(/\r$/, "");
                this.readBuffer = this.readBuffer.slice(idx + 1);
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    this.onmessage?.(parsed);
                } catch (err) {
                    this.onerror?.(err as any);
                }
            }
        } catch (err) {
            this.onerror?.(err as any);
        }
    }
}

// SSE transport: server -> client (clients can POST events to /mcp/events)
export class SseServerTransport {
    private res: Response;
    private connId: string;

    onmessage?: (msg: any) => void; // we support incoming messages via a separate POST endpoint
    onerror?: (err: any) => void;
    onclose?: () => void;

    constructor(res: Response, connId: string) {
        this.res = res;
        this.connId = connId;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        // Send initial connected event with connId
        this.sendEvent({ type: "connected", connId });

        // keepalive comment every 15s
        this._ka = setInterval(() => {
            try { res.write(": keepalive\n\n"); } catch (e) { void e; }
        }, 15000);

        // When the client closes the connection, Express will emit 'close' on the response
        (res as any).on?.("close", () => this.close());
    }

    private _ka?: ReturnType<typeof setInterval>;

    async start(): Promise<void> { return; }

    async send(message: any): Promise<void> {
        this.sendEvent(message);
    }

    private sendEvent(payload: any) {
        try {
            const data = JSON.stringify(payload);
            this.res.write(`data: ${data}\n\n`);
        } catch (e) {
            this.onerror?.(e as any);
        }
    }

    async close(): Promise<void> {
        try { clearInterval(this._ka); } catch (e) { void e; }
        try { this.res.end(); } catch (e) { void e; }
        this.onclose?.();
    }
}

// Register endpoints on the Express app
export function registerMcpHttp(app: Application): void {
    const base = "/mcp";

    // POST /mcp -> primary HTTP stream endpoint (bidirectional NDJSON)
    app.post(base, async (req: Request, res: Response) => {
        const mcpKey = process.env.MCP_API_KEY;
        if (mcpKey) {
            const auth = (req.headers.authorization || '').toString();
            if (auth !== `Bearer ${mcpKey}`) {
                res.status(401).json({ error: 'unauthorized' });
                return;
            }
        }

        try {
            const transport = new HttpStreamTransport(req, res);
            // Lazily create MCP server instance for this connection
            const mod = await import("../server.js");
            const { registerTools } = await import("../tools/index.js");
            const serverInstance: McpServer = mod.createServer();
            registerTools(serverInstance);
            await serverInstance.connect(transport as any).catch((err) => {
                console.error('mcp http connect failed', err);
                try { res.status(500).end(); } catch (e) { void e; }
            });
        } catch (err) {
            console.error('error handling /mcp post', err);
            try { res.status(500).end(); } catch (e) { void e; }
        }
    });

    // GET /mcp -> SSE fallback (server -> client only)
    // Clients should POST events to /mcp/events with header X-MCP-Conn-Id to send messages back
    const sseMap = new Map<string, SseServerTransport>();

    app.get(base, async (req: Request, res: Response) => {
        const mcpKey = process.env.MCP_API_KEY;
        if (mcpKey) {
            const auth = (req.headers.authorization || '').toString();
            if (auth !== `Bearer ${mcpKey}`) {
                res.status(401).json({ error: 'unauthorized' });
                return;
            }
        }

        const connId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const transport = new SseServerTransport(res, connId);
        sseMap.set(connId, transport);

        // Wire it to an MCP server instance
        try {
            const mod = await import("../server.js");
            const { registerTools } = await import("../tools/index.js");
            const serverInstance: McpServer = mod.createServer();
            registerTools(serverInstance);
            await serverInstance.connect(transport as any).catch((err) => console.error('mcp sse connect failed', err));
        } catch (err) {
            console.error('error creating mcp server for sse', err);
            transport.close();
            sseMap.delete(connId);
            return;
        }

        // Clean up on close
        (res as any).on?.("close", () => {
            sseMap.delete(connId);
        });
    });

    // POST /mcp/events -> used by SSE clients to send messages back to server
    app.post(`${base}/events`, async (req: Request, res: Response) => {
        const mcpKey = process.env.MCP_API_KEY;
        if (mcpKey) {
            const auth = (req.headers.authorization || '').toString();
            if (auth !== `Bearer ${mcpKey}`) {
                res.status(401).json({ error: 'unauthorized' });
                return;
            }
        }

        const connId = req.headers['x-mcp-conn-id']?.toString() || '';
        if (!connId) return res.status(400).json({ error: 'missing conn id' });
        const transport = sseMap.get(connId);
        if (!transport) return res.status(404).json({ error: 'connection not found' });

        // Accept newline-delimited JSON body
        try {
            const body = (req as any).body;
            // Support both single object and arrays
            if (Array.isArray(body)) {
                for (const msg of body) transport.onmessage?.(msg);
            } else {
                transport.onmessage?.(body);
            }
            res.status(204).end();
        } catch (err) {
            res.status(400).json({ error: 'invalid payload' });
        }
    });
}
