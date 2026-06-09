import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCloseIssueTool } from './close-issue.js'
import { registerCreateIssueTool } from './create-issue.js'
import { registerGetIssueTool } from './get-issue.js'
import { registerGetOpenIssuesTool } from './get-open-issues.js'
import { registerListLabelsTool } from './list-labels.js'
import { registerUpdateIssueTool } from './update-issue.js'

/**
 * Registers all GitHub Issues tools with the MCP server.
 */
export function registerGitHubIssuesTools(server: McpServer): void {
    registerGetOpenIssuesTool(server)
    registerGetIssueTool(server)
    registerCreateIssueTool(server)
    registerUpdateIssueTool(server)
    registerCloseIssueTool(server)
    registerListLabelsTool(server)
}
