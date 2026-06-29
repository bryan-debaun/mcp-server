import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { getScores } from '../../adapters/odds/the-odds-api.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../github-issues/results.js'
import { registerTool } from '../registration.js'
import { GetScoresInputSchema } from './schemas.js'

const name = 'get-scores'
const config = {
    title: 'Get Scores',
    description:
        'Recent + upcoming scores for a sport (results feed) — use to reconcile/settle pending bets',
    inputSchema: GetScoresInputSchema,
}

export function registerGetScoresTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const scores = await getScores(args.sport, args.daysFrom)
                return createSuccessResult({ count: scores.length, scores })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
