import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpdateIssueInputSchema } from "./schemas.js";
import { runGhCommand } from "./gh-cli.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "update-issue";
const config = {
    title: "Update Issue",
    description: "Update a GitHub issue's title, body, labels, or add a comment",
    inputSchema: UpdateIssueInputSchema
};

/**
 * Registers the update-issue tool with the MCP server.
 */
export function registerUpdateIssueTool(server: McpServer): void {
    server.registerTool(
        name,
        config,
        async (args): Promise<CallToolResult> => {
            try {
                const { repo, issueNumber, title, body, labels, comment } = args as {
                    repo: string;
                    issueNumber: number;
                    title?: string;
                    body?: string;
                    labels?: string;
                    comment?: string;
                };

                const updates: string[] = [];

                // Update issue fields if provided
                if (title || body || labels) {
                    const editArgs = [
                        "issue", "edit",
                        String(issueNumber),
                        "--repo", repo
                    ];

                    if (title) {
                        editArgs.push("--title", `"${title.replace(/"/g, '\\"')}"`);
                        updates.push("title");
                    }

                    if (body) {
                        editArgs.push("--body", `"${body.replace(/"/g, '\\"')}"`);
                        updates.push("body");
                    }

                    if (labels) {
                        editArgs.push("--add-label", labels);
                        updates.push("labels");
                    }

                    await runGhCommand(editArgs);
                }

                // Add comment if provided
                if (comment) {
                    const commentArgs = [
                        "issue", "comment",
                        String(issueNumber),
                        "--repo", repo,
                        "--body", `"${comment.replace(/"/g, '\\"')}"`
                    ];

                    await runGhCommand(commentArgs);
                    updates.push("comment added");
                }

                if (updates.length === 0) {
                    return createSuccessResult({
                        message: "No updates provided",
                        issueNumber: issueNumber
                    });
                }

                return createSuccessResult({
                    message: `Issue #${issueNumber} updated successfully`,
                    updates: updates,
                    repository: repo
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
