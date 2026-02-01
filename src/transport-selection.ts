export type TransportDecisionOptions = {
    mcpTransport?: string | undefined;
    port?: number | undefined;
    nodeEnv?: string | undefined;
    stdinAttached?: boolean | undefined;
};

export type TransportDecision = {
    useStdio: boolean;
    reason?: string;
};

export function decideTransport(opts: TransportDecisionOptions): TransportDecision {
    const explicit = (opts.mcpTransport || '').toLowerCase();
    const port = opts.port;
    const env = (opts.nodeEnv || 'development');
    const stdinAttached = Boolean(opts.stdinAttached);

    if (explicit === 'stdio') {
        return { useStdio: true, reason: 'explicit-mcp-stdio' };
    }
    if (explicit === 'http') {
        return { useStdio: false, reason: 'explicit-mcp-http' };
    }

    if (env === 'production' && port) {
        return { useStdio: false, reason: 'production-port-prefers-http' };
    }

    if (stdinAttached && port) {
        return { useStdio: true, reason: 'stdin-attached-port-prefers-stdio' };
    }

    if (port) {
        return { useStdio: false, reason: 'port-present-http' };
    }

    return { useStdio: true, reason: 'no-port-stdio' };
}
