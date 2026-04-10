import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetIssueInputSchema } from "./schemas.js";
import { createOctokitClient, parseRepo } from "./octokit.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "get-issue";
const toolConfig = {
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
        toolConfig,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { repo, issueNumber } = args as {
                    repo: string;
                    issueNumber: number;
                };

                const { owner, repo: repoName } = parseRepo(repo);
                const octokit = createOctokitClient();

                const response = await octokit.rest.issues.get({
                    owner,
                    repo: repoName,
                    issue_number: issueNumber,
                });

                const issue = response.data;
                return createSuccessResult({
                    number: issue.number,
                    title: issue.title,
                    state: issue.state,
                    url: issue.html_url,
                    author: issue.user?.login ?? "unknown",
                    labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
                    assignees: issue.assignees?.map((a) => a.login) ?? [],
                    milestone: issue.milestone ? { number: issue.milestone.number, title: issue.milestone.title } : null,
                    createdAt: issue.created_at,
                    updatedAt: issue.updated_at,
                    body: issue.body ?? "",
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
