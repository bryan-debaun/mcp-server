import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../github-issues/results.js'
import { registerTool } from '../registration.js'
import { buildParlay } from './odds-math.js'
import { BuildParlayInputSchema } from './schemas.js'

const name = 'build-parlay'
const config = {
    title: 'Build Parlay',
    description:
        'Combine legs into a parlay: combined odds, implied/fair prob, EV — with an honest correlation/vig caveat (no API)',
    inputSchema: BuildParlayInputSchema,
}

export function registerBuildParlayTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                return createSuccessResult(buildParlay(args.legs))
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
