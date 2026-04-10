import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetProjectStatusOptionsInputSchema } from "./schemas.js";
import { getProjectFields } from "./graphql.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "get-project-status-options";
const toolConfig = {
    title: "Get Project Status Options",
    description: "Return all available Status column option names for a GitHub Projects V2 board. Use this before setting a Status field value so you know the exact valid option names.",
    inputSchema: GetProjectStatusOptionsInputSchema
};

/**
 * Registers the get-project-status-options tool with the MCP server.
 */
export function registerGetProjectStatusOptionsTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        toolConfig,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { owner, projectNumber } = args as {
                    owner: string;
                    projectNumber: number;
                };

                const { fields } = await getProjectFields(owner, projectNumber);
                const statusField = fields.find(
                    (f) => f.name === "Status" && f.dataType === "SINGLE_SELECT"
                );

                if (!statusField) {
                    return createSuccessResult({
                        owner,
                        projectNumber,
                        statusOptions: [],
                        message: "No Status field found on this project.",
                    });
                }

                return createSuccessResult({
                    owner,
                    projectNumber,
                    statusFieldId: statusField.id,
                    statusOptions: (statusField.options ?? []).map((o) => ({
                        id: o.id,
                        name: o.name,
                    })),
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
