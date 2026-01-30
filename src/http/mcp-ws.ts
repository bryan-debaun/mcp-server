// Minimal server-side transport wrapper that conforms to the MCP SDK transport interface used by StdioServerTransport
export class WsServerTransport {
    private ws: any
    private readBuffer: string = ''

    onmessage?: (msg: any) => void
    onerror?: (err: any) => void
    onclose?: () => void

    constructor(ws: any) {
        this.ws = ws
        this.ws.on('message', (data: any) => this.handleMessage(data))
        this.ws.on('error', (err: any) => this.onerror?.(err))
        this.ws.on('close', () => this.onclose?.())
    }

    async start(): Promise<void> {
        // No-op for WS; connection is already established
        return
    }

    async close(): Promise<void> {
        try {
            this.ws.close()
        } catch (e) {
            // ignore
        }
        this.onclose?.()
    }

    async send(message: any): Promise<void> {
        const json = JSON.stringify(message) + '\n'
        return new Promise((resolve, reject) => {
            this.ws.send(json, (err: any) => (err ? reject(err) : resolve()))
        })
    }

    private handleMessage(data: any) {
        try {
            const txt = typeof data === 'string' ? data : data.toString()
            // Buffer and split by newline so we maintain message framing like stdio
            this.readBuffer += txt
            let idx: number
            while ((idx = this.readBuffer.indexOf('\n')) !== -1) {
                const line = this.readBuffer.slice(0, idx).replace(/\r$/, '')
                this.readBuffer = this.readBuffer.slice(idx + 1)
                try {
                    const parsed = JSON.parse(line)
                    this.onmessage?.(parsed)
                } catch (e) {
                    this.onerror?.(e)
                }
            }
        } catch (err) {
            this.onerror?.(err)
        }
    }
}
