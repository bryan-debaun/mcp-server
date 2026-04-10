import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CloseIssueInputSchema } from "./schemas.js";
import { createOctokitClient, parseRepo } from "./octokit.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "close-issue";
const toolConfig = {
    title: "Close Issue",
    description: "Close a GitHub issue with an optional comment (supports Markdown)",
    inputSchema: CloseIssueInputSchema
};

/**
 * Registers the close-issue tool with the MCP server.
 */
export function registerCloseIssueTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        toolConfig,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { repo, issueNumber, comment } = args as {
                    repo: string;
                    issueNumber: number;
                    comment?: string;
                };

                const { owner, repo: repoName } = parseRepo(repo);
                const octokit = createOctokitClient();

                // Add comment first if provided
                if (comment) {
                    await octokit.rest.issues.createComment({
                        owner,
                        repo: repoName,
                        issue_number: issueNumber,
                        body: comment,
                    });
                }

                // Close the issue
                await octokit.rest.issues.update({
                    owner,
                    repo: repoName,
                    issue_number: issueNumber,
                    state: "closed",
                });

                return createSuccessResult({
                    message: `Issue #${issueNumber} closed successfully`,
                    repository: repo,
                    commentAdded: !!comment,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
