import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetOpenIssuesTool } from "./get-open-issues.js";
import { registerGetIssueTool } from "./get-issue.js";
import { registerCreateIssueTool } from "./create-issue.js";
import { registerUpdateIssueTool } from "./update-issue.js";
import { registerCloseIssueTool } from "./close-issue.js";

/**
 * Registers all GitHub Issues tools with the MCP server.
 */
export function registerGitHubIssuesTools(server: McpServer): void {
    registerGetOpenIssuesTool(server);
    registerGetIssueTool(server);
    registerCreateIssueTool(server);
    registerUpdateIssueTool(server);
    registerCloseIssueTool(server);
}
