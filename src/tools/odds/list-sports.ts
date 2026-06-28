import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { getSports } from '../../adapters/odds/the-odds-api.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../github-issues/results.js'
import { registerTool } from '../registration.js'
import { ListSportsInputSchema } from './schemas.js'

const name = 'list-sports'
const config = {
    title: 'List Sports',
    description: 'List in-season sports and their keys (The Odds API)',
    inputSchema: ListSportsInputSchema,
}

export function registerListSportsTool(server: McpServer): void {
    registerTool(server, name, config, async (): Promise<CallToolResult> => {
        try {
            const sports = await getSports()
            return createSuccessResult({ count: sports.length, sports })
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            return createErrorResult(message)
        }
    })
}
