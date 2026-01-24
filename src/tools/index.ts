import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGitHubIssuesTools } from "./github-issues/index.js";

/**
 * Registers all tool categories with the MCP server.
 * This is the central aggregator for tool registration.
 * 
 * To add a new tool category:
 * 1. Create a new folder under src/tools/
 * 2. Implement the tools following the pattern in github-issues/
 * 3. Import and call the registration function here
 */
export function registerTools(server: McpServer): void {
    // GitHub Issues tools
    registerGitHubIssuesTools(server);

    // Future tool categories can be added here:
    // registerGitTools(server);
    // registerProjectTools(server);
}
