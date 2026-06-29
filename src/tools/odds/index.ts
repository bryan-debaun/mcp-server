import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBuildParlayTool } from './build-parlay.js'
import { registerDevigTool } from './devig.js'
import { registerFindArbitrageTool } from './find-arbitrage.js'
import { registerFindPositiveEvTool } from './find-positive-ev.js'
import { registerGetOddsTool } from './get-odds.js'
import { registerGetScoresTool } from './get-scores.js'
import { registerListEventsTool } from './list-events.js'
import { registerListSportsTool } from './list-sports.js'

/** Register the odds-analysis tool suite (#129, #130). */
export function registerOddsTools(server: McpServer): void {
    registerListSportsTool(server)
    registerListEventsTool(server)
    registerGetOddsTool(server)
    registerGetScoresTool(server)
    registerDevigTool(server)
    registerFindPositiveEvTool(server)
    registerFindArbitrageTool(server)
    registerBuildParlayTool(server)
}
