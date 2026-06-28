import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../github-issues/results.js'
import { registerTool } from '../registration.js'
import { devig } from './odds-math.js'
import { DevigInputSchema } from './schemas.js'

const name = 'devig'
const config = {
    title: 'Devig Market',
    description:
        'Strip the vig from a market: fair implied probabilities + the book hold (no API)',
    inputSchema: DevigInputSchema,
}

export function registerDevigTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                return createSuccessResult(devig(args.oddsAmerican))
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
