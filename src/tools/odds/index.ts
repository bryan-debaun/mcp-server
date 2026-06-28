import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBuildParlayTool } from './build-parlay.js'
import { registerDevigTool } from './devig.js'
import { registerFindArbitrageTool } from './find-arbitrage.js'
import { registerFindPositiveEvTool } from './find-positive-ev.js'
import { registerGetOddsTool } from './get-odds.js'
import { registerListEventsTool } from './list-events.js'
import { registerListSportsTool } from './list-sports.js'

/** Register the odds-analysis tool suite (#129). */
export function registerOddsTools(server: McpServer): void {
    registerListSportsTool(server)
    registerListEventsTool(server)
    registerGetOddsTool(server)
    registerDevigTool(server)
    registerFindPositiveEvTool(server)
    registerFindArbitrageTool(server)
    registerBuildParlayTool(server)
}
