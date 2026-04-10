import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListProjectItemsInputSchema } from "./schemas.js";
import { listProjectItems } from "./graphql.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "list-project-items";
const toolConfig = {
    title: "List Project Items",
    description: "List all items on a GitHub Projects V2 board, grouped by Status column, with their current field values and issue numbers. Gives a full board snapshot.",
    inputSchema: ListProjectItemsInputSchema
};

/**
 * Registers the list-project-items tool with the MCP server.
 */
export function registerListProjectItemsTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        toolConfig,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { owner, projectNumber } = args as {
                    owner: string;
                    projectNumber: number;
                };

                const items = await listProjectItems(owner, projectNumber);

                // Group items by Status for easy reading
                const byStatus: Record<string, typeof items> = {};
                for (const item of items) {
                    const status = (item.fieldValues["Status"] as string) ?? "(no status)";
                    if (!byStatus[status]) byStatus[status] = [];
                    byStatus[status].push(item);
                }

                return createSuccessResult({
                    owner,
                    projectNumber,
                    totalItems: items.length,
                    byStatus,
                    items,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
