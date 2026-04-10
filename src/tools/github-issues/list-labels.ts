import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListLabelsInputSchema } from "./schemas.js";
import { createOctokitClient, parseRepo } from "./octokit.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "list-labels";
const toolConfig = {
    title: "List Labels",
    description: "List all labels defined in a GitHub repository, including their name, color, and description",
    inputSchema: ListLabelsInputSchema
};

/**
 * Registers the list-labels tool with the MCP server.
 */
export function registerListLabelsTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        toolConfig,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { repo } = args as { repo: string };
                const { owner, repo: repoName } = parseRepo(repo);
                const octokit = createOctokitClient();

                const response = await octokit.rest.issues.listLabelsForRepo({
                    owner,
                    repo: repoName,
                    per_page: 100,
                });

                const labels = response.data.map((l) => ({
                    name: l.name,
                    color: l.color,
                    description: l.description ?? "",
                }));

                return createSuccessResult({
                    repository: repo,
                    count: labels.length,
                    labels,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
