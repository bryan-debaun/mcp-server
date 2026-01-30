import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetOpenIssuesInputSchema, type GitHubIssue } from "./schemas.js";
import { runGhCommand, parseGhJson } from "./gh-cli.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "get-open-issues";
const config = {
    title: "Get Open Issues",
    description: "List open issues from a GitHub repository, optionally filtered by labels",
    inputSchema: GetOpenIssuesInputSchema
};

/**
 * Registers the get-open-issues tool with the MCP server.
 */
export function registerGetOpenIssuesTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { repo, labels, limit } = args as {
                    repo: string;
                    labels?: string;
                    limit: number;
                };

                const ghArgs = [
                    "issue", "list",
                    "--repo", repo,
                    "--state", "open",
                    "--limit", String(limit),
                    "--json", "number,title,state,body,url,createdAt,updatedAt,author,labels,assignees"
                ];

                if (labels) {
                    ghArgs.push("--label", labels);
                }

                const output = await runGhCommand(ghArgs);
                const issues = parseGhJson<GitHubIssue[]>(output);

                if (issues.length === 0) {
                    return createSuccessResult(`No open issues found in ${repo}`);
                }

                // Format issues for display
                const formatted = issues.map((issue) => ({
                    number: issue.number,
                    title: issue.title,
                    url: issue.url,
                    author: issue.author.login,
                    labels: issue.labels.map((l) => l.name),
                    createdAt: issue.createdAt
                }));

                return createSuccessResult({
                    repository: repo,
                    count: issues.length,
                    issues: formatted
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
