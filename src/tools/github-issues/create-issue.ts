import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateIssueInputSchema } from "./schemas.js";
import { runGhCommand } from "./gh-cli.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "create-issue";
const config = {
    title: "Create Issue",
    description: "Create a new GitHub issue with title, body, and optional labels",
    inputSchema: CreateIssueInputSchema
};

/**
 * Registers the create-issue tool with the MCP server.
 */
export function registerCreateIssueTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { repo, title, body, labels } = args as {
                    repo: string;
                    title: string;
                    body?: string;
                    labels?: string;
                };

                const ghArgs = [
                    "issue", "create",
                    "--repo", repo,
                    "--title", `"${title.replace(/"/g, '\\"')}"`
                ];

                if (body) {
                    ghArgs.push("--body", `"${body.replace(/"/g, '\\"')}"`);
                }

                if (labels) {
                    ghArgs.push("--label", labels);
                }

                const output = await runGhCommand(ghArgs);

                // gh issue create returns the URL of the created issue
                const issueUrl = output.trim();
                const issueNumber = issueUrl.split("/").pop();

                return createSuccessResult({
                    message: `Issue #${issueNumber} created successfully`,
                    url: issueUrl,
                    title: title
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
