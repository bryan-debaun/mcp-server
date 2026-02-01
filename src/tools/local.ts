import { registerTools } from './index.js';
import { prisma, prismaReady } from '../db/index.js';

type ToolHandler = (args: any) => Promise<any>;

const handlers = new Map<string, ToolHandler>();

// Track if we've verified Prisma initialization
let prismaVerified = false;

// Fake server interface that tools use to register themselves
const fakeServer: any = {
    registerTool: (name: string, _cfg: any, handler: ToolHandler) => {
        handlers.set(name, handler);
    }
};

// Register all tools into our local handler map
registerTools(fakeServer as any);

function parseToolResult(result: any) {
    if (!result || !result.content || !Array.isArray(result.content) || result.content.length === 0) {
        return undefined;
    }
    const txt = result.content[0].text;
    // Try to parse JSON, fallback to raw text
    try {
        return JSON.parse(txt);
    } catch (e) {
        return txt;
    }
}

export async function callTool(name: string, args: any) {
    // Verify Prisma is initialized before calling any tool (only check once per process)
    if (!prismaVerified) {
        await prismaReady();
        // Verify at least one model exists (as a sanity check that initialization completed)
        if (!prisma.user || typeof prisma.user.findMany !== 'function') {
            throw new Error('Prisma client not properly initialized - database connection may be unavailable');
        }
        prismaVerified = true;
    }

    const handler = handlers.get(name);
    if (!handler) throw new Error(`tool not found: ${name}`);

    const res = await handler(args);
    if (res && res.isError) {
        const txt = res.content && res.content[0] && res.content[0].text ? res.content[0].text : 'unknown error';
        // strip leading 'Error: ' if present
        const message = txt.replace(/^Error:\s*/i, '');
        throw new Error(message);
    }

    return parseToolResult(res);
}
