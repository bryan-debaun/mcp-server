import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CloseIssueInputSchema } from "./schemas.js";
import { runGhCommand } from "./gh-cli.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "close-issue";
const config = {
    title: "Close Issue",
    description: "Close a GitHub issue with an optional comment",
    inputSchema: CloseIssueInputSchema
};

/**
 * Registers the close-issue tool with the MCP server.
 */
export function registerCloseIssueTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { repo, issueNumber, comment } = args as {
                    repo: string;
                    issueNumber: number;
                    comment?: string;
                };

                // Add comment first if provided
                if (comment) {
                    const commentArgs = [
                        "issue", "comment",
                        String(issueNumber),
                        "--repo", repo,
                        "--body", `"${comment.replace(/"/g, '\\"')}"`
                    ];

                    await runGhCommand(commentArgs);
                }

                // Close the issue
                const closeArgs = [
                    "issue", "close",
                    String(issueNumber),
                    "--repo", repo
                ];

                await runGhCommand(closeArgs);

                return createSuccessResult({
                    message: `Issue #${issueNumber} closed successfully`,
                    repository: repo,
                    commentAdded: !!comment
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
