#!/usr/bin/env tsx
/* eslint-disable no-console */
import WebSocket from 'ws';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface Arguments {
    url?: string;
    token?: string;
    reconnect: boolean;
}

const argv = yargs(hideBin(process.argv))
    .option('url', { type: 'string', demandOption: false, description: 'wss URL of MCP server' })
    .option('token', { type: 'string', demandOption: false, description: 'MCP_API_KEY' })
    .option('reconnect', { type: 'boolean', default: true })
    .parseSync() as Arguments;

const urlMaybe = argv.url || process.env.MCP_WS_URL;
const tokenMaybe = argv.token || process.env.MCP_API_KEY;

if (!urlMaybe || !tokenMaybe) {
    console.error('Usage: mcp-proxy --url wss://... --token <MCP_API_KEY> or set MCP_WS_URL/MCP_API_KEY');
    process.exit(1);
}

// Type-safe after validation
const url: string = urlMaybe;
const token: string = tokenMaybe;

let ws: WebSocket | null = null;
let shouldStop = false;

function connect(): void {
    console.error(`Connecting to ${url}`);
    ws = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });

    ws.on('open', () => {
        console.error('Connected to MCP WebSocket');
        // pipe stdin to ws
        process.stdin.resume();
        process.stdin.on('data', (chunk: Buffer) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(chunk);
            }
        });
    });

    ws.on('message', (data: WebSocket.Data) => {
        // forward raw bytes/text to stdout
        const txt = typeof data === 'string' ? data : data.toString();
        process.stdout.write(txt);
    });

    ws.on('close', (code: number, reason: Buffer) => {
        console.error('WebSocket closed', code, reason.toString());
        process.stdin.pause();
        if (!shouldStop && argv.reconnect) {
            setTimeout(connect, 1000);
        }
    });

    ws.on('error', (err: Error) => {
        console.error('WebSocket error', err);
    });
}

process.on('SIGINT', () => {
    console.error('Shutting down proxy');
    shouldStop = true;
    if (ws) {
        ws.close();
    }
    process.exit(0);
});

connect();
