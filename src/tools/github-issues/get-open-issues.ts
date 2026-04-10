import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetOpenIssuesInputSchema } from "./schemas.js";
import { createOctokitClient, parseRepo } from "./octokit.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "get-open-issues";
const toolConfig = {
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
        toolConfig,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { repo, labels, limit } = args as {
                    repo: string;
                    labels?: string;
                    limit: number;
                };

                const { owner, repo: repoName } = parseRepo(repo);
                const octokit = createOctokitClient();

                const labelList = labels
                    ? labels.split(",").map((s) => s.trim()).filter(Boolean)
                    : undefined;

                const response = await octokit.rest.issues.listForRepo({
                    owner,
                    repo: repoName,
                    state: "open",
                    labels: labelList?.join(","),
                    per_page: Math.min(limit, 100),
                });

                const issues = response.data;

                if (issues.length === 0) {
                    return createSuccessResult(`No open issues found in ${repo}`);
                }

                const formatted = issues.map((issue) => ({
                    number: issue.number,
                    title: issue.title,
                    url: issue.html_url,
                    author: issue.user?.login ?? "unknown",
                    labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
                    createdAt: issue.created_at,
                }));

                return createSuccessResult({
                    repository: repo,
                    count: issues.length,
                    issues: formatted,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
