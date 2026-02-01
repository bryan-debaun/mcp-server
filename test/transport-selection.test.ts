import { describe, it, expect } from 'vitest'
import { decideTransport } from '../src/transport-selection'

describe('decideTransport', () => {
    it('forces HTTP in production when PORT is present', () => {
        const d = decideTransport({ port: 8080, nodeEnv: 'production', stdinAttached: true })
        expect(d.useStdio).toBe(false)
        expect(d.reason).toBe('production-port-prefers-http')
    })

    it('respects explicit MCP_TRANSPORT=stdio', () => {
        const d = decideTransport({ mcpTransport: 'stdio', port: 8080, nodeEnv: 'production', stdinAttached: false })
        expect(d.useStdio).toBe(true)
        expect(d.reason).toBe('explicit-mcp-stdio')
    })

    it('prefers stdio when stdin attached in development', () => {
        const d = decideTransport({ port: 8080, nodeEnv: 'development', stdinAttached: true })
        expect(d.useStdio).toBe(true)
        expect(d.reason).toBe('stdin-attached-port-prefers-stdio')
    })

    it('uses HTTP when PORT is set and no stdin attached', () => {
        const d = decideTransport({ port: 8080, nodeEnv: 'development', stdinAttached: false })
        expect(d.useStdio).toBe(false)
        expect(d.reason).toBe('port-present-http')
    })

    it('uses stdio when no port present', () => {
        const d = decideTransport({ nodeEnv: 'development', stdinAttached: false })
        expect(d.useStdio).toBe(true)
        expect(d.reason).toBe('no-port-stdio')
    })
})
