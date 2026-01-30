import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetIssueInputSchema, type GitHubIssue } from "./schemas.js";
import { runGhCommand, parseGhJson } from "./gh-cli.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "get-issue";
const config = {
    title: "Get Issue",
    description: "Get full details of a specific GitHub issue by number",
    inputSchema: GetIssueInputSchema
};

/**
 * Registers the get-issue tool with the MCP server.
 */
export function registerGetIssueTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { repo, issueNumber } = args as {
                    repo: string;
                    issueNumber: number;
                };

                const ghArgs = [
                    "issue", "view",
                    String(issueNumber),
                    "--repo", repo,
                    "--json", "number,title,state,body,url,createdAt,updatedAt,author,labels,assignees"
                ];

                const output = await runGhCommand(ghArgs);
                const issue = parseGhJson<GitHubIssue>(output);

                return createSuccessResult({
                    number: issue.number,
                    title: issue.title,
                    state: issue.state,
                    url: issue.url,
                    author: issue.author.login,
                    labels: issue.labels.map((l) => l.name),
                    assignees: issue.assignees.map((a) => a.login),
                    createdAt: issue.createdAt,
                    updatedAt: issue.updatedAt,
                    body: issue.body
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
