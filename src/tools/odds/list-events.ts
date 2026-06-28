import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { getEvents } from '../../adapters/odds/the-odds-api.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../github-issues/results.js'
import { registerTool } from '../registration.js'
import { ListEventsInputSchema } from './schemas.js'

const name = 'list-events'
const config = {
    title: 'List Events',
    description: 'List upcoming events for a sport (The Odds API)',
    inputSchema: ListEventsInputSchema,
}

export function registerListEventsTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const events = await getEvents(args.sport)
                return createSuccessResult({ count: events.length, events })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
